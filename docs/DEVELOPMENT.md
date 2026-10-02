# Development

How CaptionForge is built, how to work on it, and how to produce the installers.

## Requirements

Node.js 20+, Python 3.9+, FFmpeg / FFprobe. (WhisperX needs Python 3.10+, but the AI installer brings its own private Python 3.12.)

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | Check requirements, install packages, create the API environment (`apps/local-api/.venv`), build the web app |
| `npm run setup:ai` | Install the AI runtime (WhisperX, PyTorch, Argos Translate) into the workspace — same code as the in-app button |
| `npm run dev` | Development: Vite dev server (hot reload) on :5173 + API with reload on :8756, opens the browser |
| `npm start` | Everyday use: one server on :8756 that serves the built app and the API |
| `npm test` | TypeScript tests (Vitest) + API tests (pytest, including real renders) |
| `npm run typecheck` / `npm run build` | Type-check / build the web app |
| `node scripts/package.mjs` | Build the installable app for the current OS (see below) |

Set `CAPTIONFORGE_HOME=/some/folder` to use a separate workspace (handy for testing).

## Repository layout

```text
apps/
  web/                 React + TypeScript + Vite, Tailwind CSS + shadcn/ui
    src/features/      home (projects), editor (preview, timeline, inspector, AI, translate, render), runtime
    src/store/         Zustand editor store (undo / redo) + playback clock
  local-api/           FastAPI + SQLite
    app/routes/        health, runtime, projects (+ duplicate), media, jobs, renders, templates, ai
    app/jobs.py        SQLite-backed job queue (survives restarts, cancellable)
    app/workers/       waveform, thumbnail, render, transcription, translation, ai-install
    app/services/      media (FFprobe/FFmpeg), render (Remotion), ai (WhisperX/Argos), ai_install
    app/static.py      serves the built app in production / packaged mode
  ai-worker/           transcribe.py (WhisperX) and translate.py (Argos) - run inside the AI runtime
packages/
  project-format/      canonical .cfproject schema (zod), factory, versioned migrations
  captions/            SRT/VTT, timecodes, editing, speech-aware word timing, transcript -> captions
  caption-styles/      the caption engine shared by preview AND export: 10 styles, layout, animation, keyframes
  rendering/           Remotion composition + render.mjs (uses caption-styles unchanged)
scripts/
  setup.mjs start.mjs dev.mjs api.mjs     cross-platform setup / run scripts
  install-mac.sh install-windows.ps1      one-click installers for people installing from GitHub
  package.mjs                             builds the desktop app
  app/                                    app launchers, Windows installer recipe, icons
docs/                  user and developer documentation, product master plan
```

## Architecture in one paragraph

The browser shows the editor; a local FastAPI server (bound to `127.0.0.1`) stores projects in SQLite, copies media into the workspace and runs heavy work as background jobs. The caption renderer (`packages/caption-styles`, `CaptionLayer`) is a pure function of project + time, used by both the live preview and the Remotion export — so exports match the preview frame for frame. AI runs in a separate Python 3.12 runtime (`<workspace>/runtime/ai`) launched as subprocesses, so the heavy libraries never affect the server.

## Security of the local server

- Listens on `127.0.0.1` only and rejects non-localhost `Host` headers (DNS-rebinding protection).
- Every `/api` call needs a per-install token (`<workspace>/api-token`, mode 0600):
  - development: the Vite proxy adds it as a header;
  - production / packaged: the page sets it as an **HttpOnly, SameSite=Strict** cookie, so scripts cannot read it and other websites cannot send it.
- Subprocesses use argument lists, never shell strings; uploaded file names are sanitised; paths are checked to stay inside the workspace.

## Building the installers

### On a Mac

```bash
npm run setup
node scripts/package.mjs
# -> dist-app/CaptionForge.app and dist-app/CaptionForge-<version>-mac-<arch>.dmg
```

The script bundles a private Python 3.12 with the server, Node.js, a static FFmpeg build, the Remotion renderer with a **pre-built composition** and headless Chrome, plus the app. Downloads are cached in `dist-app/cache/`. Result: ~210 MB DMG, ~680 MB installed. AI is not bundled — the app installs it on demand ("Enable AI captions"), reusing the bundled Python.

### Windows (and Mac) in GitHub Actions

`.github/workflows/package.yml` builds both platforms on GitHub's machines:

- **Manually:** GitHub → **Actions → Package apps → Run workflow**. Download the results from the run's **Artifacts**.
- **Releases:** push a version tag (`git tag v0.33.0 && git push --tags`). The DMG, the Windows `-setup.exe` (Inno Setup) and a portable `.zip` are attached to a GitHub Release automatically.

### Code signing (before public distribution)

Unsigned apps work but show security prompts on first launch (see [Desktop app](DESKTOP-APP.md)). To remove them:

- **macOS:** an Apple Developer ID certificate (Apple Developer Program, $99/year), then `codesign --options runtime` the app and its binaries and notarise it with `xcrun notarytool`.
- **Windows:** an OV or EV code-signing certificate, then `signtool sign` the installer.

## Packaged-mode environment variables

| Variable | Purpose |
|---|---|
| `CAPTIONFORGE_HOME` | Workspace folder (projects, media, renders, AI) |
| `CAPTIONFORGE_STATIC` | Serve the built web app from this folder |
| `CAPTIONFORGE_RENDERER` | Folder with `render.mjs` (+ optional pre-built `bundle/`) |
| `CAPTIONFORGE_AI_WORKERS` | Folder with `transcribe.py` / `translate.py` |
| `CAPTIONFORGE_BUNDLED_PYTHON` | Python 3.12 to reuse for the AI runtime |
| `CAPTIONFORGE_AI_PYTHON` | Use a specific AI runtime Python (testing) |
| `CAPTIONFORGE_PORT` | Port for `npm start` (8756) / the app (8765) |

## What's done

- **v32 architecture** — monorepo, project format with migrations (now v4), local API, job queue, editor, timeline, autosave.
- **10 caption styles** in one engine, templates, keyframes, safe areas, word emphasis, speakers, caption tracks.
- **Rendering** — MP4, transparent ProRes 4444, QuickTime PNG, WebM; every output verified with FFprobe.
- **AI** — WhisperX transcription with exact word timing, speech-aware estimate before that, Argos translation (49 languages), in-app installer.
- **Distribution** — cross-platform setup, one-click installers from GitHub, packaged desktop app, CI builds.

## Next (per the master plan)

- Proxies for 4K media and a render cache (v35), full render certification matrix (v36).
- Code signing and notarisation, auto-update (v37).
- Porting the v1–v31 prototype features (Animation Lab, layers, Brand Kits, Font Studio, audio tracks).

Keyboard: Space play/pause · ←/→ frame step (Shift = 10) · S split · M merge with next · ⌫ delete · ⌘Z / ⇧⌘Z undo / redo · ⌘S save checkpoint
