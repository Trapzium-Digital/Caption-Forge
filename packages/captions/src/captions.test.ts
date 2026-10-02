import { describe, expect, it } from 'vitest'
import {
  cueWords,
  formatTimecode,
  mergeCues,
  parseSrt,
  parseTimecode,
  parseVtt,
  shiftCue,
  snapToFrame,
  splitCue,
  toSrt,
  toVtt,
  trimCue,
} from './index.ts'

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello <i>world</i>

2
00:00:04,000 --> 00:00:06,000
Second line
two
`

const VTT = `WEBVTT

NOTE this is ignored

intro
00:01.000 --> 00:02.250 align:center
Hi there
`

describe('timecodes', () => {
  it('round-trips', () => {
    expect(parseTimecode('01:02:03,456')).toBe(3_723_456)
    expect(formatTimecode(3_723_456)).toBe('01:02:03,456')
    expect(parseTimecode('00:05.5')).toBe(5500)
  })

  it('snaps to frames', () => {
    expect(snapToFrame(1010, 30)).toBe(1000)
    expect(snapToFrame(1020, 30)).toBe(1033)
  })
})

describe('subtitle import/export', () => {
  it('parses SRT and strips tags', () => {
    const cues = parseSrt(SRT)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 3500, text: 'Hello world' })
    expect(cues[1].text).toBe('Second line\ntwo')
  })

  it('parses VTT with identifiers, notes and settings', () => {
    const cues = parseVtt(VTT)
    expect(cues).toHaveLength(1)
    expect(cues[0]).toMatchObject({ startMs: 1000, endMs: 2250, text: 'Hi there' })
  })

  it('round-trips SRT and VTT', () => {
    const cues = parseSrt(SRT)
    expect(parseSrt(toSrt(cues)).map((c) => c.text)).toEqual(cues.map((c) => c.text))
    expect(parseVtt(toVtt(cues)).map((c) => c.endMs)).toEqual(cues.map((c) => c.endMs))
  })
})

describe('cue editing', () => {
  const cue = { id: 'c1', startMs: 0, endMs: 2000, text: 'one two three four' }

  it('estimates word timings that cover the cue', () => {
    const words = cueWords(cue)
    expect(words).toHaveLength(4)
    expect(words[0].startMs).toBe(0)
    expect(words[3].endMs).toBe(2000)
  })

  it('splits and merges', () => {
    const parts = splitCue(cue, 1000)
    expect(parts).not.toBeNull()
    const [a, b] = parts!
    expect(a.endMs).toBe(1000)
    expect(b.startMs).toBe(1000)
    expect(`${a.text} ${b.text}`).toBe(cue.text)
    expect(mergeCues(b, a)).toMatchObject({ startMs: 0, endMs: 2000, text: cue.text })
  })

  it('refuses tiny splits', () => {
    expect(splitCue(cue, 50)).toBeNull()
  })

  it('shifts and trims', () => {
    expect(shiftCue(cue, -500)).toMatchObject({ startMs: 0, endMs: 2000 })
    expect(shiftCue(cue, 500)).toMatchObject({ startMs: 500, endMs: 2500 })
    expect(trimCue(cue, 'end', 10)).toMatchObject({ endMs: 100 })
  })
})
