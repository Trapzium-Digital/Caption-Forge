"""Reusable caption-style templates (e.g. a saved Bold Pop look)."""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import Database
from ..deps import get_db
from ..jobs import now_iso

router = APIRouter(prefix="/api/templates", tags=["templates"])


class TemplateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    styleId: str = Field(..., min_length=1, max_length=64)
    config: Dict[str, Any]
    parentId: Optional[str] = None


class TemplatePatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    config: Optional[Dict[str, Any]] = None


class DuplicateBody(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    variant: bool = False


def _serialize(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "styleId": row["style_id"],
        "parentId": row["parent_id"],
        "config": json.loads(row["config"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _get(db: Database, template_id: str):
    row = db.query_one("SELECT * FROM templates WHERE id = ?", (template_id,))
    if row is None:
        raise HTTPException(404, "Template not found")
    return row


def _insert(db: Database, name: str, style_id: str, config: dict, parent_id: Optional[str]) -> dict:
    template_id = f"tpl_{uuid.uuid4().hex[:16]}"
    ts = now_iso()
    db.execute(
        "INSERT INTO templates (id, name, style_id, parent_id, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (template_id, name.strip(), style_id, parent_id, json.dumps(config), ts, ts),
    )
    return _serialize(_get(db, template_id))


@router.get("")
def list_templates(db: Database = Depends(get_db)) -> list:
    return [_serialize(r) for r in db.query("SELECT * FROM templates ORDER BY updated_at DESC")]


@router.post("", status_code=201)
def create_template(body: TemplateBody, db: Database = Depends(get_db)) -> dict:
    if body.parentId:
        _get(db, body.parentId)
    return _insert(db, body.name, body.styleId, body.config, body.parentId)


@router.put("/{template_id}")
def update_template(template_id: str, body: TemplatePatch, db: Database = Depends(get_db)) -> dict:
    row = _get(db, template_id)
    db.execute(
        "UPDATE templates SET name = ?, config = ?, updated_at = ? WHERE id = ?",
        (
            (body.name or row["name"]).strip(),
            json.dumps(body.config) if body.config is not None else row["config"],
            now_iso(),
            template_id,
        ),
    )
    return _serialize(_get(db, template_id))


@router.post("/{template_id}/duplicate", status_code=201)
def duplicate_template(template_id: str, body: DuplicateBody, db: Database = Depends(get_db)) -> dict:
    """Duplicate = independent copy. Variant = copy that remembers the template it came from."""
    row = _get(db, template_id)
    name = body.name or f"{row['name']} {'variant' if body.variant else 'copy'}"
    parent = template_id if body.variant else row["parent_id"]
    return _insert(db, name, row["style_id"], json.loads(row["config"]), parent)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Database = Depends(get_db)) -> None:
    _get(db, template_id)
    db.execute("UPDATE templates SET parent_id = NULL WHERE parent_id = ?", (template_id,))
    db.execute("DELETE FROM templates WHERE id = ?", (template_id,))
