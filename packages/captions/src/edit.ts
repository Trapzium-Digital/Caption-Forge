import { createId, type Cue, type Word } from '@captionforge/project-format'

export const MIN_CUE_MS = 100

export function sortCues(cues: Cue[]): Cue[] {
  return [...cues].sort((a, b) => a.startMs - b.startMs)
}

export function findCueAt(cues: Cue[], timeMs: number): Cue | undefined {
  return cues.find((c) => timeMs >= c.startMs && timeMs < c.endMs)
}

/**
 * Words for a cue. Uses real word timings when present, otherwise spreads the
 * cue duration across words in proportion to their length.
 */
export function cueWords(cue: Cue): Word[] {
  if (cue.words?.length) return cue.words
  const tokens = cue.text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const totalChars = tokens.reduce((n, t) => n + t.length, 0)
  const duration = cue.endMs - cue.startMs
  let cursor = cue.startMs
  return tokens.map((text, i) => {
    const endMs = i === tokens.length - 1 ? cue.endMs : cursor + Math.round((duration * text.length) / totalChars)
    const word = { text, startMs: cursor, endMs }
    cursor = endMs
    return word
  })
}

export function activeWordIndex(cue: Cue, timeMs: number): number {
  return cueWords(cue).findIndex((w) => timeMs >= w.startMs && timeMs < w.endMs)
}

/** Split a cue at a time. Words (if any) are distributed to each side. */
export function splitCue(cue: Cue, atMs: number): [Cue, Cue] | null {
  if (atMs - cue.startMs < MIN_CUE_MS || cue.endMs - atMs < MIN_CUE_MS) return null
  const words = cueWords(cue)
  let left = words.filter((w) => w.startMs < atMs)
  let right = words.filter((w) => w.startMs >= atMs)
  if (left.length === 0 || right.length === 0) {
    // Split text in half by word count when the time split leaves one side empty.
    const mid = Math.max(1, Math.floor(words.length / 2))
    left = words.slice(0, mid)
    right = words.slice(mid)
  }
  const keepWords = Boolean(cue.words?.length)
  return [
    {
      ...cue,
      endMs: atMs,
      text: left.map((w) => w.text).join(' '),
      words: keepWords ? left : undefined,
    },
    {
      ...cue,
      id: createId('cue'),
      startMs: atMs,
      text: right.map((w) => w.text).join(' ') || '…',
      words: keepWords ? right : undefined,
    },
  ]
}

export function mergeCues(a: Cue, b: Cue): Cue {
  const [first, second] = a.startMs <= b.startMs ? [a, b] : [b, a]
  const keepWords = Boolean(first.words?.length && second.words?.length)
  return {
    ...first,
    endMs: Math.max(first.endMs, second.endMs),
    text: `${first.text} ${second.text}`.trim(),
    words: keepWords ? [...first.words!, ...second.words!] : undefined,
  }
}

/** Move a cue by a delta, clamped at zero. Word timings move with it. */
export function shiftCue(cue: Cue, deltaMs: number): Cue {
  const delta = Math.max(deltaMs, -cue.startMs)
  return {
    ...cue,
    startMs: cue.startMs + delta,
    endMs: cue.endMs + delta,
    words: cue.words?.map((w) => ({ ...w, startMs: w.startMs + delta, endMs: w.endMs + delta })),
  }
}

/** Change one edge of a cue, keeping the minimum duration. Explicit words are dropped if they fall outside. */
export function trimCue(cue: Cue, edge: 'start' | 'end', timeMs: number): Cue {
  const t = Math.max(0, Math.round(timeMs))
  const next =
    edge === 'start'
      ? { ...cue, startMs: Math.min(t, cue.endMs - MIN_CUE_MS) }
      : { ...cue, endMs: Math.max(t, cue.startMs + MIN_CUE_MS) }
  if (next.words?.some((w) => w.startMs < next.startMs || w.endMs > next.endMs)) {
    next.words = undefined
  }
  return next
}
