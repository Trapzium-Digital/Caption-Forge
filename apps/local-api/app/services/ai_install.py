"""Install the optional AI runtime (WhisperX + PyTorch + Argos Translate).

One implementation used by the in-app "Enable AI captions" button, by
`npm run setup:ai`, and by the packaged app - on macOS, Windows and Linux.

Layout (inside the CaptionForge workspace, so packaged apps can write to it):
    <home>/runtime/python   private Python 3.12 (WhisperX needs >= 3.10)
    <home>/runtime/ai       virtual environment with the AI packages
Nothing is installed system-wide. Uses `uv` for fast, resumable installs.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable, Optional

AI_PACKAGES = ["whisperx==3.8.6", "argostranslate==1.11.0"]
PYTHON_VERSION = "3.12"
WINDOWS = sys.platform.startswith("win")


class InstallError(Exception):
    pass


def env_python(runtime: Path) -> Path:
    return runtime / "ai" / ("Scripts/python.exe" if WINDOWS else "bin/python")


def _uv() -> Path:
    """uv lives next to the API's Python (installed into its environment on first use)."""
    base = Path(sys.executable).parent
    name = "uv.exe" if WINDOWS else "uv"
    # venvs keep tools next to python; a standalone Windows Python keeps them in Scripts\
    candidates = [base / name, base / "Scripts" / name]
    if not any(c.exists() for c in candidates):
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "uv"], check=True, capture_output=True)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise InstallError("Could not install the uv package manager")


def install(
    runtime: Path,
    on_event: Callable[[str, float, str], None],
    should_cancel: Callable[[], bool] = lambda: False,
) -> dict:
    """Install the AI runtime into `runtime`. Calls on_event(stage, progress 0..1, message)."""
    runtime.mkdir(parents=True, exist_ok=True)
    env = {
        **os.environ,
        "UV_PYTHON_INSTALL_DIR": str(runtime / "python"),
        "UV_HTTP_TIMEOUT": "300",
        "NO_COLOR": "1",
    }
    on_event("preparing", 0.0, "Preparing installer")
    uv = _uv()

    def run(args: list, stage: str, lo: float, hi: float, attempts: int = 4) -> None:
        downloaded = 0
        for attempt in range(1, attempts + 1):
            proc = subprocess.Popen([str(uv), *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
            last = ""
            assert proc.stdout is not None
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                last = line
                if should_cancel():
                    proc.terminate()
                    raise InstallError("Cancelled")
                if line.startswith("Downloaded") or line.startswith("Downloading"):
                    downloaded += line.startswith("Downloaded")
                    # The AI packages are ~30 large downloads; progress approaches hi asymptotically.
                    fraction = 1 - 1 / (1 + downloaded / 12)
                    on_event(stage, lo + (hi - lo) * fraction, line)
                elif re.match(r"^(Prepared|Installed|Resolved|Audited)", line):
                    on_event(stage, lo + (hi - lo) * 0.95, line)
            proc.wait()
            if proc.returncode == 0:
                on_event(stage, hi, "")
                return
            if attempt == attempts:
                raise InstallError(last or f"uv {' '.join(args[:2])} failed")
            on_event(stage, lo, f"Download interrupted - retrying ({attempt}/{attempts - 1})")
            time.sleep(5 * attempt)

    # The installed app already contains Python 3.12 - reuse it instead of downloading another.
    bundled = os.environ.get("CAPTIONFORGE_BUNDLED_PYTHON")
    if bundled and Path(bundled).exists():
        python_spec = bundled
        on_event("installing-python", 0.12, "Using the Python bundled with CaptionForge")
    else:
        run(["python", "install", PYTHON_VERSION], "installing-python", 0.02, 0.12)
        python_spec = PYTHON_VERSION
    run(["venv", "--allow-existing", "--python", python_spec, str(runtime / "ai")], "creating-environment", 0.12, 0.15)
    run(["pip", "install", "--python", str(env_python(runtime)), *AI_PACKAGES], "installing-packages", 0.15, 0.99)

    check = subprocess.run(
        [
            str(env_python(runtime)),
            "-c",
            "import importlib.metadata as m, json; print(json.dumps({p: m.version(p) for p in ('whisperx', 'torch', 'argostranslate')}))",
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if check.returncode != 0:
        raise InstallError("AI runtime installed but could not be started: " + (check.stderr.strip().splitlines() or [""])[-1])
    on_event("complete", 1.0, check.stdout.strip())
    return {"runtime": str(runtime), "versions": check.stdout.strip()}


def installed_python(runtime: Path) -> Optional[Path]:
    python = env_python(runtime)
    return python if python.exists() else None
