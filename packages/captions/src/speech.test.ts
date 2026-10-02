import { describe, expect, it } from 'vitest'
import type { Cue } from '@captionforge/project-format'
import { WORD_LEAD_MS, speechWordTimings, speechWordTimingsCached, voicedRuns, type SpeechEnvelope } from './speech.ts'

/** Envelope at 100 samples/s: quiet floor with loud bursts at the given [startMs, endMs) ranges. */
function envelope(totalMs: number, bursts: [number, number][]): SpeechEnvelope {
  const peaks = Array.from({ length: totalMs / 10 }, (_, i) => {
    const t = i * 10
    return bursts.some(([a, b]) => t >= a && t < b) ? 0.6 : 0.01
  })
  return { peaksPerSecond: 100, peaks }
}
const cue = (text: string, startMs: number, endMs: number): Cue => ({ id: 'c', startMs, endMs, text })

describe('speech-aware word timing', () => {
  it('finds voiced runs and ignores silence', () => {
    const env = envelope(3000, [[500, 800], [1000, 1300]])
    expect(voicedRuns(env, 0, 3000)).toEqual([
      { start: 500, end: 800 },
      { start: 1000, end: 1300 },
    ])
  })

  it('starts the first word when speech starts, not when the cue starts', () => {
    const env = envelope(4000, [[700, 1000], [1100, 1400], [1500, 1800]])
    const words = speechWordTimings(cue('one two three', 200, 3500), env)!
    expect(words[0].startMs).toBe(700 - WORD_LEAD_MS)
  })

  it('puts word boundaries at pauses', () => {
    const env = envelope(4000, [[500, 800], [1000, 1300], [1600, 1900]])
    const words = speechWordTimings(cue('alpha bravo delta', 300, 3000), env)!
    expect(words.map((w) => w.startMs + WORD_LEAD_MS)).toEqual([500, 1000, 1600])
  })

  it('never stretches a word across a long pause', () => {
    // "days," then a 400 ms comma pause, then "figuring out"
    const env = envelope(5000, [[500, 760], [800, 1100], [1500, 1900], [1960, 2200]])
    const words = speechWordTimings(cue('three days, figuring out', 300, 3000), env)!
    expect(words[2].startMs + WORD_LEAD_MS).toBe(1500)
  })

  it('splits continuous speech in proportion to word length when there are no pauses', () => {
    const env = envelope(3000, [[500, 2100]])
    const words = speechWordTimings(cue('go somewhere', 0, 3000), env)!
    const split = words[1].startMs + WORD_LEAD_MS
    expect(split).toBeGreaterThan(500 + 300)
    expect(split).toBeLessThan(500 + 700)
  })

  it('does not run late when speech ends before the cue does', () => {
    const env = envelope(5000, [[500, 900], [1000, 1400]])
    const words = speechWordTimings(cue('hello world', 300, 4500), env)!
    expect(words[1].startMs + WORD_LEAD_MS).toBe(1000)
    expect(words[1].endMs).toBe(4500) // last word stays until the cue ends
  })

  it('returns null without usable speech, so callers fall back to the estimate', () => {
    expect(speechWordTimings(cue('silent words', 0, 2000), envelope(3000, []))).toBeNull()
  })

  it('is deterministic and cached per cue', () => {
    const env = envelope(3000, [[500, 900], [1000, 1400]])
    const c = cue('hello world', 0, 2000)
    expect(speechWordTimingsCached(c, env)).toBe(speechWordTimingsCached(c, env))
    expect(speechWordTimings(c, env)).toEqual(speechWordTimings({ ...c }, env))
  })
})
