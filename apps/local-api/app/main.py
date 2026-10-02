"""CaptionForge local API.

Run:  python -m uvicorn app.main:app --host 127.0.0.1 --port 8756
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI

from .config import API_VERSION, Settings, default_home
from .db import Database
from .jobs import JobQueue
from .routes import ai, jobs, media, projects, system, templates
from .security import load_or_create_token, make_guard
from .static import mount_web_app, static_dir
from .workers import register_workers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(home: Optional[Path] = None, start_workers: bool = True) -> FastAPI:
    settings = Settings(home=home or default_home())
    settings.ensure_dirs()
    token = load_or_create_token(settings.token_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(settings.database_path)
        queue = JobQueue(db)
        register_workers(queue, settings)
        app.state.settings = settings
        app.state.db = db
        app.state.queue = queue
        app.state.token = token
        if start_workers:
            queue.start()
        try:
            yield
        finally:
            if start_workers:
                queue.stop()
            db.close()

    app = FastAPI(title="CaptionForge Local API", version=API_VERSION, lifespan=lifespan)
    app.middleware("http")(make_guard(token))
    for module in (system, projects, media, jobs, templates, ai):
        app.include_router(module.router)
    web = static_dir()
    if web is not None:  # production / packaged mode: serve the built web app too
        mount_web_app(app, web)
    return app


app = create_app()
