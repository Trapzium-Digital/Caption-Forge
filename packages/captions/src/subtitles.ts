import { createId, type Cue } from '@captionforge/project-format'
import { formatTimecode, parseTimecode } from './timecode.ts'

const ARROW = /\s*-->\s*/

function splitBlocks(text: string): string[][] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.split('\n').filter((line) => line.length > 0))
    .filter((lines) => lines.length > 0)
}

function stripTags(line: string): string {
  return line.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '')
}

function parseTimingLine(line: string): { startMs: number; endMs: number } | null {
  if (!ARROW.test(line)) return null
  const [start, rest] = line.split(ARROW)
  const end = rest.trim().split(/\s+/)[0] // VTT cue settings follow the end time
  return { startMs: parseTimecode(start), endMs: parseTimecode(end) }
}

function parseCueBlocks(blocks: string[][]): Cue[] {
  const cues: Cue[] = []
  for (const lines of blocks) {
    const timingIndex = lines.findIndex((l) => ARROW.test(l))
    if (timingIndex === -1) continue
    const timing = parseTimingLine(lines[timingIndex])
    if (!timing || timing.endMs <= timing.startMs) continue
    const text = lines
      .slice(timingIndex + 1)
      .map(stripTags)
      .join('\n')
      .trim()
    if (!text) continue
    cues.push({ id: createId('cue'), ...timing, text })
  }
  return cues.sort((a, b) => a.startMs - b.startMs)
}

export function parseSrt(text: string): Cue[] {
  return parseCueBlocks(splitBlocks(text))
}

export function parseVtt(text: string): Cue[] {
  const blocks = splitBlocks(text)
  if (!blocks[0]?.[0]?.startsWith('WEBVTT')) throw new Error('Not a WebVTT file (missing WEBVTT header)')
  return parseCueBlocks(
    blocks.slice(1).filter((b) => !/^(NOTE|STYLE|REGION)\b/.test(b[0])),
  )
}

export function parseSubtitles(filename: string, text: string): Cue[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.vtt')) return parseVtt(text)
  if (lower.endsWith('.srt')) return parseSrt(text)
  throw new Error('Unsupported subtitle format. Use .srt or .vtt')
}

export function toSrt(cues: Cue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${formatTimecode(c.startMs, ',')} --> ${formatTimecode(c.endMs, ',')}\n${c.text}`)
      .join('\n\n') + '\n'
  )
}

export function toVtt(cues: Cue[]): string {
  const body = cues
    .map((c) => `${formatTimecode(c.startMs, '.')} --> ${formatTimecode(c.endMs, '.')}\n${c.text}`)
    .join('\n\n')
  return `WEBVTT\n\n${body}\n`
}
