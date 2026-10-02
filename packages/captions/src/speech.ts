import type { Cue, Word } from '@captionforge/project-format'

/**
 * Speech-aware word timing (used until WhisperX supplies real word timestamps).
 *
 * The audio envelope shows where someone is actually speaking. Words are laid
 * out over the voiced parts of the cue only - skipping the silence before,
 * between and after phrases - and word boundaries snap to pauses. Pure and
 * deterministic, so the preview and the export compute identical timings.
 */

export interface SpeechEnvelope {
  /** Envelope samples per second (the waveform is 100). */
  peaksPerSecond: number
  /** Peak level 0..1 per sample. */
  peaks: number[]
}

/** Highlight a word this long before its estimated onset - reads as "on time". */
export const WORD_LEAD_MS = 40
const MERGE_GAP_MS = 70
const MIN_RUN_MS = 30

interface Run {
  start: number
  end: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]
}

/** Voiced stretches inside [startMs, endMs), using a threshold adapted to this cue's loudness. */
export function voicedRuns(env: SpeechEnvelope, startMs: number, endMs: number): Run[] {
  const step = 1000 / env.peaksPerSecond
  const from = Math.max(0, Math.floor(startMs / step))
  const to = Math.min(env.peaks.length, Math.ceil(endMs / step))
  if (to - from < 3) return []
  const window = env.peaks.slice(from, to)
  const sorted = [...window].sort((a, b) => a - b)
  const floor = percentile(sorted, 0.15)
  const level = percentile(sorted, 0.9)
  if (level - floor < 0.02) return [] // no clear speech in this cue
  const threshold = floor + 0.18 * (level - floor)

  const runs: Run[] = []
  let on = -1
  for (let i = 0; i <= window.length; i++) {
    const voiced = i < window.length && window[i] >= threshold
    if (voiced && on < 0) on = i
    if (!voiced && on >= 0) {
      runs.push({ start: (from + on) * step, end: (from + i) * step })
      on = -1
    }
  }
  const merged: Run[] = []
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (last && run.start - last.end < MERGE_GAP_MS) last.end = run.end
    else merged.push({ ...run })
  }
  return merged
    .filter((r) => r.end - r.start >= MIN_RUN_MS)
    .map((r) => ({ start: Math.max(startMs, Math.round(r.start)), end: Math.min(endMs, Math.round(r.end)) }))
}

/** Relative speaking length of a word: letters/digits plus a constant per word. */
function weight(text: string): number {
  return text.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5
}

const GRID_MS = 20
/** Cost of putting a word boundary inside continuous speech instead of at a pause. */
const MID_SPEECH_PENALTY = 0.35
/** Reward for ending a punctuated / line-final word at a real pause. */
const PHRASE_PAUSE_BONUS = 0.15
/** A silence this long inside a word costs as much as a 2.7x length mismatch. */
const INNER_PAUSE_MS = 120

/**
 * Word timings for a cue from the speech envelope, or null when the audio has
 * no usable speech in the cue (callers then fall back to an even estimate).
 *
 * Best-fit alignment (dynamic programming): every pause in the speech is a
 * candidate word boundary, as is any point inside continuous speech (at a small
 * penalty, since fluent speech joins words). The chosen boundaries make each
 * word's share of the *speech time* match its share of the text as closely as
 * possible. Silence never counts as speaking time.
 */
export function speechWordTimings(cue: Cue, env: SpeechEnvelope): Word[] | null {
  const tokens = cue.text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const runs = voicedRuns(env, cue.startMs, cue.endMs)
  if (runs.length === 0) return null
  const n = tokens.length
  const weights = tokens.map(weight)
  // Words followed by punctuation or a line break usually end at a pause.
  const lineEnds = new Set<number>()
  let index = 0
  for (const line of cue.text.split('\n')) {
    index += line.split(/\s+/).filter(Boolean).length
    lineEnds.add(index - 1)
  }
  const phraseEnd = tokens.map((t, i) => lineEnds.has(i) || /[.,!?;:…]["')\]]?$/.test(t))
  const weightTotal = weights.reduce((a, b) => a + b, 0)
  const speechStart = runs[0].start
  const speechEnd = runs[runs.length - 1].end

  // Candidate boundaries: run onsets (pauses) plus a grid inside speech.
  const cands = new Map<number, boolean>() // time -> is a pause onset
  for (const r of runs) {
    cands.set(r.start, true)
    for (let t = r.start + GRID_MS; t < r.end; t += GRID_MS) if (!cands.has(t)) cands.set(t, false)
  }
  const times = [...cands.keys()].sort((a, b) => a - b)
  times.push(speechEnd) // terminal boundary
  const m = times.length
  const isPause = times.map((t) => cands.get(t) === true)

  // Prefix of voiced time so speech between any two candidates is O(1).
  const voicedUpTo = (t: number) => {
    let acc = 0
    for (const r of runs) {
      if (t <= r.start) break
      acc += Math.min(t, r.end) - r.start
    }
    return acc
  }
  const prefix = times.map(voicedUpTo)
  const voicedTotal = prefix[m - 1]
  // End of the speech heard before time t (t itself when t is inside speech).
  const lastVoicedEnd = times.map((t) => {
    let end = speechStart
    for (const r of runs) {
      if (r.start >= t) break
      end = Math.min(t, r.end)
    }
    return end
  })

  // best[i][j] = cost of words 0..i-1 with word i starting at candidate j
  const INF = Number.POSITIVE_INFINITY
  const best: Float64Array[] = Array.from({ length: n + 1 }, () => new Float64Array(m).fill(INF))
  const prev: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m).fill(-1))
  best[0][0] = 0 // first word starts with the speech
  for (let i = 0; i < n; i++) {
    const expected = (weights[i] / weightTotal) * voicedTotal
    const lastWord = i === n - 1
    for (let j = 0; j < m - 1; j++) {
      const base = best[i][j]
      if (base === INF) continue
      for (let k = j + 1; k < m; k++) {
        if (lastWord && k !== m - 1) continue
        if (!lastWord && k === m - 1) break
        const spoken = prefix[k] - prefix[j]
        if (spoken <= 0) continue
        // Length mismatch on a log scale (twice as long costs the same as half as long).
        const ratio = Math.log(spoken / expected)
        let cost = base + ratio * ratio
        // Words do not contain long silences: a pause inside the span means a missed boundary.
        const inner = lastVoicedEnd[k] - times[j] - spoken
        if (inner > 0) cost += (inner / INNER_PAUSE_MS) ** 2
        if (!lastWord && !isPause[k]) cost += MID_SPEECH_PENALTY * (phraseEnd[i] ? 2 : 1)
        else if (!lastWord && phraseEnd[i]) cost -= PHRASE_PAUSE_BONUS
        if (cost < best[i + 1][k]) {
          best[i + 1][k] = cost
          prev[i + 1][k] = j
        }
      }
    }
  }
  if (best[n][m - 1] === INF) return null

  const starts = new Array<number>(n)
  for (let i = n, k = m - 1; i > 0; i--) {
    const j = prev[i][k]
    starts[i - 1] = times[j]
    k = j
  }
  starts[0] = speechStart

  // Lead slightly so the highlight lands with the sound, keep order, close each word at the next one.
  const shifted = starts.map((s) => Math.max(cue.startMs, Math.round(s - WORD_LEAD_MS)))
  for (let i = 1; i < shifted.length; i++) shifted[i] = Math.max(shifted[i], shifted[i - 1] + 1)
  return tokens.map((text, i) => ({
    text,
    startMs: shifted[i],
    endMs: i === n - 1 ? cue.endMs : shifted[i + 1],
  }))
}

const memo = new WeakMap<SpeechEnvelope, WeakMap<Cue, Word[] | null>>()

/** Memoised per (envelope, cue) - cues are immutable, so edits naturally recompute. */
export function speechWordTimingsCached(cue: Cue, env: SpeechEnvelope): Word[] | null {
  let byCue = memo.get(env)
  if (!byCue) memo.set(env, (byCue = new WeakMap()))
  if (!byCue.has(cue)) byCue.set(cue, speechWordTimings(cue, env))
  return byCue.get(cue) ?? null
}
