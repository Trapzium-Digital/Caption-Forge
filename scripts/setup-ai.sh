#!/usr/bin/env bash
# Installs the local AI runtime (WhisperX + PyTorch) inside this folder:
#   runtime/python  - a private Python 3.12 (WhisperX needs >= 3.10)
#   runtime/ai      - virtual environment with WhisperX
# Nothing is installed system-wide. Models download on first use into the CaptionForge workspace.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PY="$ROOT/apps/local-api/.venv/bin/python"
UV="$ROOT/apps/local-api/.venv/bin/uv"
WHISPERX_VERSION="3.8.6"
ARGOS_VERSION="1.11.0"

if [ ! -x "$API_PY" ]; then
  echo "Run 'npm run setup:api' first." >&2
  exit 1
fi
if [ ! -x "$UV" ]; then
  echo "Installing uv (Python manager) into the API environment..."
  "$API_PY" -m pip install -q uv
fi
export UV_PYTHON_INSTALL_DIR="$ROOT/runtime/python"
echo "Installing private Python 3.12..."
"$UV" python install 3.12
echo "Creating AI environment..."
"$UV" venv --allow-existing --python 3.12 "$ROOT/runtime/ai"
echo "Installing WhisperX $WHISPERX_VERSION (includes PyTorch, ~1-2 GB download)..."
# Large wheels on slow connections: generous timeout, and retry a few times (uv resumes from its cache).
export UV_HTTP_TIMEOUT=300
for attempt in 1 2 3 4; do
  if "$UV" pip install --python "$ROOT/runtime/ai/bin/python" "whisperx==$WHISPERX_VERSION" "argostranslate==$ARGOS_VERSION"; then
    break
  fi
  if [ "$attempt" = 4 ]; then
    echo "Install failed after $attempt attempts - check your internet connection and run 'npm run setup:ai' again." >&2
    exit 1
  fi
  echo "Download interrupted - retrying ($attempt/3)..."
  sleep 5
done
"$ROOT/runtime/ai/bin/python" -c "import importlib.metadata as m; print('WhisperX', m.version('whisperx'), '| PyTorch', m.version('torch'), '| Argos Translate', m.version('argostranslate'))"
echo "AI runtime ready."
