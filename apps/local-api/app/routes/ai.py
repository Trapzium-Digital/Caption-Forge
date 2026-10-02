"""AI caption settings and model catalog."""
from __future__ import annotations

import json
import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import Settings
from ..db import Database
from ..deps import get_db, get_settings
from ..jobs import JobQueue
from ..deps import get_queue
from ..services import ai

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AiSettingsBody(BaseModel):
    hfToken: Optional[str] = Field(None, max_length=200)


def _get(db: Database, key: str):
    row = db.query_one("SELECT value FROM app_settings WHERE key = ?", (key,))
    return json.loads(row["value"]) if row else None


@router.get("")
def ai_status(settings: Settings = Depends(get_settings), db: Database = Depends(get_db)) -> dict:
    versions = ai.versions()
    return {
        "available": ai.ai_available(),
        "versions": versions,
        "device": "Apple Silicon CPU" if versions else None,
        "models": ai.catalog(settings.dir("models")),
        "hfTokenSet": bool(_get(db, "hfToken")),
    }


_languages_cache: dict = {"at": 0.0, "value": None}


@router.get("/translate/languages")
def translate_languages(refresh: bool = False, settings: Settings = Depends(get_settings)) -> dict:
    """Languages Argos Translate can work with offline (index cached for a day)."""
    if not ai.ai_available():
        raise HTTPException(503, "Local AI runtime is not installed (run: npm run setup:ai)")
    if refresh or _languages_cache["value"] is None or time.time() - _languages_cache["at"] > 86400:
        name = uuid.uuid4().hex[:12]
        output = settings.dir("cache") / f"languages-{name}.json"
        job_file = settings.dir("cache") / f"languages-{name}-job.json"
        job_file.write_text(json.dumps({"modelsDir": str(settings.dir("models")), "output": str(output), "refresh": refresh}))
        try:
            ai.run_translation("languages", job_file, lambda e: None, lambda: False)
            _languages_cache.update(at=time.time(), value=json.loads(output.read_text()))
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, f"Could not load the language list: {exc}") from exc
        finally:
            job_file.unlink(missing_ok=True)
            output.unlink(missing_ok=True)
    return _languages_cache["value"]


class TranslateBody(BaseModel):
    projectId: str
    sourceLanguage: str = Field(..., min_length=2, max_length=10)
    targetLanguage: str = Field(..., min_length=2, max_length=10)
    texts: List[str]


@router.post("/translations", status_code=202)
def start_translation(body: TranslateBody, queue: JobQueue = Depends(get_queue)) -> dict:
    if body.sourceLanguage == body.targetLanguage:
        raise HTTPException(422, "Source and target language are the same")
    _languages_cache["at"] = 0.0  # a new pack may get installed
    return queue.enqueue("translation", {"from": body.sourceLanguage, "to": body.targetLanguage, "texts": body.texts}, body.projectId)


@router.post("/install", status_code=202)
def install_ai(queue: JobQueue = Depends(get_queue)) -> dict:
    """'Enable AI captions': download and install the AI runtime (~1.1 GB) in the background."""
    running = [j for j in queue.list(limit=20) if j["kind"] == "ai-install" and j["status"] in ("queued", "running")]
    if running:
        return running[0]
    return queue.enqueue("ai-install", {})


@router.put("/settings")
def save_settings(body: AiSettingsBody, db: Database = Depends(get_db)) -> dict:
    """Stored only in the local database; used only to download the speaker-detection model."""
    token = (body.hfToken or "").strip()
    if token:
        db.execute(
            "INSERT INTO app_settings (key, value) VALUES ('hfToken', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (json.dumps(token),),
        )
    else:
        db.execute("DELETE FROM app_settings WHERE key = 'hfToken'")
    return {"hfTokenSet": bool(token)}
