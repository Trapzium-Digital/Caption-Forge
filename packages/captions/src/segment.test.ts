import { describe, expect, it } from 'vitest'
import { FORMATTING_PRESETS, fillWordTimes, wordsToCues, type TranscribedWord } from './segment.ts'

/** Words spoken back-to-back at 300 ms each, with optional extra pauses before given indices. */
function speak(text: string, opts: { start?: number; pauses?: Record<number, number>; speakers?: Record<number, string> } = {}): TranscribedWord[] {
  let t = opts.start ?? 1000
  let speaker: string | undefined
  return text.split(' ').map((w, i) => {
    t += opts.pauses?.[i] ?? 0
    speaker = opts.speakers?.[i] ?? speaker
    const word = { text: w, startMs: t, endMs: t + 260, speaker }
    t += 300
    return word
  })
}

describe('wordsToCues', () => {
  it('keeps exact word timings on every caption', () => {
    const cues = wordsToCues(speak('You build product for global clients.'), FORMATTING_PRESETS.social)
    const words = cues.flatMap((c) => c.words!)
    expect(words.map((w) => w.text).join(' ')).toBe('You build product for global clients.')
    expect(words[0].startMs).toBe(1000)
    expect(cues[0].startMs).toBe(1000)
  })

  it('splits social captions into short phrases', () => {
    const cues = wordsToCues(speak('Then you spend three days figuring out how to receive the money and convert it.'), FORMATTING_PRESETS.social)
    expect(cues.length).toBeGreaterThan(2)
    for (const cue of cues) {
      expect(cue.words!.length).toBeLessThanOrEqual(7)
      expect(cue.text.length).toBeLessThanOrEqual(40)
    }
  })

  it('breaks at sentence ends and keeps sentences whole for podcast', () => {
    const cues = wordsToCues(speak('We get it. There is a ton of stress that you get receiving money.'), FORMATTING_PRESETS.podcast)
    expect(cues.map((c) => c.text)).toEqual(['We get it.', 'There is a ton of stress that you get receiving money.'])
  })

  it('starts a new caption at a long pause and on a speaker change', () => {
    const paused = wordsToCues(speak('hello there general kenobi', { pauses: { 2: 1200 } }), FORMATTING_PRESETS.podcast)
    expect(paused.map((c) => c.text)).toEqual(['hello there', 'general kenobi'])
    const speakers = wordsToCues(speak('how are you I am fine thanks', { speakers: { 0: 'SPEAKER_00', 3: 'SPEAKER_01' } }), FORMATTING_PRESETS.podcast)
    expect(speakers.map((c) => [c.speaker, c.text])).toEqual([
      ['SPEAKER_00', 'how are you'],
      ['SPEAKER_01', 'I am fine thanks'],
    ])
  })

  it('never overlaps captions and holds briefly after the last word', () => {
    const cues = wordsToCues(speak('one two three four five six seven eight nine ten eleven twelve'), FORMATTING_PRESETS.social)
    for (let i = 1; i < cues.length; i++) expect(cues[i].startMs).toBeGreaterThanOrEqual(cues[i - 1].endMs)
    const last = cues[cues.length - 1]
    expect(last.endMs).toBe(last.words![last.words!.length - 1].endMs)
    expect(last.endMs - (1000 + 11 * 300 + 260)).toBe(350)
  })

  it('avoids one-word captions where it can', () => {
    const cues = wordsToCues(speak('This is why we built it, okay.'), FORMATTING_PRESETS.social)
    expect(cues.every((c) => c.words!.length > 1)).toBe(true)
  })

  it('interpolates words WhisperX could not align', () => {
    const filled = fillWordTimes([
      { text: 'it', startMs: 1000, endMs: 1200 },
      { text: '2026' },
      { text: 'now', startMs: 1800, endMs: 2000 },
    ])
    expect(filled[1]).toMatchObject({ startMs: 1200, endMs: 1800 })
  })
})
