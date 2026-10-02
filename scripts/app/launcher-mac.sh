#!/bin/bash
# CaptionForge.app launcher: starts the bundled local server and opens the browser.
# A small window offers "Open in Browser" and "Quit CaptionForge".
R="$(cd "$(dirname "$0")/../Resources" && pwd)"
PORT="${CAPTIONFORGE_PORT:-8765}"
URL="http://127.0.0.1:$PORT"
HOME_DIR="$HOME/Library/Application Support/CaptionForge"
mkdir -p "$HOME_DIR/logs"
LOG="$HOME_DIR/logs/app.log"

export PATH="$R/node/bin:$R/ffmpeg:/usr/bin:/bin:/usr/sbin:/sbin"
# Remotion's video decoder needs a per-user temp folder; make sure one is set.
export TMPDIR="${TMPDIR:-$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null || echo /tmp/)}"
export PYTHONPATH="$R/api"
export PYTHONDONTWRITEBYTECODE=1
export CAPTIONFORGE_STATIC="$R/web"
export CAPTIONFORGE_RENDERER="$R/rendering"
export CAPTIONFORGE_AI_WORKERS="$R/ai-worker"
export CAPTIONFORGE_BUNDLED_PYTHON="$R/python/bin/python3"

running() { /usr/bin/curl -sf "$URL/api/health" >/dev/null 2>&1; }

# Already running (e.g. opened twice): just show it.
if running; then open "$URL"; exit 0; fi

cd "$R/api"
"$R/python/bin/python3" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT" >>"$LOG" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

for _ in $(seq 1 120); do running && break; sleep 0.5; done
if ! running; then
  [ -z "${CAPTIONFORGE_NO_DIALOG:-}" ] && osascript -e "display alert \"CaptionForge could not start\" message \"See the log: $LOG\" as critical" >/dev/null
  exit 1
fi
[ -z "${CAPTIONFORGE_NO_OPEN:-}" ] && open "$URL"
# Automated tests / headless use: no window, just keep the server running.
if [ -n "${CAPTIONFORGE_NO_DIALOG:-}" ]; then wait "$SERVER"; exit $?; fi

while kill -0 "$SERVER" 2>/dev/null; do
  choice=$(osascript -e "button returned of (display dialog \"CaptionForge is running.\n\n$URL\n\nKeep this window open while you use it.\" buttons {\"Quit CaptionForge\", \"Open in Browser\"} default button \"Open in Browser\" with title \"CaptionForge\" giving up after 86400)" 2>/dev/null)
  case "$choice" in
    "Quit CaptionForge") break ;;
    "Open in Browser") open "$URL" ;;
  esac
done
