# Install from GitHub on Windows

Use this if you want to run CaptionForge straight from this repository on a Windows 10 or 11 PC. If you just want to use CaptionForge, the [desktop app](DESKTOP-APP.md) is simpler.

**You need:** Windows 10 (version 1809 or newer) or Windows 11, 64-bit, an internet connection, and about 1 GB of free space (3–4 GB with AI captions).

> **Status:** the Windows scripts are new and have not yet been tested by hand on a Windows PC. If anything fails, the [troubleshooting](#troubleshooting) section and the manual steps below will get you running — and please report the problem.

---

## Option A — one-click installer (recommended)

### 1. Download CaptionForge

On the repository page click **Code → Download ZIP**. Right-click the ZIP in **Downloads → Extract All…**, and extract it somewhere permanent, for example **Documents\CaptionForge**.

> Prefer git? `git clone https://github.com/Trapzium-Digital/Caption-Forge.git`

### 2. Run the installer

Double-click **`Install CaptionForge (Windows).bat`**.

If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**.

The installer uses **winget** (the Windows package manager that comes with Windows 10/11) to:

1. Install **Node.js**, **Python 3.12** and **FFmpeg** if they are missing (Windows may ask for permission).
2. Set up CaptionForge and build the app.
3. Create a **Start CaptionForge** shortcut on your Desktop.
4. Ask whether to install **AI captions** now (about 1.1 GB) — you can say no and do it later from inside the app.

> If you see "winget is required", install **App Installer** from the Microsoft Store and run the installer again.

### 3. Start CaptionForge

Double-click **Start CaptionForge** on your Desktop (or **`Start CaptionForge (Windows).bat`** in the folder). A console window opens and your browser shows CaptionForge at `http://127.0.0.1:8756`.

**Keep the console window open while you use CaptionForge.** Close it to stop CaptionForge.

---

## Option B — step by step (PowerShell)

Open **PowerShell** and run:

```powershell
# 1. Tools (skip what you already have)
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Python.Python.3.12
winget install -e --id Gyan.FFmpeg
# Close PowerShell and open a new window so the new tools are found.

# 2. Get CaptionForge
git clone https://github.com/Trapzium-Digital/Caption-Forge.git
cd Caption-Forge

# 3. Set it up
npm run setup

# 4. Optional: AI captions + translation (~1.1 GB)
npm run setup:ai

# 5. Start it
npm start
```

---

## Everyday use

| Task | How |
|---|---|
| Start | Double-click **Start CaptionForge** (or `npm start` in the folder) |
| Stop | Close the console window, or Ctrl + C |
| Add AI captions later | In the app: **AI captions → Enable AI captions**, or `npm run setup:ai` |
| Update | Download the new ZIP (or `git pull`), then run `npm run setup` again. Projects are kept. |
| Uninstall | Delete the CaptionForge folder and the Desktop shortcut. Projects and AI downloads are in `%APPDATA%\CaptionForge` — delete it to remove them too. |

## Troubleshooting

| Problem | What to do |
|---|---|
| `'npm' is not recognized` | Node.js was just installed — close the window and open a new one (or restart the PC). |
| `Python 3.9 or newer is required` | `winget install -e --id Python.Python.3.12`, then open a new window. |
| `ffmpeg is required` | `winget install -e --id Gyan.FFmpeg`, then open a new window. If it is still not found, restart Windows. |
| "running scripts is disabled on this system" | Use the `.bat` file (it allows the installer to run), or run PowerShell once with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| Antivirus blocks the download of AI components | Allow CaptionForge's folder, then click **Enable AI captions** again — downloads resume. |
