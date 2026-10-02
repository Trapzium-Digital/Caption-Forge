"""Command line helpers for setup scripts.

    python -m app.cli install-ai     install the AI runtime into the workspace
"""
from __future__ import annotations

import sys

from .config import default_home
from .services import ai_install


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command != "install-ai":
        print(__doc__)
        return 2
    runtime = default_home() / "runtime"
    print(f"Installing the CaptionForge AI runtime into {runtime}")
    print("This downloads about 1.1 GB once. Models download later, when first used.\n")
    last = {"stage": ""}

    def on_event(stage: str, progress: float, message: str) -> None:
        if stage != last["stage"]:
            print(f"\n== {stage.replace('-', ' ')} ==")
            last["stage"] = stage
        if message:
            print(f"  [{progress * 100:5.1f}%] {message}")

    try:
        result = ai_install.install(runtime, on_event)
    except ai_install.InstallError as exc:
        print(f"\nAI install failed: {exc}\nCheck your internet connection and run it again - downloads resume.")
        return 1
    print(f"\nAI runtime ready: {result['versions']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
