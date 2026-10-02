"""Serve the built web app from the local API (production / packaged mode).

The page response sets the local API token as a cookie that is HttpOnly
(scripts cannot read it) and SameSite=Strict (other websites cannot send it),
so the browser can call /api and stream media without the dev proxy.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .security import TOKEN_COOKIE


def static_dir() -> Optional[Path]:
    value = os.environ.get("CAPTIONFORGE_STATIC")
    if not value:
        return None
    path = Path(value)
    return path if (path / "index.html").exists() else None


def mount_web_app(app: FastAPI, root: Path) -> None:
    index = root / "index.html"
    if (root / "assets").exists():
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    def page(request: Request) -> Response:
        response = FileResponse(index, media_type="text/html", headers={"Cache-Control": "no-store"})
        response.set_cookie(TOKEN_COOKIE, request.app.state.token, httponly=True, samesite="strict", path="/")
        return response

    @app.get("/", include_in_schema=False)
    def home(request: Request) -> Response:
        return page(request)

    @app.get("/{path:path}", include_in_schema=False)
    def files(path: str, request: Request) -> Response:
        if path.startswith("api/"):
            return Response(status_code=404)
        candidate = (root / path).resolve()
        if candidate.is_file() and root.resolve() in candidate.parents:
            return FileResponse(candidate)
        return page(request)  # client-side routes
