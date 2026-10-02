import type { Cue, Word } from '@captionforge/project-format'
import { cueWords } from '@captionforge/captions'
import type { FontSpec, MeasureText } from './measure.ts'

/**
 * Caption segmentation and line breaking.
 *
 * A cue is split into "pages" that each fit in `maxLines` lines at the
 * available width. Pages follow word timing: a long cue shows one page at a
 * time. Within a page, lines are balanced (no ragged last line, no orphan
 * words) and breaks prefer natural phrase boundaries.
 */

export interface LayoutWord {
  index: number
  text: string
  display: string
  startMs: number
  endMs: number
  width: number
  /** Font-size multiplier (emphasised words can be larger). */
  scale: number
  weight: number
}

export interface CaptionLine {
  words: LayoutWord[]
  width: number
  /** Largest word scale on the line - drives the line height. */
  scale: number
}

export interface CaptionPage {
  lines: CaptionLine[]
  /** Widest line in px. */
  width: number
  firstWord: number
  lastWord: number
  /** Time the page becomes visible. */
  showMs: number
  /** Time the page stops being visible. */
  hideMs: number
}

export interface CueLayout {
  pages: CaptionPage[]
  spaceWidth: number
}

export interface LayoutOptions {
  measure: MeasureText
  font: FontSpec
  maxWidthPx: number
  maxLines: number
  textTransform: 'none' | 'uppercase' | 'lowercase'
  /** Per-word size multiplier and weight (emphasis). Defaults to the base font. */
  wordStyle?: (index: number) => { scale: number; weight: number }
  /** Max words per page; 0 = unlimited. */
  maxWords?: number
  /** Group reveal: pages are groups of this many words (0 = natural phrases) instead of filled pages. */
  groupSize?: number | null
  /** Word timings to use instead of the cue's own / the even estimate (e.g. speech-aware timing). */
  words?: Word[] | null
}

/** Words that read badly at the end of a line: keep them with the next word. */
const GLUE_WORDS = new Set(
  'a an the to of and or but nor so in on at by for from with into onto as is are was were be been am i we you he she it they my your our his her its their this that these those not no if than then very just'.split(
    ' ',
  ),
)

function transform(text: string, mode: LayoutOptions['textTransform']): string {
  if (mode === 'uppercase') return text.toUpperCase()
  if (mode === 'lowercase') return text.toLowerCase()
  return text
}

/** Cost of breaking a line or page after `word`. Negative = a good place to break. */
function breakCost(word: LayoutWord): number {
  if (/[.!?…]["')\]]?$/.test(word.text)) return -24
  if (/[,;:—–-]["')\]]?$/.test(word.text)) return -14
  const bare = word.text.toLowerCase().replace(/[^a-z']/g, '')
  return GLUE_WORDS.has(bare) ? 30 : 0
}

function makeLine(words: LayoutWord[], from: number, to: number, space: number): CaptionLine {
  const slice = words.slice(from, to)
  return { words: slice, width: lineWidth(words, from, to, space), scale: Math.max(1, ...slice.map((w) => w.scale)) }
}

/**
 * Natural phrases for group reveal. Each sentence (split at punctuation) is cut
 * into 2-3 word phrases, avoiding one-word leftovers and phrases that end on a
 * glue word ("to", "the", …).
 */
function phraseGroups(words: LayoutWord[]): [number, number][] {
  const segments: [number, number][] = []
  let start = 0
  words.forEach((w, i) => {
    if (i === words.length - 1 || /[.!?…,;:]["')\]]?$/.test(w.text)) {
      segments.push([start, i + 1])
      start = i + 1
    }
  })
  const groups: [number, number][] = []
  for (const [from, to] of segments) {
    const len = to - from
    const best = new Array(len + 1).fill(Number.POSITIVE_INFINITY)
    const prev = new Array(len + 1).fill(0)
    best[0] = 0
    for (let i = 1; i <= len; i++) {
      for (let size = 1; size <= Math.min(4, i); size++) {
        const j = i - size
        let cost = best[j] + 1
        if (size === 1 && len > 1) cost += 5
        if (size === 4) cost += 4
        if (i < len && breakCost(words[from + i - 1]) > 0) cost += 3
        if (cost < best[i]) {
          best[i] = cost
          prev[i] = j
        }
      }
    }
    const cuts: [number, number][] = []
    for (let i = len; i > 0; i = prev[i]) cuts.unshift([from + prev[i], from + i])
    groups.push(...cuts)
  }
  return groups
}

function lineWidth(words: LayoutWord[], from: number, to: number, space: number): number {
  let w = 0
  for (let i = from; i < to; i++) w += words[i].width
  return w + Math.max(0, to - from - 1) * space
}

/** Greedy line count - used only as a feasibility check for pages. */
function greedyLines(words: LayoutWord[], from: number, to: number, space: number, maxWidth: number): number {
  let lines = 1
  let current = 0
  for (let i = from; i < to; i++) {
    const w = words[i].width
    if (current === 0) current = w
    else if (current + space + w <= maxWidth) current += space + w
    else {
      lines++
      current = w
    }
  }
  return lines
}

/** Balanced breaking of words[from..to) into at most maxLines lines. */
function breakLines(
  words: LayoutWord[],
  from: number,
  to: number,
  space: number,
  maxWidth: number,
  maxLines: number,
): { lines: CaptionLine[]; cost: number } {
  const n = to - from
  // best[k][i] = min cost to set the first i words of the page in k lines
  const INF = Number.POSITIVE_INFINITY
  const best: number[][] = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(INF))
  const prev: number[][] = Array.from({ length: maxLines + 1 }, () => new Array(n + 1).fill(-1))
  best[0][0] = 0
  for (let k = 1; k <= maxLines; k++) {
    for (let i = 1; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        if (best[k - 1][j] === INF) continue
        const w = lineWidth(words, from + j, from + i, space)
        const single = i - j === 1
        if (w > maxWidth && !single) continue
        const slack = Math.max(0, (maxWidth - w) / maxWidth)
        let cost = best[k - 1][j] + slack * slack * 100
        if (i < n) cost += breakCost(words[from + i - 1])
        if (single && n > 1) cost += 60 // orphan / lonely word
        if (cost < best[k][i]) {
          best[k][i] = cost
          prev[k][i] = j
        }
      }
    }
  }
  // Fewer lines are preferred when they fit comfortably.
  let bestK = -1
  let bestCost = INF
  for (let k = 1; k <= maxLines; k++) {
    const cost = best[k][n] + (k - 1) * 25
    if (cost < bestCost) {
      bestCost = cost
      bestK = k
    }
  }
  if (bestK === -1) {
    return { lines: [makeLine(words, from, to, space)], cost: 1e6 }
  }
  const lines: CaptionLine[] = []
  let i = n
  for (let k = bestK; k > 0; k--) {
    const j = prev[k][i]
    lines.unshift(makeLine(words, from + j, from + i, space))
    i = j
  }
  return { lines, cost: bestCost }
}

export function layoutCue(cue: Cue, options: LayoutOptions): CueLayout {
  const { measure, font, maxWidthPx, maxLines, textTransform } = options
  const maxWords = options.maxWords ?? 0
  const spaceWidth = measure(' ', font)
  const words: LayoutWord[] = (options.words ?? cueWords(cue)).map((w, index) => {
    const display = transform(w.text, textTransform)
    const { scale, weight } = options.wordStyle?.(index) ?? { scale: 1, weight: font.weight }
    const width = measure(display, { ...font, weight, sizePx: font.sizePx * scale })
    return { index, text: w.text, display, startMs: w.startMs, endMs: w.endMs, width, scale, weight }
  })
  const n = words.length
  if (n === 0) return { pages: [], spaceWidth }

  if (options.groupSize !== undefined && options.groupSize !== null) {
    const size = options.groupSize
    const ranges: [number, number][] =
      size > 0 ? Array.from({ length: Math.ceil(n / size) }, (_, g) => [g * size, Math.min(n, (g + 1) * size)]) : phraseGroups(words)
    return { pages: buildPages(cue, words, ranges, spaceWidth, maxWidthPx, maxLines), spaceWidth }
  }

  // Paginate: minimise page count, then balance fill between pages and prefer phrase boundaries.
  const capacity = maxWidthPx * maxLines
  const INF = Number.POSITIVE_INFINITY
  const best = new Array(n + 1).fill(INF)
  const prev = new Array(n + 1).fill(-1)
  best[0] = 0
  for (let i = 1; i <= n; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (best[j] === INF) continue
      if (maxWords > 0 && i - j > maxWords) break
      if (greedyLines(words, j, i, spaceWidth, maxWidthPx) > maxLines) {
        if (i - j > 1) break // longer pages will not fit either
        // a single over-wide word still gets its own page
      }
      const fill = lineWidth(words, j, i, spaceWidth) / capacity
      // Page quality includes how well its own lines break (orphans, glue words).
      let cost = best[j] + 1000 + fill * fill * 40 + breakLines(words, j, i, spaceWidth, maxWidthPx, maxLines).cost
      if (i < n) cost += breakCost(words[i - 1])
      if (i - j === 1 && n > 1) cost += 200
      if (cost < best[i]) {
        best[i] = cost
        prev[i] = j
      }
    }
  }

  const ranges: [number, number][] = []
  for (let i = n; i > 0; i = prev[i]) ranges.unshift([prev[i], i])
  return { pages: buildPages(cue, words, ranges, spaceWidth, maxWidthPx, maxLines), spaceWidth }
}

function buildPages(
  cue: Cue,
  words: LayoutWord[],
  ranges: [number, number][],
  spaceWidth: number,
  maxWidthPx: number,
  maxLines: number,
): CaptionPage[] {
  const pages: CaptionPage[] = ranges.map(([from, to]) => {
    const { lines } = breakLines(words, from, to, spaceWidth, maxWidthPx, maxLines)
    return {
      lines,
      width: Math.max(...lines.map((l) => l.width)),
      firstWord: from,
      lastWord: to - 1,
      showMs: words[from].startMs,
      hideMs: words[to - 1].endMs,
    }
  })
  // Pages hand over at the next page's first word; the cue bounds the first and last page.
  pages.forEach((page, i) => {
    page.showMs = i === 0 ? cue.startMs : page.showMs
    page.hideMs = i === pages.length - 1 ? cue.endMs : pages[i + 1].showMs
  })
  return pages
}

export function pageAt(layout: CueLayout, timeMs: number): CaptionPage | undefined {
  return layout.pages.find((p) => timeMs >= p.showMs && timeMs < p.hideMs) ?? layout.pages[layout.pages.length - 1]
}
