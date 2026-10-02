"""Paths and settings for the local CaptionForge runtime."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

API_VERSION = "0.32.0"
DEFAULT_PORT = 8756

WORKSPACE_DIRS = (
    "projects",
    "media",
    "fonts",
    "templates",
    "brands",
    "cache",
    "proxies",
    "waveforms",
    "thumbnails",
    "renders",
    "models",
    "logs",
)


def default_home() -> Path:
    """OS application-data directory, overridable with CAPTIONFORGE_HOME."""
    override = os.environ.get("CAPTIONFORGE_HOME")
    if override:
        return Path(override).expanduser()
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "CaptionForge"
    if sys.platform.startswith("win"):
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "CaptionForge"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "CaptionForge"


@dataclass(frozen=True)
class Settings:
    home: Path
    max_upload_bytes: int = 20 * 1024**3  # 20 GB

    @property
    def database_path(self) -> Path:
        return self.home / "database.sqlite"

    @property
    def token_path(self) -> Path:
        return self.home / "api-token"

    def dir(self, name: str) -> Path:
        assert name in WORKSPACE_DIRS, name
        return self.home / name

    def ensure_dirs(self) -> None:
        self.home.mkdir(parents=True, exist_ok=True)
        for name in WORKSPACE_DIRS:
            (self.home / name).mkdir(exist_ok=True)
