"""CaptionForge local caption translation (Argos Translate / OPUS-MT).

Runs inside the private AI runtime (runtime/ai), launched by the local API:

    runtime/ai/bin/python apps/ai-worker/translate.py languages <job.json>
    runtime/ai/bin/python apps/ai-worker/translate.py translate <job.json>

languages job: {"modelsDir", "output", "refresh": bool}
  -> output: {"languages": [{code, name}], "pairs": [[from, to]], "installed": [[from, to]]}
translate job: {"modelsDir", "output", "from", "to", "texts": [...]}
  -> output: {"translations": [...]}, language packs (~100 MB each) download once.

Progress is written to stdout as JSON lines: {"stage": "...", "progress": 0..1}.
Translation runs on this computer; text never leaves it.
"""
from __future__ import annotations

import json
import os
import sys
import time


def emit(**event) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def configure(models_dir: str) -> None:
    """Keep Argos packages, index and caches inside the CaptionForge workspace."""
    root = os.path.join(models_dir, "argos")
    os.environ.setdefault("ARGOS_TRANSLATE_PACKAGE_DIR", os.path.join(root, "packages"))
    os.environ.setdefault("XDG_DATA_HOME", os.path.join(root, "data"))
    os.environ.setdefault("XDG_CACHE_HOME", os.path.join(root, "cache"))
    os.environ.setdefault("XDG_CONFIG_HOME", os.path.join(root, "config"))
    os.environ.setdefault("HF_HOME", os.path.join(models_dir, "huggingface"))
    os.environ.setdefault("ARGOS_DEVICE_TYPE", "cpu")


def with_retries(fn, attempts: int = 4):
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - network errors come in many types
            if attempt == attempts:
                raise
            emit(stage="retrying", progress=0.0, attempt=attempt, error=str(exc)[:200])
            time.sleep(3 * attempt)


def load_index(package, refresh: bool) -> list:
    index_file = os.path.join(os.environ["XDG_DATA_HOME"], "argos-translate", "index.json")
    stale = not os.path.exists(index_file) or time.time() - os.path.getmtime(index_file) > 7 * 86400
    if refresh or stale:
        try:
            with_retries(package.update_package_index)
        except Exception:  # noqa: BLE001 - offline: fall back to the cached index if there is one
            if not os.path.exists(index_file):
                raise
    return package.get_available_packages()


def languages(job: dict) -> dict:
    import argostranslate.package as package

    available = load_index(package, bool(job.get("refresh")))
    installed = package.get_installed_packages()
    names: dict = {}
    pairs = []
    for p in available:
        names[p.from_code] = p.from_name
        names[p.to_code] = p.to_name
        pairs.append([p.from_code, p.to_code])
    return {
        "languages": sorted(({"code": c, "name": n} for c, n in names.items()), key=lambda x: x["name"]),
        "pairs": pairs,
        "installed": [[p.from_code, p.to_code] for p in installed],
    }


def ensure_route(package, from_code: str, to_code: str) -> list:
    """Install what is needed for from -> to: a direct pack, or two packs through English."""
    available = load_index(package, False)
    installed = {(p.from_code, p.to_code) for p in package.get_installed_packages()}
    direct = {(p.from_code, p.to_code): p for p in available}
    if (from_code, to_code) in direct or (from_code, to_code) in installed:
        route = [(from_code, to_code)]
    elif ((from_code, "en") in direct or (from_code, "en") in installed) and (("en", to_code) in direct or ("en", to_code) in installed):
        route = [(from_code, "en"), ("en", to_code)]
    else:
        raise ValueError(f"No offline translation available from '{from_code}' to '{to_code}'")
    missing = [pair for pair in route if pair not in installed]
    for i, pair in enumerate(missing):
        emit(stage="downloading", progress=i / max(1, len(missing)), pair=list(pair))
        pkg = direct[pair]
        path = with_retries(pkg.download)
        package.install_from_path(path)
    return route


def translate(job: dict) -> dict:
    import argostranslate.package as package
    import argostranslate.translate as translator

    emit(stage="preparing", progress=0.0)
    ensure_route(package, job["from"], job["to"])
    emit(stage="translating", progress=0.0)
    texts = job["texts"]
    out = []
    for i, text in enumerate(texts):
        # Captions are short; line breaks are re-wrapped by the caption engine anyway.
        clean = " ".join(text.split())
        out.append(translator.translate(clean, job["from"], job["to"]) if clean else "")
        if i % 5 == 0 or i == len(texts) - 1:
            emit(stage="translating", progress=(i + 1) / len(texts))
    return {"translations": out}


def main() -> None:
    command, job_path = sys.argv[1], sys.argv[2]
    job = json.load(open(job_path))
    configure(job["modelsDir"])
    result = languages(job) if command == "languages" else translate(job)
    with open(job["output"], "w") as f:
        json.dump(result, f)
    emit(stage="done", progress=1.0)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - report every failure to the API
        emit(stage="error", error=f"{type(exc).__name__}: {exc}")
        sys.exit(1)
