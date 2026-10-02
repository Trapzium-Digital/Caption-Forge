from __future__ import annotations

import json
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import Settings
from ..db import Database
from ..deps import get_db, get_settings
from ..jobs import now_iso

router = APIRouter(prefix="/api/projects", tags=["projects"])

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
CHECKPOINT_INTERVAL = timedelta(minutes=5)
MAX_VERSIONS = 50


class ProjectBody(BaseModel):
    document: Dict[str, Any]
    reason: Optional[str] = None  # "autosave" | "manual" | "import"


def _validate(document: dict) -> tuple:
    """Structural checks only; the full schema lives in @captionforge/project-format."""
    if document.get("format") != "cfproject":
        raise HTTPException(422, "Document is not a CaptionForge project")
    project_id = document.get("id")
    name = document.get("name")
    if not isinstance(project_id, str) or not ID_PATTERN.match(project_id):
        raise HTTPException(422, "Invalid project id")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(422, "Project name is required")
    return project_id, name.strip()[:200]


def _summary(row) -> dict:
    doc = json.loads(row["document"])
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "primaryVideoId": doc.get("primaryVideoId"),
        "cueCount": sum(len(t.get("cues", [])) for t in doc.get("captionTracks", [])),
    }


def _checkpoint(conn, project_id: str, document: str, reason: str, force: bool) -> None:
    last = conn.execute(
        "SELECT created_at FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT 1", (project_id,)
    ).fetchone()
    due = last is None or datetime.fromisoformat(last["created_at"]) < datetime.now(timezone.utc) - CHECKPOINT_INTERVAL
    if not (force or due):
        return
    conn.execute(
        "INSERT INTO project_versions (project_id, created_at, reason, document) VALUES (?, ?, ?, ?)",
        (project_id, now_iso(), reason, document),
    )
    conn.execute(
        "DELETE FROM project_versions WHERE project_id = ? AND id NOT IN"
        " (SELECT id FROM project_versions WHERE project_id = ? ORDER BY id DESC LIMIT ?)",
        (project_id, project_id, MAX_VERSIONS),
    )


@router.get("")
def list_projects(db: Database = Depends(get_db)) -> list:
    rows = db.query("SELECT * FROM projects ORDER BY updated_at DESC")
    return [_summary(r) for r in rows]


@router.post("", status_code=201)
def create_project(body: ProjectBody, db: Database = Depends(get_db)) -> dict:
    project_id, name = _validate(body.document)
    ts = now_iso()
    doc = json.dumps({**body.document, "updatedAt": ts})
    with db.transaction() as conn:
        if conn.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone():
            raise HTTPException(409, "A project with this id already exists")
        conn.execute(
            "INSERT INTO projects (id, name, created_at, updated_at, document) VALUES (?, ?, ?, ?, ?)",
            (project_id, name, body.document.get("createdAt") or ts, ts, doc),
        )
        _checkpoint(conn, project_id, doc, body.reason or "created", force=True)
    return json.loads(doc)


@router.get("/{project_id}")
def get_project(project_id: str, db: Database = Depends(get_db)) -> dict:
    row = db.query_one("SELECT document FROM projects WHERE id = ?", (project_id,))
    if row is None:
        raise HTTPException(404, "Project not found")
    return json.loads(row["document"])


@router.put("/{project_id}")
def save_project(project_id: str, body: ProjectBody, db: Database = Depends(get_db)) -> dict:
    doc_id, name = _validate(body.document)
    if doc_id != project_id:
        raise HTTPException(422, "Project id does not match URL")
    ts = now_iso()
    doc = json.dumps({**body.document, "updatedAt": ts})
    with db.transaction() as conn:
        updated = conn.execute(
            "UPDATE projects SET name = ?, updated_at = ?, document = ? WHERE id = ?", (name, ts, doc, project_id)
        ).rowcount
        if not updated:
            raise HTTPException(404, "Project not found")
        _checkpoint(conn, project_id, doc, body.reason or "autosave", force=body.reason == "manual")
    return {"id": project_id, "updatedAt": ts}


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Database = Depends(get_db), settings: Settings = Depends(get_settings)) -> None:
    from .media import remove_media_files

    media_rows = db.query("SELECT id, stored_path FROM media_assets WHERE project_id = ?", (project_id,))
    with db.transaction() as conn:
        # Media rows first: deleting the project first would null their project_id (ON DELETE SET NULL)
        # and leave orphaned rows and files behind.
        conn.execute("DELETE FROM media_assets WHERE project_id = ?", (project_id,))
        if not conn.execute("DELETE FROM projects WHERE id = ?", (project_id,)).rowcount:
            raise HTTPException(404, "Project not found")
    remove_media_files(db, settings, media_rows)


class DuplicateBody(BaseModel):
    name: Optional[str] = None


@router.post("/{project_id}/duplicate", status_code=201)
def duplicate_project(
    project_id: str, body: DuplicateBody, db: Database = Depends(get_db), settings: Settings = Depends(get_settings)
) -> dict:
    """Copy a project. Media files are shared (not copied); each copy gets its own media ids."""
    row = db.query_one("SELECT document FROM projects WHERE id = ?", (project_id,))
    if row is None:
        raise HTTPException(404, "Project not found")
    doc = json.loads(row["document"])
    new_id = f"proj_{uuid.uuid4().hex[:16]}"
    ts = now_iso()
    name = (body.name or f"{doc.get('name', 'Untitled')} (copy)").strip()[:200]
    id_map: Dict[str, str] = {}
    media_rows = db.query("SELECT * FROM media_assets WHERE project_id = ?", (project_id,))
    for m in media_rows:
        id_map[m["id"]] = f"media_{uuid.uuid4().hex[:16]}"
    remap = lambda value: id_map.get(value, value)  # noqa: E731
    doc.update(id=new_id, name=name, createdAt=ts, updatedAt=ts)
    doc["media"] = [{**m, "id": remap(m["id"])} for m in doc.get("media", [])]
    if doc.get("primaryVideoId"):
        doc["primaryVideoId"] = remap(doc["primaryVideoId"])
    doc["audioTracks"] = [{**a, "mediaId": remap(a["mediaId"])} for a in doc.get("audioTracks", [])]
    text = json.dumps(doc)
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO projects (id, name, created_at, updated_at, document) VALUES (?, ?, ?, ?, ?)",
            (new_id, name, ts, ts, text),
        )
        for m in media_rows:
            conn.execute(
                "INSERT INTO media_assets (id, project_id, kind, original_name, stored_path, size_bytes, sha256, metadata, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (id_map[m["id"]], new_id, m["kind"], m["original_name"], m["stored_path"], m["size_bytes"], m["sha256"], m["metadata"], ts),
            )
        _checkpoint(conn, new_id, text, "duplicated", force=True)
    # Derived files (waveform, thumbnail) are small - copy them for the new media ids.
    for old, new in id_map.items():
        for folder, ext in (("waveforms", "json"), ("thumbnails", "jpg")):
            src = settings.dir(folder) / f"{old}.{ext}"
            if src.exists():
                shutil.copyfile(src, settings.dir(folder) / f"{new}.{ext}")
    return _summary(db.query_one("SELECT * FROM projects WHERE id = ?", (new_id,)))


@router.get("/{project_id}/versions")
def list_versions(project_id: str, db: Database = Depends(get_db)) -> list:
    rows = db.query(
        "SELECT id, created_at, reason FROM project_versions WHERE project_id = ? ORDER BY id DESC", (project_id,)
    )
    return [{"id": r["id"], "createdAt": r["created_at"], "reason": r["reason"]} for r in rows]


@router.get("/{project_id}/versions/{version_id}")
def get_version(project_id: str, version_id: int, db: Database = Depends(get_db)) -> dict:
    row = db.query_one(
        "SELECT document FROM project_versions WHERE project_id = ? AND id = ?", (project_id, version_id)
    )
    if row is None:
        raise HTTPException(404, "Version not found")
    return json.loads(row["document"])
