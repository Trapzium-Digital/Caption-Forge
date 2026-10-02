# CaptionForge — Local Web Application Master Plan

## 1. Product Direction

CaptionForge should be built as a **100% local-machine application with a web-based user interface**.

The primary product is not a cloud SaaS.

The browser is the editor UI, while the processing engine, project storage, AI transcription, rendering, fonts, media and exports all run on the user's own computer.

The target experience is:

```text
User installs CaptionForge
        ↓
CaptionForge starts local services
        ↓
Browser opens automatically
        ↓
http://localhost:5173
        ↓
Everything runs locally
```

The application should work without:

- a cloud account
- internet access
- remote video upload
- cloud rendering
- cloud transcription
- a subscription for core functionality

The architecture should still be modular enough that a future cloud edition can be added without rewriting the editor.

---

# 2. Final Product Architecture

```text
                         USER COMPUTER
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│                    CaptionForge Web UI                        │
│                   React + TypeScript                          │
│                           │                                   │
│                           ▼                                   │
│                    Local API Server                           │
│                        FastAPI                                │
│                           │                                   │
│        ┌──────────────────┼──────────────────┐               │
│        ▼                  ▼                  ▼               │
│      SQLite          Local Job Queue     File System          │
│   users/settings      jobs/progress      media/fonts          │
│   projects/metadata                       projects           │
│                                           renders             │
│                                           cache               │
│                                                               │
│        ┌──────────────────┬──────────────────┐               │
│        ▼                  ▼                  ▼               │
│      FFmpeg            Remotion           WhisperX             │
│      FFprobe            Renderer           PyTorch             │
│                                                               │
│        ┌──────────────────┬──────────────────┐               │
│        ▼                  ▼                  ▼               │
│   Audio Tracks         Waveform/Proxy     AI Models           │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

The browser should communicate with localhost APIs and services only.

---

# 3. Web Application vs Desktop Application

CaptionForge should be considered a **local web application** first.

That means:

- React/TypeScript provides the UI.
- FastAPI provides the local application API.
- FFmpeg provides media processing.
- Remotion provides production rendering.
- WhisperX provides local AI transcription/alignment.
- SQLite provides persistent local metadata.
- The filesystem stores large project/media assets.

A Tauri application can later package the same local web application into:

- macOS application
- Windows application
- Linux application

Tauri is therefore a **packaging layer**, not a separate product architecture.

```text
                   CaptionForge Core
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       Browser / localhost       Tauri shell
              │                     │
              └──────────┬──────────┘
                         ▼
                  Same local engine
```

The editor should never be duplicated between web and desktop.

---

# 4. Existing CaptionForge Foundation

The current prototype already contains a substantial editor foundation.

## Caption Editing

- Video upload
- SRT import
- VTT import
- ASS/SSA import
- Editable caption cues
- Cue splitting
- Cue merging
- Cue deletion
- Cue timing adjustment
- Word-level timing
- Word timing editor
- Precision timeline
- Waveform
- Playhead seeking
- Frame stepping
- Snap-to-frame timing

## Visual Styling

- Caption styling
- Font selection
- Font Studio
- Custom font upload
- Brand Kits
- Caption templates
- Backgrounds
- Pills
- Outlines
- Gradients
- Glow
- Karaoke highlighting
- Word effects
- Multiple layout modes
- Safe areas
- Anchors
- Alignment guides
- Layout presets

## Animation

- Animation Lab
- Entrance animations
- Exit animations
- Active-word animations
- Per-layer animations
- Keyframes
- Position keyframes
- Scale keyframes
- Rotation keyframes
- Opacity keyframes
- Blur keyframes
- Glow keyframes
- Font-size keyframes
- Background-property keyframes
- Interpolation modes

## Composition

- Multiple independent layers
- Text layers
- Lower thirds
- Shapes
- Emoji layers
- Logo/image layers
- Stickers
- Layer timing
- Layer ordering
- Layer visibility
- Layer locking
- Layer duplication

## Audio

- Multiple audio tracks
- Audio assets
- Audio waveforms
- Volume
- Fade in/out
- Loop
- Mute
- Solo

## AI

- AI Caption Studio UI
- WhisperX architecture
- Language detection flow
- Word-level alignment flow
- Caption segmentation
- Speaker-aware caption model
- Speaker diarization architecture

Actual WhisperX inference still needs to be packaged into the local runtime.

## Projects

- IndexedDB projects
- Autosave
- Project duplication
- Media bin
- Multiple assets
- Project backup/restore
- Portable `.cfproject.json` packages
- Template persistence
- Font persistence
- Brand Kit persistence

IndexedDB should remain useful for browser UI state and fast caching, but persistent project data should move toward local SQLite/filesystem storage.

## Rendering

- Remotion architecture
- FFmpeg processing
- MP4 export architecture
- Transparent WebM architecture
- SRT export
- VTT export
- Render jobs
- Progress tracking
- Cancellation
- Render history
- Render preflight
- FFprobe validation
- Alpha transparency validation
- Checksums
- Render certification scripts

The remaining render certification requirement is to run the full pinned Remotion dependency stack in the target local runtime and execute real production exports.

---

# 5. Local Runtime Components

CaptionForge should manage a controlled local runtime.

Core components:

```text
React / Vite
FastAPI
Python
FFmpeg
FFprobe
Node.js
Remotion
WhisperX
PyTorch
SQLite
```

The application should detect the runtime at startup.

Example diagnostic state:

```text
CaptionForge Runtime

✓ Python
✓ FFmpeg
✓ FFprobe
✓ Node
✓ Remotion
✓ SQLite
✓ WhisperX
✓ PyTorch
```

When something is missing, the application should show exactly what is unavailable and how to repair the installation.

---

# 6. Local Project Storage

Projects should be stored on the user's computer.

Suggested structure:

```text
CaptionForge/
├── projects/
├── media/
├── fonts/
├── templates/
├── brands/
├── cache/
├── proxies/
├── waveforms/
├── renders/
├── models/
├── logs/
└── database.sqlite
```

The exact location should use the operating system's application-data directory.

Examples:

```text
macOS:
~/Library/Application Support/CaptionForge/

Windows:
%APPDATA%/CaptionForge/

Linux:
~/.local/share/CaptionForge/
```

The user should also be able to choose a custom project workspace.

---

# 7. SQLite

Use SQLite for local persistent metadata.

Suggested tables:

```text
projects
project_versions

media_assets
media_variants
media_metadata

caption_tracks
caption_cues
caption_words

composition_layers
keyframes

audio_tracks
audio_clips

fonts
brand_kits
templates
layout_presets

transcription_jobs
render_jobs
media_jobs

render_outputs

app_settings
workspace_settings
recent_projects
```

SQLite is appropriate because the primary application is running on a single user's computer.

There is no need to introduce PostgreSQL for the core product.

---

# 8. Local Job Queue

Heavy operations must not block the web UI.

Use a local job system.

```text
Browser
   ↓
Local API
   ↓
Local Job Queue
   ├── transcription
   ├── rendering
   ├── media processing
   ├── waveform
   ├── thumbnails
   └── proxies
```

The UI should receive progress such as:

```text
Queued
Preparing
Processing
Rendering
Encoding
Verifying
Complete
Failed
Cancelled
```

A lightweight SQLite-backed queue or local process manager is preferable to requiring a separately installed Redis server for the core application.

Redis may remain optional for future advanced/local multi-process workloads.

---

# 9. Browser Responsibilities

The browser should handle:

- Editor UI
- Timeline interaction
- Caption editing
- Word timing
- Styling controls
- Layer composition
- Keyframe editing
- Visual preview
- Media-bin UI
- Project navigation
- Local draft cache
- Upload/import controls
- Render progress
- Job status
- User preferences

Heavy processing should run through local worker processes rather than in the browser's main thread.

---

# 10. Local API

FastAPI should become the local application API.

Example endpoints:

```text
GET    /api/health
GET    /api/runtime
GET    /api/projects
POST   /api/projects
GET    /api/projects/{id}
PUT    /api/projects/{id}
DELETE /api/projects/{id}

POST   /api/media/import
GET    /api/media/{id}
DELETE /api/media/{id}

POST   /api/transcriptions
GET    /api/transcriptions/{id}
DELETE /api/transcriptions/{id}

POST   /api/renders
GET    /api/renders/{id}
DELETE /api/renders/{id}

GET    /api/fonts
POST   /api/fonts
DELETE /api/fonts/{id}

GET    /api/templates
POST   /api/templates

GET    /api/brands
POST   /api/brands
```

Because the API is local, authentication is not required for the core single-user application.

A local application token can still be used to prevent unrelated local processes from calling privileged endpoints.

---

# 11. Local Media Pipeline

When the user imports a video:

```text
Import Video
    ↓
FFprobe
    ↓
Metadata
    ├── resolution
    ├── FPS
    ├── duration
    ├── audio
    └── codecs
    ↓
Media Worker
    ├── thumbnail
    ├── waveform
    ├── audio proxy
    └── preview proxy
```

The original source file remains untouched.

CaptionForge should never destructively modify the user's source media.

---

# 12. Large Media Performance

The local application must handle large videos without freezing the editor.

Implement:

- Proxy media
- Thumbnail caching
- Waveform caching
- Audio-only proxy
- Background processing
- Asset caching
- Render cache
- Preview quality control
- Memory-aware cleanup
- Proxy switching
- Temporary-file cleanup

Example:

```text
Original 4K
    ↓
Proxy 720p
    ↓
Timeline preview

Original 4K
    ↓
Production render
```

---

# 13. Local AI Caption Studio

WhisperX should run entirely on the user's machine.

Flow:

```text
Video
  ↓
FFmpeg audio extraction
  ↓
WhisperX
  ↓
Language detection
  ↓
Alignment
  ↓
Optional diarization
  ↓
Word timestamps
  ↓
Caption segmentation
  ↓
Formatting
  ↓
Editable caption track
```

The UI should show:

```text
Model:
Small / Medium / Large

Device:
CPU / GPU

Language:
Auto / Manual

Speaker Detection:
On / Off

Formatting:
Social / Podcast / Cinematic / Custom
```

The application should provide model download and management.

Once a model is installed, transcription should work offline.

---

# 14. Local Rendering

Rendering should stay on the user's machine.

```text
Project
   ↓
Local preflight
   ↓
Remotion
   ↓
FFmpeg
   ↓
Verification
   ↓
Local export
```

Supported outputs:

```text
MP4
WebM with alpha
SRT
VTT
```

Production render states:

```text
queued
preflight
preparing
bundling
rendering
encoding
verifying
complete
failed
cancelled
```

Render jobs should survive application restarts.

---

# 15. Production Render Certification

The final local runtime must execute actual renders.

Required certification matrix:

```text
1080p / 24 FPS
1080p / 30 FPS
1080p / 60 FPS
4K / 24 FPS
4K / 30 FPS
4K / 60 FPS
```

Test combinations:

```text
caption-only
video + captions
multiple layers
keyframes
custom fonts
variable fonts
multiple audio tracks
transparent WebM
SRT
VTT
long-duration projects
large files
```

Each render should be verified using FFprobe and decoded media inspection.

The certification script should output:

```text
PASS
FAIL
BLOCKED
```

with logs explaining failures.

---

# 16. Font Architecture

Fonts must render consistently in:

```text
Browser
   +
Remotion
   +
Final export
```

Pipeline:

```text
Font upload
    ↓
Validate
    ↓
Read metadata
    ↓
Extract family/weight/style
    ↓
Generate deterministic asset ID
    ↓
Store locally
    ↓
Associate with project
    ↓
Generate @font-face
    ↓
Load in renderer
    ↓
Wait for font readiness
    ↓
Render
```

Support:

- TTF
- OTF
- WOFF
- WOFF2
- variable fonts

The user should see:

```text
Font Family
Weight
Style
Variable Axes
File Format
Status
```

Missing fonts should appear in render preflight.

---

# 17. Image / Logo Assets

Composition image layers should use local assets.

Pipeline:

```text
Image import
   ↓
Validate
   ↓
Generate asset ID
   ↓
Store in project workspace
   ↓
Preview
   ↓
Package into render
```

The render engine must use the exact local image asset selected by the project.

---

# 18. Portable Projects

`.cfproject.json` remains the portable project format.

A project package should reference:

```text
project metadata
captions
word timings
layers
keyframes
audio
render settings
font manifest
media manifest
brand data
templates
```

For portability, allow two modes.

### Lightweight package

References external local media.

### Full package

Contains:

```text
project.json
media/
fonts/
images/
audio/
templates/
```

A full package can be moved to another computer.

---

# 19. Autosave and Recovery

Autosave should write to local storage.

Recommended behavior:

```text
Edit
 ↓
Debounced autosave
 ↓
SQLite/project JSON
 ↓
Recovery checkpoint
```

Use:

- autosave timer
- dirty-state tracking
- crash recovery
- last-known-good project
- project version history

When reopening after a crash:

```text
We found a recoverable version.

Restore
Discard
Compare
```

---

# 20. Local Security

Even though the application is local, it should still have security controls.

Implement:

- Path validation
- Safe file handling
- Import MIME validation
- File-size limits
- Sanitized filenames
- Render-job isolation
- Temporary-directory cleanup
- Local API token
- Safe subprocess execution
- No shell string interpolation
- Restricted filesystem operations

Never pass raw user strings directly into shell commands.

---

# 21. Privacy Model

CaptionForge's local-first promise should be clear.

Core media remains on the machine.

AI processing is local.

Rendering is local.

Projects are local.

Exports are local.

No account is required for core functionality.

Any future online features must be explicit and opt-in.

---

# 22. Future Cloud Edition

Cloud should be optional and separate from the core architecture.

Potential future product:

```text
CaptionForge Local
        +
Optional CaptionForge Cloud
```

Cloud could add:

- Account synchronization
- Cloud backups
- Team collaboration
- Shared projects
- Remote rendering
- Remote AI processing
- Cross-device access
- Usage billing

But the local product should remain usable without those services.

---

# 23. Recommended Repository Structure

The current single-file prototype should evolve into a modular application.

```text
captionforge/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── public/
│   │   └── vite.config.ts
│   │
│   └── local-api/
│       ├── app/
│       ├── routes/
│       ├── services/
│       └── workers/
│
├── packages/
│   ├── editor/
│   ├── captions/
│   ├── timeline/
│   ├── animation/
│   ├── composition/
│   ├── audio/
│   ├── project-format/
│   ├── templates/
│   ├── fonts/
│   └── rendering/
│
├── runtime/
│   ├── ffmpeg/
│   ├── ffprobe/
│   ├── python/
│   ├── whisperx/
│   ├── models/
│   └── node/
│
├── desktop/
│   └── tauri/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── docs/
```

The `desktop/tauri` package is optional.

The primary application remains the local web application.

---

# 24. Development Architecture

During development:

```text
npm run dev:web
```

starts the React/Vite application.

```text
python -m uvicorn app.main:app
```

starts the local API.

For convenience, a single command should eventually start everything:

```text
npm run dev
```

and open:

```text
http://localhost:5173
```

---

# 25. Production Local Launch

The finished installation should behave like an application.

User experience:

```text
Open CaptionForge
      ↓
Runtime checks
      ↓
Start local API
      ↓
Start workers
      ↓
Open browser window
      ↓
CaptionForge editor
```

The user should not have to open terminals or run Python commands manually.

---

# 26. Operating System Packaging

The long-term distribution target is:

### macOS

```text
CaptionForge.app
CaptionForge.dmg
```

### Windows

```text
CaptionForge.exe
CaptionForge.msi
```

### Linux

```text
CaptionForge.AppImage
CaptionForge.deb
```

Tauri should package the local web UI and local runtime components.

---

# 27. Desktop Runtime Strategy

The desktop client can bundle or provision:

```text
Tauri
  +
React application
  +
FastAPI/local API
  +
Python runtime
  +
FFmpeg
  +
FFprobe
  +
Node/Remotion
  +
WhisperX
  +
AI model manager
```

Because these components are local, the user can work offline.

Large optional AI models can be downloaded after installation if installer size becomes too large.

---

# 28. Final Local Product Flow

```text
OPEN CAPTIONFORGE
       ↓
Create / Open Project
       ↓
Import Video
       ↓
AI Captions OR Import SRT
       ↓
Edit Timeline
       ↓
Edit Word Timing
       ↓
Style Captions
       ↓
Animate
       ↓
Add Layers
       ↓
Add Audio
       ↓
Preview
       ↓
Render Locally
       ↓
Verify
       ↓
Export
```

The user should never need to understand:

- FFmpeg
- Remotion
- WhisperX
- Python
- Node.js
- SQLite

These are implementation details.

---

# 29. Development Roadmap

## v32 — Local Web Architecture

Refactor the current prototype into a proper modular web application.

Build:

- React/TypeScript frontend
- Vite application
- FastAPI local API
- SQLite persistence
- Local project filesystem
- Local job queue
- Shared project format
- Shared editor packages

Goal:

**A maintainable local web application architecture.**

---

## v33 — Local Runtime

Build the controlled local runtime.

Bundle/manage:

- Python
- FFmpeg
- FFprobe
- Node
- Remotion
- SQLite
- runtime diagnostics
- local process management

Goal:

**CaptionForge starts without developer tools.**

---

## v34 — Local AI Runtime

Build:

- WhisperX runtime
- PyTorch
- model manager
- CPU/GPU detection
- model download
- language detection
- alignment
- diarization
- transcription queue
- progress reporting

Goal:

**Offline AI captions actually work.**

---

## v35 — Local Media Performance

Build:

- Proxy generation
- 4K media workflow
- Large-file processing
- Background processing
- Media caching
- Waveform caching
- Thumbnail caching
- Render cache
- Memory management

Goal:

**Large professional projects remain responsive.**

---

## v36 — Production Render Certification

Build and execute:

- 1080p tests
- 4K tests
- 24/30/60 FPS
- MP4
- transparent WebM
- SRT
- VTT
- audio
- custom fonts
- layers
- keyframes
- effects
- long videos
- crash recovery

Goal:

**Verified local production renderer.**

---

## v37 — Native Packaging

Build:

- macOS installer
- Windows installer
- Linux package
- native file picker
- auto-launch
- local runtime bootstrap
- diagnostics
- crash logs
- update mechanism

Goal:

**A real installable CaptionForge application.**

---

## v38 — Professional Release QA

Test:

- clean installations
- upgrades
- uninstall/reinstall
- project recovery
- missing dependencies
- missing fonts
- missing media
- corrupted projects
- interrupted renders
- large media
- GPU/CPU fallback
- offline operation

Goal:

**Release-candidate stability.**

---

## v39 — Public Local Release

Ship:

- website
- downloads
- documentation
- tutorials
- example projects
- installer packages
- changelog
- support workflow

Goal:

**Public CaptionForge release.**

---

## v40+ — Optional Cloud Edition

Only after the local product is stable.

Potential features:

- accounts
- sync
- cloud backup
- collaboration
- remote rendering
- remote AI
- team workspaces
- billing

The local application remains the foundation.

---

# 30. What Should NOT Be Added to the Core Local Product

Do not make the core application dependent on:

- PostgreSQL
- Redis server
- S3
- cloud render workers
- cloud AI workers
- mandatory authentication
- mandatory internet
- cloud project storage
- subscription billing

These can exist only in an optional cloud edition.

---

# 31. Architectural Principles

### Local first

The application must be useful with no internet connection.

### One editor core

Web and desktop must use the same editor code.

### One project format

Do not create different project schemas for different clients.

### Non-destructive editing

Never modify original user media.

### Asynchronous heavy work

Rendering, transcription and media conversion run outside the UI thread.

### Deterministic rendering

The same project should produce reproducible output.

### Explicit runtime diagnostics

Users should know exactly what is installed, missing or failing.

### Privacy by default

Media remains local unless the user explicitly chooses an online feature.

---

# 32. Immediate Next Build

The next implementation should be:

## CaptionForge v32 — Local Web Architecture

Priority order:

1. Split the current monolithic HTML into a React/TypeScript application.
2. Extract caption, timeline, animation, composition, audio and project engines into reusable packages.
3. Build the FastAPI local API.
4. Add SQLite persistence.
5. Define the canonical `.cfproject` schema.
6. Move project/media persistence from IndexedDB-only storage to local filesystem + SQLite.
7. Create the local job manager.
8. Create local worker interfaces for rendering, transcription and media processing.
9. Preserve IndexedDB for fast UI caching.
10. Keep the Tauri project as an optional future packaging layer.
11. Preserve backward compatibility with existing v1–v31 projects.
12. Add an automated migration system so old projects can be upgraded safely.

The target is:

```text
                         CaptionForge
                              │
                     Local Web Application
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
        React Editor                      Local API
             │                                 │
             └────────────────┬────────────────┘
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
              SQLite       Job Queue    File System
                 │            │            │
                 │      ┌─────┼─────┐      │
                 │      ▼     ▼     ▼      │
                 │   AI     Render Media   │
                 │ Worker   Worker Worker  │
                 │      │     │     │      │
                 └──────┴─────┴─────┴──────┘
                              │
                     FFmpeg / Remotion
                     WhisperX / PyTorch
```

This is the foundation for turning CaptionForge into a **fully local, private, offline-capable professional caption editor with a browser-based UI**, while preserving the option to ship the same core as a desktop application later.
