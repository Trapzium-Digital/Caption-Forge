"""SQLite storage with forward-only schema migrations (PRAGMA user_version)."""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

MIGRATIONS = [
    # v1
    """
    CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        document TEXT NOT NULL
    );
    CREATE TABLE project_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        document TEXT NOT NULL
    );
    CREATE INDEX idx_project_versions_project ON project_versions(project_id, id);

    CREATE TABLE media_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        kind TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_media_project ON media_assets(project_id);

    CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT,
        progress REAL NOT NULL DEFAULT 0,
        payload TEXT NOT NULL,
        result TEXT,
        error TEXT,
        project_id TEXT,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_jobs_status ON jobs(status, created_at);

    CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """,
    # v2
    """
    CREATE TABLE templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        style_id TEXT NOT NULL,
        parent_id TEXT,
        config TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_templates_style ON templates(style_id, updated_at);
    """,
]


class Database:
    """One shared connection guarded by a lock; SQLite is plenty for a single local user."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._migrate()

    def _migrate(self) -> None:
        with self._lock:
            version = self._conn.execute("PRAGMA user_version").fetchone()[0]
            for index, script in enumerate(MIGRATIONS[version:], start=version + 1):
                self._conn.executescript(f"BEGIN;\n{script}\nPRAGMA user_version = {index};\nCOMMIT;")

    @property
    def schema_version(self) -> int:
        return self._conn.execute("PRAGMA user_version").fetchone()[0]

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
                self._conn.execute("COMMIT")
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise

    def query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    def query_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def execute(self, sql: str, params: tuple = ()) -> int:
        with self._lock:
            return self._conn.execute(sql, params).rowcount

    def close(self) -> None:
        with self._lock:
            self._conn.close()
