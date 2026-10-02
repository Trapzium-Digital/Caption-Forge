"""Local API protection.

The API only listens on 127.0.0.1, but any website open in the user's browser
could still try to call it. Every /api request must therefore carry the local
token (header or cookie) and a localhost Host header (blocks DNS rebinding).
"""
from __future__ import annotations

import hmac
import os
import re
import secrets
import unicodedata
from pathlib import Path

from starlette.requests import Request
from starlette.responses import JSONResponse

TOKEN_HEADER = "x-captionforge-token"
TOKEN_COOKIE = "captionforge_token"
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "testserver"}
PUBLIC_PATHS = {"/api/health"}


def load_or_create_token(path: Path) -> str:
    if path.exists():
        token = path.read_text().strip()
        if len(token) >= 32:
            return token
    token = secrets.token_urlsafe(32)
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(token)
    return token


def make_guard(token: str):
    async def guard(request: Request, call_next):
        host = (request.headers.get("host") or "").split(":")[0]
        if host not in ALLOWED_HOSTS:
            return JSONResponse({"detail": "Forbidden host"}, status_code=403)
        path = request.url.path
        if path.startswith("/api/") and path not in PUBLIC_PATHS:
            supplied = request.headers.get(TOKEN_HEADER) or request.cookies.get(TOKEN_COOKIE) or ""
            if not hmac.compare_digest(supplied, token):
                return JSONResponse({"detail": "Missing or invalid local API token"}, status_code=401)
        return await call_next(request)

    return guard


_UNSAFE = re.compile(r"[^A-Za-z0-9._ -]+")


def sanitize_filename(name: str, fallback: str = "file") -> str:
    """Reduce an uploaded filename to a safe display/storage name (no paths)."""
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = Path(name.replace("\\", "/")).name
    name = _UNSAFE.sub("_", name).strip(" .")
    return (name or fallback)[:120]


def ensure_within(base: Path, candidate: Path) -> Path:
    """Resolve candidate and refuse anything outside base."""
    resolved = candidate.resolve()
    if base.resolve() not in (resolved, *resolved.parents):
        raise ValueError("Path escapes the CaptionForge workspace")
    return resolved
