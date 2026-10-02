# CaptionForge

A local-first caption editor. The browser is the editor; media processing, storage and (later) AI transcription and rendering all run on your computer. See [the master plan](<CaptionForge_Web_App_Master_Plan (1).md>).

## Quick start

Requirements: Node.js 20+, Python 3.9+, FFmpeg/FFprobe (`brew install ffmpeg`).

```bash
npm install          # web app + shared packages
npm run setup:api    # Python venv for the local API
npm run dev          # starts API + web UI and opens http://127.0.0.1:5173
```

Data lives in the OS application-data folder (macOS: `~/Library/Application Support/CaptionForge/`). Set `CAPTIONFORGE_HOME=/some/folder` to use a different workspace.

## Tests

```bash
npm test             # TypeScript package tests (Vitest) + API tests (pytest)
npm run typecheck
```

## Layout

```text
apps/
  web/                React + TypeScript + Vite, Tailwind CSS + shadcn/ui
    src/features/     home (projects), editor (preview, timeline, inspector, media bin), runtime
    src/store/        Zustand editor store (undo/redo) + playback clock
  local-api/          FastAPI + SQLite
    app/routes/       /api/health, runtime, projects, media, jobs, transcriptions, renders
    app/jobs.py       SQLite-backed job queue (survives restarts, cancellable)
    app/workers/      waveform + thumbnail workers; transcription/render interfaces
packages/
  project-format/     canonical .cfproject schema (zod), factory, migrations (v1 -> v2)
  captions/           SRT/VTT import/export, timecodes, split/merge/trim, word timing
  caption-styles/     the caption engine shared by preview AND export: style registry (Bold Pop),
                      measurement, phrase-aware wrapping + paging, animation, keyframes, safe areas
  rendering/          Remotion composition + render.mjs (uses caption-styles unchanged)
scripts/dev.mjs       one-command launcher
```

## Local API security

The API binds to `127.0.0.1` only, rejects non-localhost `Host` headers (DNS-rebinding protection), and requires a per-install token (stored in the workspace as `api-token`, mode 0600) on every `/api` call except `/api/health`. In development the Vite proxy attaches the token, so the browser never handles it. Subprocesses use argument lists, never shell strings; uploaded filenames are sanitised and paths are checked to stay inside the workspace.

## Status (v32 — local web architecture)

Done:
- Monorepo, shared project format with versioned migrations, captions engine
- Local API: SQLite (schema migrations), projects + version checkpoints, streamed media import with FFprobe validation, waveform/thumbnail background jobs, runtime diagnostics
- Editor: projects screen, resizable editor layout, video preview with styled captions + karaoke, canvas timeline (move/trim/split/add, frame + playhead snapping, zoom, waveform), caption list, style inspector, undo/redo, autosave, keyboard shortcuts
- Export: SRT, VTT, portable `.cfproject.json`

Bold Pop (first social caption style):
- Word-timed active word (accent color + controlled 1.12x pop; also Bounce/Glow/Highlight/Underline), fade-rise enter, fade-drop exit
- Phrase-aware balanced wrapping (max lines, no orphans, no line ending on "the/to/of…"), long cues paged by word timing
- 9-point anchor + offsets inside platform safe areas (TikTok / Reels / Shorts / custom), max width
- Outline, shadow, soft or pill background; full inspector; caption-layer keyframes (X, Y, scale, rotation, opacity, blur, glow, font size)
- Templates: save, apply, update, duplicate, create variant, rename, delete
- Remotion render (MP4, transparent WebM) with the same renderer as the preview, verified with FFprobe
- The first render downloads Chrome Headless Shell (~100 MB) once.

Karaoke (second style, same engine):
- Whole caption stays visible; the spoken word lights up with a gentle 1.00 → 1.06 → 1.00 pop
- Highlight modes: Color, Color + Pop, Pill, Underline, Glow (with pill padding/radius, underline thickness, glow strength)
- Dedicated Highlight section in the inspector; project schema v3 (older projects migrate automatically, Bold Pop unchanged)

All ten social caption styles (one engine, one renderer for preview and export):
- Bold Pop, Karaoke, Highlight, Creator, Punch, Minimal, Word-by-Word, Podcast, News / Commentary, Cinematic Social
- Each style is a preset in `packages/caption-styles/src/registry.ts` (defaults + which inspector sections it shows)
- Engine features: reveal modes (whole cue / words as spoken / one group at a time), manual word emphasis
  (Important / Primary / Secondary, set in the Caption tab), speaker labels + per-speaker colors,
  band and bar backgrounds, overshoot / blur / wipe entrances, scale-down / blur exits
- Project schema v4 (older projects and templates migrate automatically; Bold Pop and Karaoke unchanged)

AI captions (WhisperX, fully local):
- `npm run setup:ai` installs a private Python 3.12 + WhisperX/PyTorch into `runtime/` (nothing system-wide)
- Editor: **AI captions** -> model (Small / Medium / Large Turbo / Large), language (auto or chosen), optional
  speaker detection (needs a free Hugging Face token, stored locally), formatting (Social / Podcast / Cinematic / Custom)
- Every word gets an exact timestamp (measured median error 18 ms); models download once into the workspace `models/`
- "Re-format last transcription" re-splits captions without re-processing
- Until a video is transcribed, word timing follows the speech in the waveform (speech-aware estimate)

Translation and duplication:
- **Translate** (above the caption list) creates a new caption track in another language, offline with Argos Translate /
  OPUS-MT (49 languages from English, ~100 MB pack each, downloaded once). Timing is kept per caption.
- Caption tracks: switch, rename, delete. The active track is what the preview shows, SRT/VTT export and the renderer use.
- **Duplicate** (project menu) copies a project; video files are shared, not copied, and only deleted with their last user.

Next (per the plan):
- v35: proxies for 4K media, render cache
- Porting the v1–v31 prototype features (Animation Lab, layers, brand kits, Font Studio, audio tracks) and importing old projects

Keyboard: Space play/pause · ←/→ frame step (Shift = 10) · S split · M merge with next · ⌫ delete · ⌘Z / ⇧⌘Z undo/redo · ⌘S save checkpoint
