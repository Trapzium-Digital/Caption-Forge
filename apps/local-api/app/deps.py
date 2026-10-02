from __future__ import annotations

from fastapi import Request

from .config import Settings
from .db import Database
from .jobs import JobQueue


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_queue(request: Request) -> JobQueue:
    return request.app.state.queue
