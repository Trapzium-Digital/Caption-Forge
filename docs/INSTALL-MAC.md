# Install from GitHub on Mac

Use this if you want to run CaptionForge straight from this repository (for example to get the latest version, or to work on the code). If you just want to use CaptionForge, the [desktop app](DESKTOP-APP.md) is simpler.

**You need:** a Mac with macOS 12 or newer, an internet connection, and about 1 GB of free space (3–4 GB with AI captions).

---

## Option A — one-click installer (recommended)

### 1. Download CaptionForge

On the repository page click **Code → Download ZIP**, then double-click the ZIP in your Downloads folder to unzip it. Move the **CaptionForge** folder somewhere permanent, for example your **Documents** folder.

> Prefer git? `git clone https://github.com/Trapzium-Digital/Caption-Forge.git`

### 2. Run the installer

Double-click **`Install CaptionForge (Mac).command`** in the folder.

If macOS says it can't be opened because it is from an unidentified developer, **right-click the file → Open → Open**. (If double-clicking does nothing, open **Terminal**, type `bash ` with a space, drag `scripts/install-mac.sh` into the window and press Enter.)

The installer:

1. Installs **Homebrew** if you don't have it (asks for your Mac password).
2. Installs **Node.js**, **Python** and **FFmpeg** if they are missing.
3. Sets up CaptionForge and builds the app.
4. Puts **Start CaptionForge** on your Desktop.
5. Asks whether to install **AI captions** now (about 1.1 GB) — you can say no and do it later from inside the app.

It takes a few minutes, depending on your connection.

### 3. Start CaptionForge

Double-click **Start CaptionForge** on your Desktop (or **`Start CaptionForge (Mac).command`** in the folder). A Terminal window opens and your browser shows CaptionForge at `http://127.0.0.1:8756`.

**Keep the Terminal window open while you use CaptionForge.** To stop it, close that window (or press **Ctrl + C** in it).

---

## Option B — step by step (Terminal)

```bash
# 1. Tools (skip what you already have)
brew install node python ffmpeg

# 2. Get CaptionForge
git clone https://github.com/Trapzium-Digital/Caption-Forge.git
cd Caption-Forge

# 3. Set it up (checks requirements, installs packages, builds the app)
npm run setup

# 4. Optional: AI captions + translation (~1.1 GB)
npm run setup:ai

# 5. Start it
npm start
```

`npm run setup` stops with a clear message if something is missing — install it, open a **new** Terminal window and run it again.

---

## Everyday use

| Task | How |
|---|---|
| Start | Double-click **Start CaptionForge** (or `npm start` in the folder) |
| Stop | Close the Terminal window, or Ctrl + C |
| Add AI captions later | In the app: **AI captions → Enable AI captions**, or `npm run setup:ai` |
| Update to the latest version | Download the new ZIP (or `git pull`), then run `npm run setup` again. Your projects are kept. |
| Uninstall | Delete the CaptionForge folder and the Desktop launcher. Projects and AI downloads are in `~/Library/Application Support/CaptionForge/` — delete it to remove them too. |

## Troubleshooting

| Message | What to do |
|---|---|
| `command not found: npm` / `node` | Node.js is not installed or the Terminal was opened before installing it. Run the installer again or open a new Terminal window. |
| `Python 3.9 or newer is required` | `brew install python`, then open a new Terminal window. |
| `ffmpeg is required` | `brew install ffmpeg`. |
| `CaptionForge is not set up yet` | Run `npm run setup` in the CaptionForge folder. |
| Port already in use | Another copy is running — use that one, or close it first. |
