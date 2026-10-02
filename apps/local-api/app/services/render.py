"""Production rendering through the Remotion renderer (packages/rendering/render.mjs)."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Callable, Optional

from .media import MediaError, probe
from .runtime import binary

FORMATS = {"mp4": ".mp4", "webm-alpha": ".webm", "mov-alpha": ".mov", "mov-png": ".mov"}


def renderer_dir() -> Path:
    override = os.environ.get("CAPTIONFORGE_RENDERER")
    if override:
        return Path(override)
    # apps/local-api/app/services/render.py -> repository root
    return Path(__file__).resolve().parents[4] / "packages" / "rendering"


def renderer_available() -> bool:
    root = renderer_dir()
    return (
        binary("node") is not None
        and (root / "render.mjs").exists()
        and any((p / "node_modules" / "@remotion" / "renderer").exists() for p in (root, *root.parents))
    )


def project_duration_ms(project: dict, video_duration_ms: Optional[int]) -> int:
    ends = [c["endMs"] for t in project.get("captionTracks", []) for c in t.get("cues", [])]
    return max(video_duration_ms or 0, max(ends, default=0), 1000)


def run_render(
    job_file: Path,
    on_event: Callable[[dict], None],
    should_cancel: Callable[[], bool],
) -> None:
    """Run the renderer; stream its JSON progress events. Raises on failure."""
    node = binary("node")
    if node is None:
        raise MediaError("Node.js is not installed")
    root = renderer_dir()
    proc = subprocess.Popen(
        [node, str(root / "render.mjs"), str(job_file)],
        cwd=str(root),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    last_error: Optional[str] = None
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            if should_cancel():
                proc.terminate()
                break
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue  # renderer log output
            if event.get("stage") == "error":
                last_error = event.get("error")
            else:
                on_event(event)
        proc.wait(timeout=30)
    finally:
        if proc.poll() is None:
            proc.kill()
    if should_cancel():
        return
    if proc.returncode != 0:
        detail = last_error or (proc.stderr.read() if proc.stderr else "")
        raise MediaError(f"Render failed: {(detail or '').strip().splitlines()[0] if detail else 'unknown error'}")


def verify_output(path: Path, fmt: str, project: dict, duration_ms: int) -> dict:
    """FFprobe the rendered file: it must decode with the expected size and length."""
    if not path.exists() or path.stat().st_size == 0:
        raise MediaError("Renderer produced no output")
    meta = probe(path)
    comp = project["composition"]
    problems = []
    if meta["width"] != comp["width"] or meta["height"] != comp["height"]:
        problems.append(f"size {meta['width']}x{meta['height']} != {comp['width']}x{comp['height']}")
    if meta["durationMs"] is None or abs(meta["durationMs"] - duration_ms) > 1000 / comp["fps"] * 3 + 100:
        problems.append(f"duration {meta['durationMs']} ms != {duration_ms} ms")
    if fmt == "webm-alpha" and not _has_alpha(path):
        problems.append("no alpha channel")
    if fmt == "mov-alpha":
        pix = _pixel_format(path)
        if meta["videoCodec"] != "prores" or not pix.startswith("yuva"):
            problems.append(f"expected ProRes 4444 with alpha, got {meta['videoCodec']} {pix}")
    if fmt == "mov-png":
        pix = _pixel_format(path)
        if meta["videoCodec"] != "png" or pix != "rgba":
            problems.append(f"expected QuickTime PNG with alpha, got {meta['videoCodec']} {pix}")
    if problems:
        raise MediaError("Render verification failed: " + "; ".join(problems))
    return meta


def _pixel_format(path: Path) -> str:
    ffprobe = binary("ffprobe")
    if not ffprobe:
        return ""
    out = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    return out.stdout.strip()


def _has_alpha(path: Path) -> bool:
    ffprobe = binary("ffprobe")
    if not ffprobe:
        return False
    out = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream_tags=alpha_mode", "-of", "json", str(path)],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    try:
        tags = json.loads(out.stdout)["streams"][0].get("tags", {})
    except (KeyError, IndexError, json.JSONDecodeError):
        return False
    return str(tags.get("alpha_mode", tags.get("ALPHA_MODE", ""))) == "1"
