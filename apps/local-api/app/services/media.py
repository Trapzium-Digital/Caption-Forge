"""Media probing and derived assets (waveforms, thumbnails).

Source media is copied into the workspace on import and never modified.
All subprocesses use argument lists - never shell strings.
"""
from __future__ import annotations

import json
import subprocess
from array import array
from fractions import Fraction
from pathlib import Path
from typing import Optional

from .runtime import binary

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


class MediaError(Exception):
    pass


def kind_for_extension(ext: str) -> Optional[str]:
    ext = ext.lower()
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in IMAGE_EXT:
        return "image"
    return None


def _require(name: str) -> str:
    path = binary(name)
    if not path:
        raise MediaError(f"{name} is not installed")
    return path


def probe(path: Path) -> dict:
    """Run ffprobe and return normalised metadata. Raises MediaError for unreadable files."""
    cmd = [
        _require("ffprobe"),
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
    except subprocess.TimeoutExpired as exc:
        raise MediaError("ffprobe timed out") from exc
    if out.returncode != 0:
        raise MediaError(f"Not a readable media file: {out.stderr.strip()[:200]}")
    data = json.loads(out.stdout or "{}")
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    fmt = data.get("format", {})

    duration = fmt.get("duration") or (video or audio or {}).get("duration")
    fps = None
    if video and video.get("avg_frame_rate") not in (None, "0/0"):
        try:
            fps = round(float(Fraction(video["avg_frame_rate"])), 3)
        except (ValueError, ZeroDivisionError):
            fps = None

    return {
        "durationMs": int(float(duration) * 1000) if duration else None,
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "fps": fps,
        "videoCodec": video.get("codec_name") if video else None,
        "audioCodec": audio.get("codec_name") if audio else None,
        "hasVideo": video is not None,
        "hasAudio": audio is not None,
        "container": fmt.get("format_name"),
        "bitRate": int(fmt["bit_rate"]) if fmt.get("bit_rate") else None,
    }


def generate_thumbnail(source: Path, dest: Path, at_seconds: float = 1.0) -> Path:
    cmd = [
        _require("ffmpeg"), "-v", "error", "-y",
        "-ss", str(at_seconds),
        "-i", str(source),
        "-frames:v", "1",
        "-vf", "scale=480:-2",
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)
    if result.returncode != 0 or not dest.exists():
        # Very short clips: retry from the first frame.
        cmd[cmd.index("-ss") + 1] = "0"
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)
    if result.returncode != 0 or not dest.exists():
        raise MediaError(f"Thumbnail failed: {result.stderr.strip()[:200]}")
    return dest


def generate_waveform(source: Path, dest: Path, peaks_per_second: int = 100, on_progress=None, duration_ms: Optional[int] = None) -> dict:
    """Decode audio to 8 kHz mono and store absolute peak per bucket (0..1)."""
    sample_rate = 8000
    bucket = sample_rate // peaks_per_second
    cmd = [
        _require("ffmpeg"), "-v", "error",
        "-i", str(source),
        "-vn", "-ac", "1", "-ar", str(sample_rate),
        "-f", "s16le", "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    peaks: list[float] = []
    leftover = b""
    total_samples = 0
    expected = (duration_ms or 0) * sample_rate / 1000
    try:
        assert proc.stdout is not None
        while True:
            chunk = proc.stdout.read(bucket * 2 * 1000)
            if not chunk:
                break
            data = leftover + chunk
            usable = len(data) - (len(data) % (bucket * 2))
            leftover = data[usable:]
            samples = array("h")
            samples.frombytes(data[:usable])
            total_samples += len(samples)
            for i in range(0, len(samples), bucket):
                window = samples[i:i + bucket]
                peaks.append(round(max(max(window), -min(window)) / 32768, 3))
            if on_progress and expected:
                on_progress(min(0.99, total_samples / expected))
        proc.wait(timeout=60)
    finally:
        if proc.poll() is None:
            proc.kill()
    if proc.returncode != 0:
        err = proc.stderr.read().decode(errors="replace") if proc.stderr else ""
        raise MediaError(f"Waveform failed: {err.strip()[:200]}")
    data = {"peaksPerSecond": peaks_per_second, "peaks": peaks}
    dest.write_text(json.dumps(data, separators=(",", ":")))
    return {"peaks": len(peaks)}
