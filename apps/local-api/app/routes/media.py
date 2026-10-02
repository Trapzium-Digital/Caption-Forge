from __future__ import annotations

import hashlib
import json
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from ..config import Settings
from ..db import Database
from ..deps import get_db, get_queue, get_settings
from ..jobs import JobQueue, now_iso
from ..security import ensure_within, sanitize_filename
from ..services import media

router = APIRouter(prefix="/api/media", tags=["media"])


def _serialize(row) -> dict:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "kind": row["kind"],
        "name": row["original_name"],
        "sizeBytes": row["size_bytes"],
        "sha256": row["sha256"],
        "createdAt": row["created_at"],
        **json.loads(row["metadata"]),
    }


def _get_row(db: Database, media_id: str):
    row = db.query_one("SELECT * FROM media_assets WHERE id = ?", (media_id,))
    if row is None:
        raise HTTPException(404, "Media not found")
    return row


@router.post("/import", status_code=201)
async def import_media(
    request: Request,
    filename: str = Query(..., min_length=1, max_length=255),
    project_id: Optional[str] = Query(None, alias="projectId"),
    db: Database = Depends(get_db),
    settings: Settings = Depends(get_settings),
    queue: JobQueue = Depends(get_queue),
) -> dict:
    """Stream the raw request body to the workspace (no temp copy), then validate with ffprobe."""
    safe_name = sanitize_filename(filename)
    ext = Path(safe_name).suffix.lower()
    kind = media.kind_for_extension(ext)
    if kind is None:
        raise HTTPException(415, f"Unsupported file type '{ext or safe_name}'")
    if project_id and not db.query_one("SELECT 1 FROM projects WHERE id = ?", (project_id,)):
        raise HTTPException(404, "Project not found")

    media_id = f"media_{uuid.uuid4().hex[:16]}"
    folder = settings.dir("media") / media_id
    folder.mkdir(parents=True)
    dest = ensure_within(settings.home, folder / f"original{ext}")

    digest = hashlib.sha256()
    size = 0
    try:
        with dest.open("wb") as out:
            async for chunk in request.stream():
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(413, "File is larger than the import limit")
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise HTTPException(422, "File is empty")
        try:
            meta = media.probe(dest)
        except media.MediaError as exc:
            raise HTTPException(422, str(exc)) from exc
        if kind == "video" and not meta["hasVideo"]:
            kind = "audio" if meta["hasAudio"] else kind
        if kind in ("video", "audio") and not (meta["hasVideo"] or meta["hasAudio"]):
            raise HTTPException(422, "File contains no audio or video streams")
    except BaseException:
        shutil.rmtree(folder, ignore_errors=True)
        raise

    db.execute(
        "INSERT INTO media_assets (id, project_id, kind, original_name, stored_path, size_bytes, sha256, metadata, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            media_id, project_id, kind, safe_name,
            str(dest.relative_to(settings.home.resolve())),
            size, digest.hexdigest(), json.dumps(meta), now_iso(),
        ),
    )
    payload = {"mediaId": media_id, "durationMs": meta.get("durationMs")}
    if meta.get("hasAudio"):
        queue.enqueue("waveform", payload, project_id)
    if meta.get("hasVideo") or kind == "image":
        queue.enqueue("thumbnail", payload, project_id)
    return _serialize(_get_row(db, media_id))


@router.get("")
def list_media(project_id: Optional[str] = Query(None, alias="projectId"), db: Database = Depends(get_db)) -> list:
    if project_id:
        rows = db.query("SELECT * FROM media_assets WHERE project_id = ? ORDER BY created_at", (project_id,))
    else:
        rows = db.query("SELECT * FROM media_assets ORDER BY created_at")
    return [_serialize(r) for r in rows]


@router.get("/{media_id}")
def get_media(media_id: str, db: Database = Depends(get_db)) -> dict:
    return _serialize(_get_row(db, media_id))


@router.get("/{media_id}/file")
def media_file(media_id: str, db: Database = Depends(get_db), settings: Settings = Depends(get_settings)) -> FileResponse:
    row = _get_row(db, media_id)
    path = ensure_within(settings.home, settings.home / row["stored_path"])
    return FileResponse(path, filename=row["original_name"], content_disposition_type="inline")


@router.get("/{media_id}/waveform")
def media_waveform(media_id: str, db: Database = Depends(get_db), settings: Settings = Depends(get_settings)) -> FileResponse:
    _get_row(db, media_id)
    path = settings.dir("waveforms") / f"{media_id}.json"
    if not path.exists():
        raise HTTPException(404, "Waveform not ready")
    return FileResponse(path, media_type="application/json")


@router.get("/{media_id}/thumbnail")
def media_thumbnail(media_id: str, db: Database = Depends(get_db), settings: Settings = Depends(get_settings)) -> FileResponse:
    _get_row(db, media_id)
    path = settings.dir("thumbnails") / f"{media_id}.jpg"
    if not path.exists():
        raise HTTPException(404, "Thumbnail not ready")
    return FileResponse(path, media_type="image/jpeg")


def remove_media_files(db: Database, settings: Settings, rows) -> None:
    """Delete files of already-removed media rows. Duplicated projects share the stored
    original, so it is only deleted once no remaining media row points at it."""
    for row in rows:
        if not db.query_one("SELECT 1 FROM media_assets WHERE stored_path = ?", (row["stored_path"],)):
            folder = (settings.home / row["stored_path"]).parent
            if folder.resolve() != settings.dir("media").resolve():
                shutil.rmtree(ensure_within(settings.dir("media"), folder), ignore_errors=True)
        (settings.dir("waveforms") / f"{row['id']}.json").unlink(missing_ok=True)
        (settings.dir("thumbnails") / f"{row['id']}.jpg").unlink(missing_ok=True)


@router.delete("/{media_id}", status_code=204)
def delete_media(media_id: str, db: Database = Depends(get_db), settings: Settings = Depends(get_settings)) -> None:
    row = _get_row(db, media_id)
    db.execute("DELETE FROM media_assets WHERE id = ?", (media_id,))
    remove_media_files(db, settings, [row])
