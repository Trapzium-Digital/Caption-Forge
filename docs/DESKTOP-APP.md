# CaptionForge desktop app

The easiest way to use CaptionForge: install it like any other app. Everything it needs is inside — no Node.js, Python or FFmpeg to install.

- **Mac:** Apple Silicon (M1 or newer), macOS 12 Monterey or newer
- **Windows:** Windows 10 or 11, 64-bit

> **Download:** get the latest installer from the repository's **Releases** page.
> `CaptionForge-<version>-mac-arm64.dmg` for Mac · `CaptionForge-<version>-windows-x64-setup.exe` for Windows.

---

## Install on Mac

1. Open the downloaded **`CaptionForge-…-mac-arm64.dmg`**.
2. Drag **CaptionForge** onto the **Applications** folder.
3. Open **CaptionForge** from Applications.

**The first time only**, macOS may say the app "can't be opened because Apple cannot check it for malicious software". This is because the app is not yet signed with an Apple Developer certificate. To open it:

- **macOS 15 Sequoia or newer:** open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the CaptionForge message. Confirm with your password.
- **macOS 12–14:** in Applications, **right-click (or Control-click) CaptionForge → Open**, then click **Open**.

After that, it opens normally.

## Install on Windows

1. Run the downloaded **`CaptionForge-…-windows-x64-setup.exe`**.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway** (the installer is not yet code-signed).
3. Follow the installer. It installs for your user only (no administrator password) and adds CaptionForge to the Start Menu and, optionally, the Desktop.

A portable **`.zip`** is also published: unzip it anywhere and double-click **`CaptionForge.vbs`**.

> The Windows build is produced automatically by GitHub Actions. It has not yet been tested by hand on a Windows PC — please report any problem.

---

## Using the app

1. Open **CaptionForge**. Your web browser opens at `http://127.0.0.1:8765` with the editor.
2. A small **CaptionForge is running** window stays open:
   - **Open in Browser** — opens the editor again if you closed the tab.
   - **Quit CaptionForge** — stops CaptionForge. (On Windows: **Yes** opens the browser, **No** quits.)
3. You can bookmark `http://127.0.0.1:8765`, but CaptionForge must be running for the page to work.

The address only works on your computer — other people on your network cannot open it.

## Enable AI captions (optional)

AI captions and translation are **not** in the installer, to keep the download small. To add them:

1. Open a project with a video and click **AI captions** (or **Translate** in the Captions tab).
2. Click **Enable AI captions**. CaptionForge downloads and installs the AI components (about **1.1 GB**) with a progress bar.
3. When it finishes, choose a model and generate captions. The first use of each model downloads it (Small: 465 MB).

Everything then runs offline. See [AI captions & translation](AI-CAPTIONS.md).

## Sizes

| | Download | On disk |
|---|---|---|
| App (editor, all styles, rendering, FFmpeg, headless Chrome) | ~210 MB | ~680 MB |
| AI captions runtime | +1.1 GB | +1.1 GB |
| Speech model (Small / Medium / Large) | +465 MB / 1.5 GB / 3.1 GB | same |
| Word-timing model per spoken language | +360 MB | +360 MB |
| Translation pack per target language | ~140 MB | ~140 MB |

## Where your data is

| | Mac | Windows |
|---|---|---|
| Projects, media, renders, AI | `~/Library/Application Support/CaptionForge/` | `%APPDATA%\CaptionForge\` |
| Logs | `…/CaptionForge/logs/` | `%APPDATA%\CaptionForge\logs\` |

Uninstalling the app does **not** delete your projects. To remove everything, also delete that folder.

## Updating

Install the new version over the old one. Your projects, templates and AI components are kept — they live in your data folder, not in the app.

## Uninstalling

- **Mac:** quit CaptionForge and drag it from Applications to the Trash.
- **Windows:** **Settings → Apps → CaptionForge → Uninstall**.
- To remove projects and AI downloads too, delete the data folder listed above.

## Troubleshooting

| Problem | Fix |
|---|---|
| The browser shows "can't connect" | CaptionForge is not running — open the app again. |
| "CaptionForge could not start" | Another program may be using port 8765. Restart the computer and try again. Details are in the log file (see above). |
| AI install stops | Your internet connection dropped. Click **Try again** — downloads resume. |
| Render fails | Check free disk space; ProRes renders are large (~350 MB per minute). |
