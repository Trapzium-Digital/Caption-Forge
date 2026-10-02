#!/bin/bash
# CaptionForge installer for macOS.
# Installs what CaptionForge needs (Homebrew, Node.js, Python, FFmpeg), sets up the app,
# and puts a "Start CaptionForge" launcher on your Desktop.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
ok() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
ask() { local reply; read -r -p "$1 [y/N] " reply; [[ "$reply" =~ ^[Yy] ]]; }

bold "CaptionForge installer for macOS"
echo "Folder: $ROOT"
echo

# 1. Homebrew (the standard macOS package manager)
if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "CaptionForge uses Homebrew to install Node.js, Python and FFmpeg."
  if ask "Install Homebrew now? (it will ask for your Mac password)"; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
  else
    echo "Install Node.js 20+, Python 3.9+ and FFmpeg yourself, then run this installer again."
    exit 1
  fi
fi
ok "Homebrew"

# 2. Requirements
need_node=1
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then need_node=0; fi
[ $need_node = 1 ] && { bold "Installing Node.js..."; brew install node; }
ok "Node.js $(node --version)"

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
  bold "Installing Python..."; brew install python@3.12
fi
ok "Python $(python3 --version | cut -d' ' -f2)"

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  bold "Installing FFmpeg..."; brew install ffmpeg
fi
ok "FFmpeg"

# 3. CaptionForge itself
echo
npm run setup

# 4. Launcher on the Desktop
LAUNCHER="$HOME/Desktop/Start CaptionForge.command"
cat > "$LAUNCHER" <<LAUNCH
#!/bin/bash
# Starts CaptionForge and opens it in your browser. Close this window to stop it.
cd "$ROOT" && npm start
LAUNCH
chmod +x "$LAUNCHER"
ok "Launcher created on your Desktop: Start CaptionForge"

# 5. Optional AI
echo
echo "AI captions (automatic transcription + translation) are optional: about 1.1 GB."
echo "You can also install them later with the 'Enable AI captions' button inside the app."
if ask "Install AI captions now?"; then npm run setup:ai; fi

echo
bold "All done! Double-click 'Start CaptionForge' on your Desktop any time."
if ask "Start CaptionForge now?"; then npm start; fi
