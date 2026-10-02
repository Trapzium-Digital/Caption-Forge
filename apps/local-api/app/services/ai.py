"""Local AI runtime (WhisperX in runtime/ai) - detection, model catalog, transcription."""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Callable, Optional

from .media import MediaError

REPO = Path(__file__).resolve().parents[4]
# The installed app ships the workers elsewhere (CAPTIONFORGE_AI_WORKERS).
WORKERS_DIR = Path(os.environ.get("CAPTIONFORGE_AI_WORKERS") or REPO / "apps" / "ai-worker")
WORKER = WORKERS_DIR / "transcribe.py"
TRANSLATE_WORKER = WORKERS_DIR / "translate.py"

# name, label, approximate download size (MB), relative speed / accuracy notes
MODELS = [
    {"name": "small", "label": "Small", "sizeMb": 480, "note": "Fast, good for clear speech"},
    {"name": "medium", "label": "Medium", "sizeMb": 1500, "note": "More accurate, slower"},
    {"name": "large-v3-turbo", "label": "Large (Turbo)", "sizeMb": 1600, "note": "Near-best accuracy, quick"},
    {"name": "large-v3", "label": "Large", "sizeMb": 3100, "note": "Best accuracy, slowest"},
]
MODEL_NAMES = {m["name"] for m in MODELS}


def ai_python() -> Path:
    """The AI runtime's Python: explicit override, the workspace runtime (installed by
    'Enable AI captions'), or a legacy runtime/ folder in the repository."""
    override = os.environ.get("CAPTIONFORGE_AI_PYTHON")
    if override:
        return Path(override)
    from ..config import default_home
    from .ai_install import env_python

    workspace = env_python(default_home() / "runtime")
    if workspace.exists():
        return workspace
    legacy = env_python(REPO / "runtime")
    return legacy if legacy.exists() else workspace


def reset_cache() -> None:
    _versions_cache.update(at=0.0, value=None)


_versions_cache: dict = {"at": 0.0, "value": None}


def versions() -> Optional[dict]:
    """Installed WhisperX / PyTorch versions in the AI runtime, or None when it is not set up."""
    if time.time() - _versions_cache["at"] < 60:
        return _versions_cache["value"]
    value = None
    python = ai_python()
    if python.exists():
        out = subprocess.run(
            [
                str(python),
                "-c",
                "import importlib.metadata as m, json; print(json.dumps({p: m.version(p) for p in ('whisperx', 'torch', 'faster-whisper')}))",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if out.returncode == 0:
            try:
                value = json.loads(out.stdout.strip().splitlines()[-1])
            except (ValueError, IndexError):
                value = None
    _versions_cache.update(at=time.time(), value=value)
    return value


def ai_available() -> bool:
    return versions() is not None and WORKER.exists()


def model_installed(models_dir: Path, name: str) -> bool:
    """faster-whisper caches models as models--<org>--faster-whisper-<name> with a snapshot."""
    root = models_dir / "whisper"
    if not root.exists():
        return False
    for entry in root.glob(f"models--*--faster-whisper-{name}"):
        snapshots = entry / "snapshots"
        if snapshots.exists() and any(p.glob("model.bin") for p in snapshots.iterdir()):
            return True
    return False


def catalog(models_dir: Path) -> list:
    return [{**m, "installed": model_installed(models_dir, m["name"])} for m in MODELS]


def run_transcription(job_file: Path, on_event: Callable[[dict], None], should_cancel: Callable[[], bool]) -> None:
    _run_worker([str(WORKER), str(job_file)], on_event, should_cancel, "Transcription")


def run_translation(command: str, job_file: Path, on_event: Callable[[dict], None], should_cancel: Callable[[], bool]) -> None:
    _run_worker([str(TRANSLATE_WORKER), command, str(job_file)], on_event, should_cancel, "Translation")


def _run_worker(args: list, on_event: Callable[[dict], None], should_cancel: Callable[[], bool], what: str) -> None:
    python = ai_python()
    if not python.exists():
        raise MediaError("AI runtime is not installed (run: npm run setup:ai)")
    proc = subprocess.Popen(
        [str(python), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    error: Optional[str] = None
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            if should_cancel():
                proc.terminate()
                break
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("stage") == "error":
                error = event.get("error")
            else:
                on_event(event)
        proc.wait(timeout=60)
    finally:
        if proc.poll() is None:
            proc.kill()
    if should_cancel():
        return
    if proc.returncode != 0:
        if not error and proc.stderr:
            lines = proc.stderr.read().strip().splitlines()
            error = lines[-1] if lines else None
        raise MediaError(f"{what} failed: {error or 'unknown error'}")
