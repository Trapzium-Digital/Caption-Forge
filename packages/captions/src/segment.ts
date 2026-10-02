import { createId, type Cue, type Word } from '@captionforge/project-format'

/**
 * Turn word-level transcription (WhisperX) into caption cues.
 *
 * A new caption starts on a speaker change, a clear pause, a sentence end, or
 * when the caption would exceed the preset's word / character / duration
 * limits. Breaks prefer punctuation and avoid leaving a single word behind.
 */

export interface TranscribedWord {
  text: string
  /** Missing for tokens WhisperX could not align (e.g. some numbers) - interpolated. */
  startMs?: number
  endMs?: number
  speaker?: string
}

export interface CaptionFormatting {
  maxWords: number
  /** Characters per caption (roughly 2 lines). */
  maxChars: number
  maxDurationMs: number
  /** A silence at least this long always starts a new caption. */
  pauseMs: number
  /** Break after commas too, not just sentence ends. */
  breakOnComma: boolean
  minDurationMs: number
}

export type FormattingPreset = 'social' | 'podcast' | 'cinematic'

export const FORMATTING_PRESETS: Record<FormattingPreset, CaptionFormatting & { label: string; description: string }> = {
  social: {
    label: 'Social',
    description: 'Short, punchy captions (up to 6 words) for TikTok, Reels and Shorts.',
    maxWords: 6,
    maxChars: 32,
    maxDurationMs: 2800,
    pauseMs: 450,
    breakOnComma: true,
    minDurationMs: 600,
  },
  podcast: {
    label: 'Podcast',
    description: 'Full sentences, up to two lines, split on speaker changes.',
    maxWords: 18,
    maxChars: 84,
    maxDurationMs: 6500,
    pauseMs: 900,
    breakOnComma: false,
    minDurationMs: 1000,
  },
  cinematic: {
    label: 'Cinematic',
    description: 'Measured, readable phrases with natural pauses.',
    maxWords: 10,
    maxChars: 52,
    maxDurationMs: 4500,
    pauseMs: 650,
    breakOnComma: true,
    minDurationMs: 900,
  },
}

type TimedWord = TranscribedWord & { startMs: number; endMs: number }

const SENTENCE_END = /[.!?…]["')\]]?$/
const CLAUSE_END = /[,;:—–]["')\]]?$/

/** Fill in missing word times by interpolating between aligned neighbours. */
export function fillWordTimes(words: TranscribedWord[]): TimedWord[] {
  const out = words.map((w) => ({ ...w }))
  for (let i = 0; i < out.length; i++) {
    if (out[i].startMs !== undefined && out[i].endMs !== undefined) continue
    let a = i - 1
    while (a >= 0 && out[a].endMs === undefined) a--
    let b = i + 1
    while (b < out.length && out[b].startMs === undefined) b++
    const from = a >= 0 ? out[a].endMs! : b < out.length ? Math.max(0, out[b].startMs! - 400 * (b - i)) : 0
    const to = b < out.length ? out[b].startMs! : from + 400 * (i - a)
    const slots = b - a - 1
    const step = Math.max(1, (to - from) / slots)
    const k = i - a - 1
    out[i].startMs ??= Math.round(from + step * k)
    out[i].endMs ??= Math.round(from + step * (k + 1))
  }
  return out as TimedWord[]
}

/** Group transcribed words into cues with exact word timings and speakers. */
export function wordsToCues(input: TranscribedWord[], formatting: CaptionFormatting): Cue[] {
  const words = fillWordTimes(input.filter((w) => w.text.trim())).map((w) => ({ ...w, text: w.text.trim() }))
  const groups: (typeof words)[] = []
  let current: typeof words = []
  const chars = (ws: typeof words) => ws.reduce((n, w) => n + w.text.length, 0) + Math.max(0, ws.length - 1)

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const prev = current[current.length - 1]
    if (prev) {
      const pause = word.startMs - prev.endMs
      const speakerChange = (word.speaker ?? '') !== (prev.speaker ?? '')
      const tooLong =
        current.length + 1 > formatting.maxWords ||
        chars([...current, word]) > formatting.maxChars ||
        word.endMs - current[0].startMs > formatting.maxDurationMs
      if (speakerChange || pause >= formatting.pauseMs || tooLong) {
        groups.push(current)
        current = []
      }
    }
    current.push(word)
    // Natural break after punctuation - unless that would strand the next single word of the sentence.
    const next = words[i + 1]
    const endsSentence = SENTENCE_END.test(word.text)
    const endsClause = formatting.breakOnComma && CLAUSE_END.test(word.text)
    const lonelyNext = next && SENTENCE_END.test(next.text) && current.length < formatting.maxWords && chars([...current, next]) <= formatting.maxChars
    if ((endsSentence || endsClause) && !(endsClause && lonelyNext) && current.length > 0) {
      if (endsSentence || current.length >= 2) {
        groups.push(current)
        current = []
      }
    }
  }
  if (current.length) groups.push(current)

  // Avoid one-word captions by joining them to a neighbour of the same speaker when the limits allow.
  for (let g = 0; g < groups.length; g++) {
    if (groups[g].length !== 1 || groups.length < 2) continue
    const word = groups[g][0]
    const before = groups[g - 1]
    const after = groups[g + 1]
    const fits = (grp: typeof words | undefined) =>
      grp && (grp[0].speaker ?? '') === (word.speaker ?? '') && grp.length + 1 <= formatting.maxWords + 1 && chars([...grp, word]) <= formatting.maxChars + 8
    if (before && fits(before) && word.startMs - before[before.length - 1].endMs < formatting.pauseMs && !SENTENCE_END.test(before[before.length - 1].text)) {
      before.push(word)
      groups.splice(g--, 1)
    } else if (after && fits(after) && after[0].startMs - word.endMs < formatting.pauseMs && !SENTENCE_END.test(word.text)) {
      after.unshift(word)
      groups.splice(g--, 1)
    }
  }

  // Timing: hold each caption briefly after the last word, never overlapping the next one.
  return groups.map((grp, g) => {
    const startMs = grp[0].startMs
    const nextStart = groups[g + 1]?.[0].startMs ?? Number.POSITIVE_INFINITY
    const lastEnd = grp[grp.length - 1].endMs
    let endMs = Math.min(nextStart, Math.max(lastEnd + 350, startMs + formatting.minDurationMs))
    if (endMs <= startMs) endMs = startMs + 100
    const speaker = grp[0].speaker
    const cueWords: Word[] = grp.map((w, i) => ({
      text: w.text,
      startMs: w.startMs,
      endMs: i === grp.length - 1 ? endMs : grp[i + 1].startMs,
    }))
    return {
      id: createId('cue'),
      startMs,
      endMs,
      text: grp.map((w) => w.text).join(' '),
      words: cueWords,
      ...(speaker ? { speaker } : {}),
    }
  })
}
