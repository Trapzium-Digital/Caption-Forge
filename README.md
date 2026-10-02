<p align="center">
  <img src="apps/web/public/favicon.svg" width="88" alt="CaptionForge logo">
</p>

<h1 align="center">CaptionForge</h1>

<p align="center">
  Professional social-media captions, made on your own computer.<br>
  Edit in your browser · AI captions with exact word timing · 10 caption styles · Renders for TikTok, Reels, Shorts and Premiere Pro
</p>

---

CaptionForge is a **local-first** caption editor. The editor runs in your web browser, but everything else — your videos, AI transcription, translation and rendering — runs **on your computer**. Nothing is uploaded, no account is needed, and once installed it works offline.

## Features

- **10 social caption styles** — Bold Pop, Karaoke, Highlight, Creator, Punch, Minimal, Word-by-Word, Podcast, News / Commentary and Cinematic Social — each fully customisable and saveable as a template.
- **AI captions** — automatic transcription with WhisperX: every word gets an exact timestamp (median error 18 ms), language detection, optional speaker detection.
- **Translation** — turn your captions into 49 languages (offline, Argos Translate), as a separate caption track.
- **Precise editing** — timeline with waveform, drag / trim / split captions, word emphasis, speakers, keyframes, safe areas for every platform, undo / redo, autosave.
- **Export** — MP4 with captions burned in, **transparent ProRes 4444 or QuickTime PNG for Premiere Pro / Final Cut / DaVinci Resolve**, transparent WebM, SRT and VTT.
- **Private by design** — your media never leaves your computer.

## Get CaptionForge

Choose the way that suits you:

| | Who it's for | How |
|---|---|---|
| **1. Download the app** | Everyone | Download the installer for Mac (`.dmg`) or Windows (`-setup.exe`) from the [Releases page](../../releases) and install it like any other app. → [Desktop app guide](docs/DESKTOP-APP.md) |
| **2. Install from GitHub — Mac** | People comfortable downloading a folder from GitHub | Download this repository and double-click **`Install CaptionForge (Mac).command`**. → [Mac guide](docs/INSTALL-MAC.md) |
| **3. Install from GitHub — Windows** | Same, on Windows 10 / 11 | Download this repository and double-click **`Install CaptionForge (Windows).bat`**. → [Windows guide](docs/INSTALL-WINDOWS.md) |

AI captions are optional. They add about 1.1 GB, so they are **not** included in the first download — click **Enable AI captions** inside the app whenever you want them.

## How big is it?

| | Download | On disk |
|---|---|---|
| CaptionForge app (editor, all styles, rendering) | ~210 MB | ~680 MB |
| + AI captions (WhisperX, translation engine) | +1.1 GB | +1.1 GB |
| + Speech model (Small; Medium 1.5 GB / Large 3 GB optional) | +465 MB | +465 MB |
| + Word-timing model, per spoken language | +360 MB | +360 MB |
| + Translation pack, per target language | ~140 MB | ~140 MB |

Models download once, the first time you use them, and then work offline.

## Documentation

- [Desktop app (installers)](docs/DESKTOP-APP.md)
- [Install from GitHub on Mac](docs/INSTALL-MAC.md)
- [Install from GitHub on Windows](docs/INSTALL-WINDOWS.md)
- [User guide](docs/USER-GUIDE.md)
- [AI captions & translation](docs/AI-CAPTIONS.md)
- [For developers: development, tests, building installers](docs/DEVELOPMENT.md)
- [Product master plan](docs/MASTER-PLAN.md)

## Your data

Projects, imported media, renders and AI models are stored in your user folder — not in the app or this repository:

- **macOS:** `~/Library/Application Support/CaptionForge/`
- **Windows:** `%APPDATA%\CaptionForge\`

Imported videos are copied there; your original files are never modified.

## License and third-party software

CaptionForge uses open-source components including FFmpeg, WhisperX (OpenAI Whisper), PyTorch, Argos Translate / OPUS-MT and Remotion. **Remotion is free for individuals and companies with up to 3 people; larger companies need a [Remotion company license](https://www.remotion.dev/license).** Check the licences of these components before distributing CaptionForge commercially.
