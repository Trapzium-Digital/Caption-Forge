from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import Settings
from ..deps import get_queue, get_settings
from ..jobs import JobQueue
from ..security import ensure_within

router = APIRouter(prefix="/api", tags=["jobs"])


class JobRequest(BaseModel):
    projectId: Optional[str] = None
    payload: Dict[str, Any] = {}


def _enqueue(queue: JobQueue, kind: str, body: JobRequest) -> dict:
    return queue.enqueue(kind, body.payload, body.projectId)


@router.get("/jobs")
def list_jobs(project_id: Optional[str] = Query(None, alias="projectId"), queue: JobQueue = Depends(get_queue)) -> list:
    return queue.list(project_id)


@router.get("/jobs/{job_id}")
def get_job(job_id: str, queue: JobQueue = Depends(get_queue)) -> dict:
    job = queue.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


@router.delete("/jobs/{job_id}")
def cancel_job(job_id: str, queue: JobQueue = Depends(get_queue)) -> dict:
    job = queue.cancel(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


# Named entry points from the master plan. They share the job queue.
@router.post("/transcriptions", status_code=202)
def create_transcription(body: JobRequest, queue: JobQueue = Depends(get_queue)) -> dict:
    return _enqueue(queue, "transcription", body)


@router.post("/renders", status_code=202)
def create_render(body: JobRequest, queue: JobQueue = Depends(get_queue)) -> dict:
    if not body.projectId:
        raise HTTPException(422, "projectId is required")
    return queue.enqueue("render", {**body.payload, "projectId": body.projectId}, body.projectId)


@router.get("/renders/{job_id}/file")
def render_file(job_id: str, queue: JobQueue = Depends(get_queue), settings: Settings = Depends(get_settings)) -> FileResponse:
    job = queue.get(job_id)
    if job is None or job["kind"] != "render" or job["status"] != "complete" or not job["result"]:
        raise HTTPException(404, "Render not available")
    path = ensure_within(settings.dir("renders"), settings.dir("renders") / job["result"]["file"])
    if not path.exists():
        raise HTTPException(404, "Render file was removed")
    return FileResponse(path, filename=f"captionforge-{job_id}{path.suffix}")
