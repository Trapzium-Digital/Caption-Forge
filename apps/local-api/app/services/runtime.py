"""Detect the local runtime components CaptionForge depends on."""
from __future__ import annotations

import importlib.util
import platform
import shutil
import sqlite3
import subprocess
import sys
from typing import Optional

from ..config import API_VERSION


def _version(cmd: list[str]) -> Optional[str]:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    line = (out.stdout or out.stderr).strip().splitlines()
    return line[0] if line else None


def _component(name: str, ok: bool, version: Optional[str], required: bool, fix: str, milestone: Optional[str] = None) -> dict:
    return {
        "name": name,
        "ok": ok,
        "version": version,
        "required": required,
        "fix": None if ok else fix,
        "milestone": milestone,
    }


def binary(name: str) -> Optional[str]:
    return shutil.which(name)


def _remotion_ok() -> bool:
    from .render import renderer_available

    return renderer_available()


def _remotion_version() -> Optional[str]:
    import json
    from .render import renderer_dir

    for base in (renderer_dir(), *renderer_dir().parents):
        pkg = base / "node_modules" / "remotion" / "package.json"
        if pkg.exists():
            return json.loads(pkg.read_text()).get("version")
    return None


def detect() -> dict:
    ffmpeg = binary("ffmpeg")
    ffprobe = binary("ffprobe")
    node = binary("node")
    py_ok = sys.version_info >= (3, 9)
    # WhisperX + PyTorch live in their own runtime (runtime/ai, Python 3.12).
    from .ai import versions as _ai_versions

    ai_versions = _ai_versions()

    components = [
        _component("Python", py_ok, platform.python_version(), True, "Install Python 3.9 or newer"),
        _component("SQLite", True, sqlite3.sqlite_version, True, ""),
        _component(
            "FFmpeg",
            ffmpeg is not None,
            _version([ffmpeg, "-version"]) if ffmpeg else None,
            True,
            "Install FFmpeg (macOS: brew install ffmpeg)",
        ),
        _component(
            "FFprobe",
            ffprobe is not None,
            _version([ffprobe, "-version"]) if ffprobe else None,
            True,
            "FFprobe ships with FFmpeg (macOS: brew install ffmpeg)",
        ),
        _component(
            "Node.js",
            node is not None,
            _version([node, "--version"]) if node else None,
            False,
            "Install Node.js 20 or newer (needed for Remotion rendering)",
            "v33",
        ),
        _component(
            "Remotion",
            _remotion_ok(),
            _remotion_version(),
            False,
            "Run npm install in the CaptionForge folder (needs Node.js)",
        ),
        _component("PyTorch", bool(ai_versions), (ai_versions or {}).get("torch"), False, "Run: npm run setup:ai"),
        _component("WhisperX", bool(ai_versions), (ai_versions or {}).get("whisperx"), False, "Run: npm run setup:ai"),
    ]
    return {
        "apiVersion": API_VERSION,
        "platform": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "ready": all(c["ok"] for c in components if c["required"]),
        "components": components,
    }
