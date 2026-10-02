# AI captions & translation

CaptionForge can write your captions for you and translate them — entirely on your computer. Your video is never uploaded.

## Turn it on (once)

AI is optional and downloaded separately (about **1.1 GB**). In a project with a video, click **AI captions** → **Enable AI captions** and wait for the progress bar to finish. (Developers can also run `npm run setup:ai`.)

## Generate captions

1. Click **AI captions** in the top bar.
2. Choose:
   - **Model** — *Small* is fast and good for clear speech. *Medium*, *Large (Turbo)* and *Large* are more accurate but bigger and slower. Each model downloads the first time you use it.
   - **Language** — *Detect automatically*, or pick the language spoken in the video.
   - **Speaker detection** — labels who is speaking (for the Podcast and News styles). See below.
   - **Formatting** — how captions are split: *Social* (short, up to ~6 words), *Podcast* (full sentences), *Cinematic* (measured phrases) or *Custom* (your own limits).
3. Click **Generate captions**.

Every word gets its exact start and end time, so highlighting styles (Bold Pop, Karaoke, Word-by-Word …) follow the voice precisely. Your current captions are replaced — **⌘Z** undoes it.

**Re-format last transcription** re-splits the captions in another format instantly, without processing the video again.

### Speed

On an Apple M4 Pro, a 36-second video takes about 45 seconds the first time (including loading the model) — faster afterwards. Long videos scale roughly with their length.

### Accuracy tips

- Pick the spoken language instead of *Detect automatically* if you know it.
- Use a larger model for noisy audio, accents or fast speech.
- Always proofread names and brands (e.g. "SeevCash") — fix them directly in the caption list.

### Speaker detection

Speaker detection uses the **pyannote** model, which requires a free Hugging Face account:

1. Create a token at <https://huggingface.co/settings/tokens> (type *Read*).
2. Open <https://huggingface.co/pyannote/speaker-diarization-community-1> and accept the conditions.
3. Turn on **Speaker detection** in the AI captions window and paste the token. It is stored only on your computer.

Speakers appear as *Speaker 1*, *Speaker 2* … — rename them in the **Caption** tab.

### Videos with two languages

Each run uses one language. For a video that mixes languages, choose the main language and correct the other parts by hand.

## Translate captions

1. In the **Captions** tab, click **Translate**.
2. Choose the language to translate **from** (the language of your current captions) and **to**.
3. Click **Translate to …**. A new caption track appears (e.g. *French*); the original is untouched.

Switch between languages with the **track picker** above the caption list. The active track is what you see, export as SRT/VTT and render.

- **49 target languages** from English, including French, Spanish, Portuguese, German, Italian, Dutch, Arabic, Chinese, Japanese, Korean, Hindi, Russian, Turkish, Polish, Ukrainian, Indonesian, Swahili and more.
- Each language pack (~140 MB) downloads once, then works offline.
- Timing is kept caption by caption. Because the speaker still says the original words, word-by-word highlighting in a translated track follows the rhythm of the speech rather than exact words.
- Machine translation is good but not perfect — proofread before publishing.

## Before AI captions: speech-aware timing

Captions imported from an SRT/VTT file have no word timings. CaptionForge then times each word from the audio itself — starting with the voice, skipping silences and splitting at pauses — so highlighting is close to the speech. Generating AI captions replaces this with exact timings.

## Where AI files are stored

| | Mac | Windows |
|---|---|---|
| AI runtime | `~/Library/Application Support/CaptionForge/runtime/` | `%APPDATA%\CaptionForge\runtime\` |
| Models and language packs | `…/CaptionForge/models/` | `%APPDATA%\CaptionForge\models\` |

Delete these folders to free the space; CaptionForge will offer to download them again when needed.
