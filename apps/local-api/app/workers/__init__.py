"""Job handlers. Each worker receives a JobContext and returns a JSON-able result."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from ..config import Settings
from ..jobs import JobCancelled, JobContext, JobQueue, JobUnavailable
from ..services import ai, media, render as renderer


def register_workers(queue: JobQueue, settings: Settings) -> None:
    def media_path(ctx: JobContext) -> Path:
        row = queue.db.query_one("SELECT stored_path FROM media_assets WHERE id = ?", (ctx.payload["mediaId"],))
        if row is None:
            raise ValueError("Media asset no longer exists")
        return settings.home / row["stored_path"]

    def waveform(ctx: JobContext) -> dict:
        ctx.report("processing", 0.0)
        dest = settings.dir("waveforms") / f"{ctx.payload['mediaId']}.json"
        result = media.generate_waveform(
            media_path(ctx),
            dest,
            duration_ms=ctx.payload.get("durationMs"),
            on_progress=lambda p: ctx.report("processing", p),
        )
        return result

    def thumbnail(ctx: JobContext) -> dict:
        ctx.report("processing", 0.2)
        dest = settings.dir("thumbnails") / f"{ctx.payload['mediaId']}.jpg"
        media.generate_thumbnail(media_path(ctx), dest)
        return {"ok": True}

    def transcription(ctx: JobContext) -> dict:
        if not ai.ai_available():
            raise JobUnavailable("Local AI runtime is not installed - run 'npm run setup:ai' in the CaptionForge folder")
        model = ctx.payload.get("model", "small")
        if model not in ai.MODEL_NAMES:
            raise ValueError(f"Unknown model '{model}'")
        source = media_path(ctx)
        hf_token = None
        if ctx.payload.get("diarize"):
            row = queue.db.query_one("SELECT value FROM app_settings WHERE key = 'hfToken'")
            hf_token = json.loads(row["value"]) if row else None
            if not hf_token:
                raise ValueError("Speaker detection needs a Hugging Face token (AI Captions > Speaker detection)")
        output = settings.dir("cache") / f"{ctx.id}-transcript.json"
        job_file = settings.dir("cache") / f"{ctx.id}-transcribe.json"
        job_file.write_text(
            json.dumps(
                {
                    "audio": str(source),
                    "output": str(output),
                    "modelsDir": str(settings.dir("models")),
                    "model": model,
                    "language": ctx.payload.get("language") or None,
                    "diarize": bool(ctx.payload.get("diarize")),
                    "hfToken": hf_token,
                    "minSpeakers": ctx.payload.get("minSpeakers"),
                    "maxSpeakers": ctx.payload.get("maxSpeakers"),
                }
            )
        )
        # Overall progress: model load 0-5 %, transcribe 5-65 %, align 65-90 %, speakers 90-99 %.
        weights = {
            "loading-model": (0.0, 0.05),
            "loading-audio": (0.05, 0.05),
            "transcribing": (0.05, 0.65 if ctx.payload.get("diarize") else 0.75),
            "aligning": (0.65 if ctx.payload.get("diarize") else 0.75, 0.9 if ctx.payload.get("diarize") else 0.99),
            "diarizing": (0.9, 0.99),
        }

        def on_event(event: dict) -> None:
            stage = event.get("stage")
            if stage in weights:
                lo, hi = weights[stage]
                ctx.report(stage, lo + (hi - lo) * float(event.get("progress", 0)))

        try:
            ai.run_transcription(job_file, on_event, ctx.cancel_requested)
            if ctx.cancel_requested():
                raise JobCancelled()
            transcript = json.loads(output.read_text())
        finally:
            job_file.unlink(missing_ok=True)
            output.unlink(missing_ok=True)
        return {"model": model, **transcript}

    def render(ctx: JobContext) -> dict:
        if not renderer.renderer_available():
            raise JobUnavailable("Remotion renderer is not installed (run npm install in the CaptionForge folder)")
        fmt = ctx.payload.get("format", "mp4")
        if fmt not in renderer.FORMATS:
            raise ValueError(f"Unknown render format '{fmt}'")
        quality = ctx.payload.get("quality", "standard")
        if quality not in renderer.QUALITIES:
            raise ValueError(f"Unknown render quality '{quality}'")
        project_id = ctx.payload.get("projectId")
        row = queue.db.query_one("SELECT document FROM projects WHERE id = ?", (project_id,))
        if row is None:
            raise ValueError("Project not found")
        project = json.loads(row["document"])

        video_path = None
        video_duration = None
        if project.get("primaryVideoId"):
            media_row = queue.db.query_one(
                "SELECT stored_path, metadata FROM media_assets WHERE id = ?", (project["primaryVideoId"],)
            )
            if media_row is not None:
                video_path = str(settings.home / media_row["stored_path"])
                video_duration = json.loads(media_row["metadata"]).get("durationMs")
        duration_ms = renderer.project_duration_ms(project, video_duration)
        # The preview times words to the speech in this waveform; the export must use the same data.
        speech = None
        if project.get("primaryVideoId"):
            wave_file = settings.dir("waveforms") / f"{project['primaryVideoId']}.json"
            if wave_file.exists():
                speech = json.loads(wave_file.read_text())

        output = settings.dir("renders") / f"{ctx.id}{renderer.FORMATS[fmt]}"
        job_file = settings.dir("cache") / f"{ctx.id}.json"
        job_file.write_text(
            json.dumps(
                {
                    "project": project,
                    "videoPath": video_path,
                    "output": str(output),
                    "format": fmt,
                    "quality": quality,
                    "durationMs": duration_ms,
                    "speech": speech,
                    "cacheDir": str(settings.dir("cache")),
                }
            )
        )
        # Overall progress: preparing/bundling 0-10 %, rendering 10-95 %, verifying 95-100 %.
        weights = {"preparing": (0.0, 0.03), "bundling": (0.03, 0.1), "rendering": (0.1, 0.9), "encoding": (0.9, 0.95)}

        def on_event(event: dict) -> None:
            stage = event.get("stage")
            if stage in weights:
                lo, hi = weights[stage]
                ctx.report(stage, lo + (hi - lo) * float(event.get("progress", 0)))

        try:
            renderer.run_render(job_file, on_event, ctx.cancel_requested)
            if ctx.cancel_requested():
                output.unlink(missing_ok=True)
                raise JobCancelled()
            ctx.report("verifying", 0.96)
            meta = renderer.verify_output(output, fmt, project, duration_ms)
        except BaseException:
            if not isinstance(sys.exc_info()[1], JobCancelled):
                output.unlink(missing_ok=True)
            raise
        finally:
            job_file.unlink(missing_ok=True)
        return {
            "format": fmt,
            "quality": quality,
            "file": output.name,
            "path": str(output),
            "sizeBytes": output.stat().st_size,
            "durationMs": meta["durationMs"],
            "width": meta["width"],
            "height": meta["height"],
            "verified": True,
        }

    def translation(ctx: JobContext) -> dict:
        if not ai.ai_available():
            raise JobUnavailable("Local AI runtime is not installed - run 'npm run setup:ai' in the CaptionForge folder")
        texts = ctx.payload.get("texts") or []
        if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
            raise ValueError("texts must be a list of strings")
        output = settings.dir("cache") / f"{ctx.id}-translation.json"
        job_file = settings.dir("cache") / f"{ctx.id}-translate.json"
        job_file.write_text(
            json.dumps(
                {
                    "modelsDir": str(settings.dir("models")),
                    "output": str(output),
                    "from": ctx.payload["from"],
                    "to": ctx.payload["to"],
                    "texts": texts,
                }
            )
        )
        weights = {"preparing": (0.0, 0.02), "downloading": (0.02, 0.5), "retrying": (0.02, 0.02), "translating": (0.5, 0.99)}

        def on_event(event: dict) -> None:
            stage = event.get("stage")
            if stage in weights:
                lo, hi = weights[stage]
                ctx.report(stage, lo + (hi - lo) * float(event.get("progress", 0)))

        try:
            ai.run_translation("translate", job_file, on_event, ctx.cancel_requested)
            if ctx.cancel_requested():
                raise JobCancelled()
            result = json.loads(output.read_text())
        finally:
            job_file.unlink(missing_ok=True)
            output.unlink(missing_ok=True)
        if len(result["translations"]) != len(texts):
            raise ValueError("Translation returned the wrong number of lines")
        return {"from": ctx.payload["from"], "to": ctx.payload["to"], **result}

    def ai_install(ctx: JobContext) -> dict:
        from ..config import default_home
        from ..services import ai_install as installer

        runtime = default_home() / "runtime" if settings.home == default_home() else settings.home / "runtime"

        def on_event(stage: str, progress: float, message: str) -> None:
            ctx.report(stage, progress)

        try:
            result = installer.install(runtime, on_event, ctx.cancel_requested)
        except installer.InstallError as exc:
            if ctx.cancel_requested():
                raise JobCancelled() from exc
            raise ValueError(str(exc)) from exc
        finally:
            ai.reset_cache()
        return result

    queue.register("waveform", waveform)
    queue.register("translation", translation)
    queue.register("ai-install", ai_install)
    queue.register("thumbnail", thumbnail)
    queue.register("transcription", transcription)
    queue.register("render", render)
