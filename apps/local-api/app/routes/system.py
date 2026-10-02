from __future__ import annotations

from fastapi import APIRouter, Depends

from ..config import API_VERSION, Settings
from ..db import Database
from ..deps import get_db, get_settings
from ..services import runtime

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "version": API_VERSION}


@router.get("/runtime")
def runtime_status(settings: Settings = Depends(get_settings), db: Database = Depends(get_db)) -> dict:
    status = runtime.detect()
    status["workspace"] = str(settings.home)
    status["databaseSchema"] = db.schema_version
    return status
