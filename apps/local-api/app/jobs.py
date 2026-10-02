"""SQLite-backed local job queue.

Jobs persist in the database so they survive restarts: anything that was
running when the app stopped is put back in the queue on startup.
"""
from __future__ import annotations

import json
import logging
import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from .db import Database

log = logging.getLogger("captionforge.jobs")

TERMINAL = {"complete", "failed", "cancelled"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobCancelled(Exception):
    pass


class JobUnavailable(Exception):
    """The runtime needed for this job kind is not installed yet."""


class JobContext:
    def __init__(self, queue: "JobQueue", job_id: str, payload: dict) -> None:
        self.queue = queue
        self.id = job_id
        self.payload = payload

    def cancel_requested(self) -> bool:
        row = self.queue.db.query_one("SELECT cancel_requested FROM jobs WHERE id = ?", (self.id,))
        return bool(row and row["cancel_requested"])

    def report(self, stage: str, progress: float) -> None:
        """Update stage/progress and raise if the user asked to cancel."""
        row = self.queue.db.query_one("SELECT cancel_requested FROM jobs WHERE id = ?", (self.id,))
        if row and row["cancel_requested"]:
            raise JobCancelled()
        self.queue.db.execute(
            "UPDATE jobs SET stage = ?, progress = ?, updated_at = ? WHERE id = ?",
            (stage, max(0.0, min(1.0, progress)), now_iso(), self.id),
        )


Handler = Callable[[JobContext], Optional[dict]]


def serialize(row) -> dict:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "status": row["status"],
        "stage": row["stage"],
        "progress": row["progress"],
        "payload": json.loads(row["payload"]),
        "result": json.loads(row["result"]) if row["result"] else None,
        "error": row["error"],
        "projectId": row["project_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


class JobQueue:
    def __init__(self, db: Database, workers: int = 2) -> None:
        self.db = db
        self.handlers: Dict[str, Handler] = {}
        self._wake = threading.Condition()
        self._stop = False
        self._threads = [threading.Thread(target=self._run, name=f"cf-worker-{i}", daemon=True) for i in range(workers)]

    def register(self, kind: str, handler: Handler) -> None:
        self.handlers[kind] = handler

    def start(self) -> None:
        # Recover jobs interrupted by a shutdown or crash.
        self.db.execute(
            "UPDATE jobs SET status = 'queued', stage = 'queued', progress = 0, updated_at = ? WHERE status = 'running'",
            (now_iso(),),
        )
        for t in self._threads:
            t.start()

    def stop(self) -> None:
        with self._wake:
            self._stop = True
            self._wake.notify_all()
        for t in self._threads:
            t.join(timeout=5)

    def enqueue(self, kind: str, payload: dict, project_id: Optional[str] = None) -> dict:
        if kind not in self.handlers:
            raise KeyError(kind)
        job_id = f"job_{uuid.uuid4().hex[:16]}"
        ts = now_iso()
        self.db.execute(
            "INSERT INTO jobs (id, kind, status, stage, progress, payload, project_id, created_at, updated_at)"
            " VALUES (?, ?, 'queued', 'queued', 0, ?, ?, ?, ?)",
            (job_id, kind, json.dumps(payload), project_id, ts, ts),
        )
        with self._wake:
            self._wake.notify()
        return self.get(job_id)  # type: ignore[return-value]

    def get(self, job_id: str) -> Optional[dict]:
        row = self.db.query_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
        return serialize(row) if row else None

    def list(self, project_id: Optional[str] = None, limit: int = 100) -> list:
        if project_id:
            rows = self.db.query(
                "SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?", (project_id, limit)
            )
        else:
            rows = self.db.query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,))
        return [serialize(r) for r in rows]

    def cancel(self, job_id: str) -> Optional[dict]:
        ts = now_iso()
        with self.db.transaction() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'cancelled', stage = 'cancelled', updated_at = ? WHERE id = ? AND status = 'queued'",
                (ts, job_id),
            )
            conn.execute(
                "UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND status = 'running'",
                (ts, job_id),
            )
        return self.get(job_id)

    def _claim(self) -> Optional[Any]:
        with self.db.transaction() as conn:
            row = conn.execute(
                "SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1"
            ).fetchone()
            if row is None:
                return None
            conn.execute(
                "UPDATE jobs SET status = 'running', stage = 'preparing', updated_at = ? WHERE id = ?",
                (now_iso(), row["id"]),
            )
            return row

    def _finish(self, job_id: str, status: str, result: Optional[dict] = None, error: Optional[str] = None) -> None:
        self.db.execute(
            "UPDATE jobs SET status = ?, stage = ?, progress = CASE WHEN ? = 'complete' THEN 1 ELSE progress END,"
            " result = ?, error = ?, updated_at = ? WHERE id = ?",
            (status, status, status, json.dumps(result) if result is not None else None, error, now_iso(), job_id),
        )

    def _run(self) -> None:
        while True:
            with self._wake:
                if self._stop:
                    return
            row = self._claim()
            if row is None:
                with self._wake:
                    if self._stop:
                        return
                    self._wake.wait(timeout=1.0)
                continue
            job_id = row["id"]
            handler = self.handlers.get(row["kind"])
            ctx = JobContext(self, job_id, json.loads(row["payload"]))
            try:
                if handler is None:
                    raise JobUnavailable(f"No worker registered for '{row['kind']}'")
                result = handler(ctx)
                self._finish(job_id, "complete", result=result)
            except JobCancelled:
                self._finish(job_id, "cancelled")
            except JobUnavailable as exc:
                self._finish(job_id, "failed", error=str(exc))
            except Exception as exc:  # noqa: BLE001 - job failures must not kill the worker
                log.error("Job %s failed\n%s", job_id, traceback.format_exc())
                self._finish(job_id, "failed", error=str(exc) or exc.__class__.__name__)
