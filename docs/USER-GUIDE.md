# User guide

A quick tour of CaptionForge, from video to finished captions.

## 1. Create a project

On the start screen click **New project**, give it a name and pick a format (Vertical 9:16, Landscape 16:9 or Square). Importing a video sets the size and frame rate to match it automatically.

Project menu (**⋯** on a project card): **Duplicate** (e.g. to make a French version with its own look) and **Delete**.

## 2. Add your video and captions

In the editor, left panel → **Media**:

- **Import media** — your video. It is copied into CaptionForge; the original is never changed.
- **SRT / VTT** — import an existing subtitle file, **or**
- **AI captions** (top bar) — generate captions automatically. See [AI captions & translation](AI-CAPTIONS.md).

## 3. Choose a caption style

Left panel → **Styles** → click **Apply** on a style. Each card shows a real sample.

| Style | Best for |
|---|---|
| **Bold Pop** | High-energy social videos; the spoken word pops in an accent colour |
| **Karaoke** | Whole sentence on screen, each word lights up as it is spoken |
| **Highlight** | Calm captions where only the words you mark are emphasised |
| **Creator** | Premium personal-brand look; the key phrase is larger and bolder |
| **Punch** | Hooks and reactions; words slam in one by one |
| **Minimal** | Documentary, luxury, corporate; quiet and elegant |
| **Word-by-Word** | One word (or a few) at a time at a fixed point |
| **Podcast** | Interviews; speaker names and a colour per speaker |
| **News / Commentary** | Lower-third bar with an accent stripe and speaker tag |
| **Cinematic Social** | Serif film-title look with a slow focus-pull |

Fine-tune everything in the right panel → **Style** (font, colours, position, animation …). **Save as template** in the Styles panel to reuse a look in other projects.

## 4. Edit the captions

- **Captions** tab (left): edit text directly; the track picker on top switches languages; **Translate** makes a new language track.
- **Timeline** (bottom): drag a caption to move it, drag its edges to trim, double-click an empty spot to add one, **S** splits at the playhead.
- **Caption** tab (right): exact start / end times, the speaker's name, and **word emphasis** — click a word to mark it *Important*, *Primary* (strongest) or *Secondary*. Highlight, Creator, News and Cinematic use these marks.
- **Motion** tab: keyframes for position, scale, rotation, opacity, blur, glow and font size.
- **Project** tab: format, frame rate and the platform **safe area** (TikTok, Reels, Shorts …) so captions never sit under the app's buttons.

Everything saves automatically. Undo / redo with **⌘Z / ⇧⌘Z** (Ctrl+Z / Ctrl+Shift+Z on Windows).

## 5. Export

**Export** (top bar) — subtitle files and the project file:

- **SRT** / **VTT** — the active caption track
- **Portable project (.cfproject.json)** — to move a project to another computer

**Render** (top bar) — video files, made on your computer:

| Format | Use it for | Size |
|---|---|---|
| **MP4 video** | The finished video with captions burned in | small (~15 MB/min) |
| **Transparent ProRes 4444 (.mov)** | Captions-only overlay for **Premiere Pro**, Final Cut, DaVinci Resolve, After Effects | large (~350 MB/min) |
| **Transparent QuickTime PNG (.mov)** | Same overlay, lossless, about 3× smaller than ProRes | ~110 MB/min |
| **Transparent WebM** | Captions-only overlay for web tools and CapCut (not Premiere) | small |

For an overlay in Premiere: import the `.mov` and place it on the track above your video.

Every render is checked automatically (size, length, transparency) before it is offered for download. Earlier renders are listed in the Render window.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Previous / next frame (Shift = 10 frames) |
| S | Split the caption at the playhead |
| M | Merge with the next caption |
| ⌫ / Delete | Delete the selected caption |
| ⌘Z / ⇧⌘Z | Undo / redo |
| ⌘S | Save a checkpoint |
