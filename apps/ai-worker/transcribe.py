"""CaptionForge local AI transcription (WhisperX).

Runs inside the private AI runtime (runtime/ai), launched by the local API:

    runtime/ai/bin/python apps/ai-worker/transcribe.py job.json

job.json: {
  "audio": "/path/to/media",            # anything FFmpeg can read
  "output": "/path/to/result.json",
  "modelsDir": "/path/to/workspace/models",
  "model": "small" | "medium" | "large-v3" | "large-v3-turbo" | ...,
  "language": null | "en" | ...,        # null = detect
  "diarize": false, "hfToken": null,
  "minSpeakers": null, "maxSpeakers": null
}

Progress is written to stdout as JSON lines: {"stage": "...", "progress": 0..1}.
The result file holds {"language", "words": [{text, startMs, endMs, score, speaker}], "durationMs"}.
Everything runs on this computer; models are downloaded once into modelsDir.
"""
from __future__ import annotations

import json
import os
import sys
import time


def emit(**event) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def with_retries(what: str, fn, attempts: int = 4):
    """Model downloads can drop on slow connections - retry (downloads resume or restart cleanly)."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except (OSError, ConnectionError, RuntimeError) as exc:
            if attempt == attempts or not _looks_like_network(exc):
                raise
            emit(stage="retrying", progress=0.0, what=what, attempt=attempt, error=str(exc)[:200])
            time.sleep(3 * attempt)


def _looks_like_network(exc: BaseException) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(k in text for k in ("broken pipe", "connection", "timed out", "timeout", "incomplete", "reset by peer", "urlopen", "ssl", "http", "remote end"))


def main() -> None:
    job = json.load(open(sys.argv[1]))
    models = job["modelsDir"]
    # Keep every model inside the CaptionForge workspace (offline after first download).
    os.environ.setdefault("HF_HOME", os.path.join(models, "huggingface"))
    os.environ.setdefault("TORCH_HOME", os.path.join(models, "torch"))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    emit(stage="loading-model", progress=0.0)
    import whisperx  # noqa: E402 - heavy import after env setup

    device = "cpu"  # CTranslate2 has no Apple GPU backend; int8 on Apple Silicon is fast
    compute_type = "int8"
    threads = max(1, (os.cpu_count() or 4) - 2)

    model = with_retries(
        "speech model",
        lambda: whisperx.load_model(
            job["model"],
            device,
            compute_type=compute_type,
            language=job.get("language") or None,
            download_root=os.path.join(models, "whisper"),
            threads=threads,
            vad_method="silero",
        ),
    )
    emit(stage="loading-audio", progress=0.0)
    audio = whisperx.load_audio(job["audio"])
    duration_ms = int(len(audio) / 16000 * 1000)

    started = time.time()
    emit(stage="transcribing", progress=0.0)
    result = model.transcribe(
        audio,
        batch_size=8,
        language=job.get("language") or None,
        progress_callback=lambda pct: emit(stage="transcribing", progress=min(1.0, pct / 100)),
    )
    language = result.get("language") or job.get("language") or "en"
    emit(stage="transcribing", progress=1.0, language=language, seconds=round(time.time() - started, 1))
    del model

    emit(stage="aligning", progress=0.0, language=language)
    try:
        align_model, metadata = with_retries(
            "alignment model",
            lambda: whisperx.load_align_model(language_code=language, device=device, model_dir=os.path.join(models, "align")),
        )
        result = whisperx.align(
            result["segments"],
            align_model,
            metadata,
            audio,
            device,
            return_char_alignments=False,
            progress_callback=lambda pct: emit(stage="aligning", progress=min(1.0, pct / 100)),
        )
        aligned = True
    except ValueError as exc:  # no alignment model for this language
        emit(stage="aligning", progress=1.0, warning=str(exc))
        aligned = False

    if job.get("diarize"):
        emit(stage="diarizing", progress=0.0)
        from whisperx.diarize import DiarizationPipeline

        pipeline = with_retries(
            "speaker model",
            lambda: DiarizationPipeline(token=job.get("hfToken") or None, device=device, cache_dir=os.path.join(models, "huggingface")),
        )
        diarized = pipeline(
            audio,
            min_speakers=job.get("minSpeakers"),
            max_speakers=job.get("maxSpeakers"),
            progress_callback=lambda pct: emit(stage="diarizing", progress=min(1.0, pct / 100)),
        )
        result = whisperx.assign_word_speakers(diarized, result, fill_nearest=True)

    words = []
    for segment in result["segments"]:
        seg_words = segment.get("words") if aligned else None
        if seg_words:
            for w in seg_words:
                text = (w.get("word") or "").strip()
                if not text:
                    continue
                word = {"text": text}
                if w.get("start") is not None and w.get("end") is not None:
                    word["startMs"] = int(round(w["start"] * 1000))
                    word["endMs"] = int(round(w["end"] * 1000))
                if w.get("score") is not None:
                    word["score"] = round(float(w["score"]), 3)
                if w.get("speaker"):
                    word["speaker"] = w["speaker"]
                words.append(word)
        else:
            # No word alignment: spread the segment's words over its time span.
            tokens = (segment.get("text") or "").split()
            start, end = segment["start"] * 1000, segment["end"] * 1000
            for i, token in enumerate(tokens):
                words.append(
                    {
                        "text": token,
                        "startMs": int(start + (end - start) * i / len(tokens)),
                        "endMs": int(start + (end - start) * (i + 1) / len(tokens)),
                        **({"speaker": segment["speaker"]} if segment.get("speaker") else {}),
                    }
                )

    with open(job["output"], "w") as f:
        json.dump({"language": language, "aligned": aligned, "durationMs": duration_ms, "words": words}, f)
    emit(stage="done", progress=1.0, words=len(words), language=language)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - report every failure to the API
        emit(stage="error", error=f"{type(exc).__name__}: {exc}")
        sys.exit(1)
