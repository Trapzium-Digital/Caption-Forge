import { describe, expect, it } from 'vitest'
import { BOLD_POP_DEFAULTS, safeAreaFromPreset, type Cue, type Keyframe } from '@captionforge/project-format'
import { REST, appearState, emphasisState, enterState, exitState, wordState } from './animation.ts'
import { evaluateLayer, evaluateProperty } from './keyframes.ts'
import { layoutCue, pageAt } from './layout.ts'
import type { MeasureText } from './measure.ts'
import { maxCaptionWidth, placeBox, safeRect } from './placement.ts'

// Monospace-ish fake: every character is 10 px at 100 px font size.
const measure: MeasureText = (text, font) => text.length * font.sizePx * 0.1
const font = { family: 'Test', weight: 800, sizePx: 100, letterSpacing: 0 }
const cue = (text: string, startMs = 0, endMs = 4000): Cue => ({ id: 'c', startMs, endMs, text })
const lines = (c: Cue, maxWidthPx: number, maxLines = 2) =>
  layoutCue(c, { measure, font, maxWidthPx, maxLines, textTransform: 'uppercase' }).pages.map((p) =>
    p.lines.map((l) => l.words.map((w) => w.display).join(' ')),
  )

describe('segmentation', () => {
  it('keeps short captions on one line', () => {
    expect(lines(cue('this is it'), 400)).toEqual([['THIS IS IT']])
  })

  it('balances two lines and avoids ending a line on a glue word', () => {
    const [page] = lines(cue('this is the most important thing'), 220)
    expect(page).toHaveLength(2)
    expect(page[0].split(' ').pop()).not.toMatch(/^(THE|IS)$/)
    const [a, b] = page.map((l) => l.length)
    expect(Math.abs(a - b)).toBeLessThanOrEqual(8)
  })

  it('never leaves an orphan word on its own line', () => {
    for (const width of [180, 200, 240, 260, 300]) {
      for (const page of lines(cue('we built this caption engine for creators'), width)) {
        if (page.length > 1) expect(page.every((l) => l.includes(' '))).toBe(true)
      }
    }
  })

  it('splits long cues into timed pages that each fit in max lines', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen'
    const layout = layoutCue(cue(text, 1000, 8000), { measure, font, maxWidthPx: 250, maxLines: 2, textTransform: 'none' })
    expect(layout.pages.length).toBeGreaterThan(1)
    for (const page of layout.pages) {
      expect(page.lines.length).toBeLessThanOrEqual(2)
      for (const line of page.lines) expect(line.width).toBeLessThanOrEqual(250)
    }
    expect(layout.pages[0].showMs).toBe(1000)
    expect(layout.pages.at(-1)!.hideMs).toBe(8000)
    for (let i = 1; i < layout.pages.length; i++) expect(layout.pages[i].showMs).toBe(layout.pages[i - 1].hideMs)
    expect(pageAt(layout, 7999)).toBe(layout.pages.at(-1))
  })

  it('uses real word timings when present', () => {
    const timed: Cue = {
      id: 'w',
      startMs: 0,
      endMs: 3000,
      text: 'this is important',
      words: [
        { text: 'this', startMs: 0, endMs: 400 },
        { text: 'is', startMs: 400, endMs: 700 },
        { text: 'important', startMs: 2400, endMs: 2920 },
      ],
    }
    const layout = layoutCue(timed, { measure, font, maxWidthPx: 1000, maxLines: 2, textTransform: 'none' })
    expect(layout.pages[0].lines[0].words[2]).toMatchObject({ startMs: 2400, endMs: 2920 })
  })
})

describe('animation', () => {
  const cfg = { activeDurationMs: 220, popScale: 1.12 }

  it('pops the active word up to the peak and back to rest', () => {
    const word = { startMs: 1000, endMs: 1500 }
    expect(wordState('pop', cfg, word, 999)).toMatchObject({ active: false, scale: 1 })
    const samples = Array.from({ length: 23 }, (_, i) => wordState('pop', cfg, word, 1000 + i * 10).scale)
    expect(Math.max(...samples)).toBeCloseTo(1.12, 2)
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.12 + 1e-9)
    expect(wordState('pop', cfg, word, 1220).scale).toBe(1)
    expect(wordState('pop', cfg, word, 1300)).toMatchObject({ active: true, scale: 1 })
    expect(wordState('pop', cfg, word, 1500).active).toBe(false)
  })

  it('enters with fade + rise + tiny scale and exits with fade + drop', () => {
    expect(enterState('fade-rise', 0, 180)).toMatchObject({ opacity: 0, translateY: 0.22, scale: 0.96 })
    expect(enterState('fade-rise', 180, 180)).toEqual(REST)
    const out = exitState('fade-drop', 0, 140)
    expect(out.opacity).toBe(0)
    expect(out.translateY).toBeGreaterThan(0)
    expect(exitState('fade-drop', 500, 140)).toEqual(REST)
  })
})

describe('keyframes', () => {
  const kf = (property: Keyframe['property'], timeMs: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe => ({
    id: `${property}${timeMs}`,
    property,
    timeMs,
    value,
    easing,
  })

  it('interpolates and holds', () => {
    const frames = [kf('scale', 1000, 1), kf('scale', 2000, 2), kf('opacity', 0, 1, 'hold'), kf('opacity', 500, 0)]
    expect(evaluateProperty(frames, 'scale', 0, 1)).toBe(1)
    expect(evaluateProperty(frames, 'scale', 1500, 1)).toBe(1.5)
    expect(evaluateProperty(frames, 'scale', 9000, 1)).toBe(2)
    expect(evaluateProperty(frames, 'opacity', 400, 1)).toBe(1)
    expect(evaluateProperty(frames, 'opacity', 600, 1)).toBe(0)
  })

  it('falls back to the style for unkeyed properties', () => {
    const values = evaluateLayer([kf('x', 0, 0.1)], 100, BOLD_POP_DEFAULTS)
    expect(values).toMatchObject({ x: 0.1, y: 0, scale: 1, fontSize: BOLD_POP_DEFAULTS.fontSize })
  })
})

describe('placement', () => {
  const comp = { width: 1080, height: 1920, fps: 30 }
  const safe = safeAreaFromPreset('universal')

  it('anchors bottom-center above the bottom safe area by the Y offset', () => {
    const box = { width: 600, height: 200 }
    const { left, top } = placeBox(comp, safe, BOLD_POP_DEFAULTS, box)
    const rect = safeRect(comp, safe)
    expect(left + box.width / 2).toBeCloseTo(comp.width / 2)
    expect(top + box.height).toBeCloseTo(rect.y + rect.height - 0.12 * 1920)
  })

  it('never lets the caption leave the safe area', () => {
    const rect = safeRect(comp, safe)
    const { left, top } = placeBox(comp, safe, { anchor: 'bottom-right', xOffset: 0.4, yOffset: -0.4 }, { width: 300, height: 100 })
    expect(left + 300).toBeLessThanOrEqual(rect.x + rect.width + 1e-6)
    expect(top + 100).toBeLessThanOrEqual(rect.y + rect.height + 1e-6)
  })

  it('keeps centred captions on the frame centre with equal margins clear of the safe area', () => {
    const rect = safeRect(comp, safe)
    const width = maxCaptionWidth(comp, safe, { ...BOLD_POP_DEFAULTS, maxWidth: 1 })
    expect(width).toBeCloseTo(comp.width * (1 - 2 * safe.right))
    const { left } = placeBox(comp, safe, { anchor: 'bottom-center', xOffset: 0, yOffset: 0 }, { width, height: 100 })
    expect(left).toBeGreaterThanOrEqual(rect.x)
    expect(left + width).toBeLessThanOrEqual(rect.x + rect.width + 1e-6)
    expect(left + width / 2).toBeCloseTo(comp.width / 2)
  })

  it('lets side-anchored captions use the full safe width', () => {
    expect(maxCaptionWidth(comp, safe, { ...BOLD_POP_DEFAULTS, anchor: 'bottom-left', maxWidth: 1 })).toBeCloseTo(safeRect(comp, safe).width)
  })
})

describe('karaoke', () => {
  const karaoke = { activeDurationMs: 180, popScale: 1.06, activeScaleWithEffects: true }
  const word = { startMs: 1000, endMs: 1400 }
  const peak = (mode: Parameters<typeof wordState>[0], cfg: Parameters<typeof wordState>[1]) =>
    Math.max(...Array.from({ length: 40 }, (_, i) => wordState(mode, cfg, word, 1000 + i * 5).scale))

  it('uses a gentle 1.00 -> 1.06 -> 1.00 pop', () => {
    expect(peak('pop', karaoke)).toBeCloseTo(1.06, 2)
    expect(wordState('pop', karaoke, word, 1180).scale).toBe(1)
  })

  it('adds the same small pop to pill, underline and glow modes', () => {
    for (const mode of ['highlight', 'underline', 'glow'] as const) expect(peak(mode, karaoke)).toBeCloseTo(1.06, 2)
    const mid = wordState('highlight', karaoke, word, 1100)
    expect(mid.highlight).toBe(1)
    expect(wordState('highlight', karaoke, word, 1400).highlight).toBe(0)
  })

  it('leaves Bold Pop effect modes unscaled', () => {
    expect(peak('highlight', { activeDurationMs: 220, popScale: 1.12, activeScaleWithEffects: false })).toBe(1)
  })

  it('color mode only changes color', () => {
    const s = wordState('none', karaoke, word, 1050)
    expect(s).toMatchObject({ active: true, scale: 1, glow: 0, highlight: 0, underline: 0 })
  })

  it('exactly one word is active at any time across a cue', () => {
    const layout = layoutCue(cue('this is a caption example', 0, 2500), { measure, font, maxWidthPx: 600, maxLines: 2, textTransform: 'uppercase' })
    const all = layout.pages.flatMap((p) => p.lines.flatMap((l) => l.words))
    for (let t = 0; t < 2500; t += 25) {
      expect(all.filter((w) => wordState('pop', karaoke, w, t).active)).toHaveLength(1)
    }
  })
})

describe('reveal modes and grouping', () => {
  const text = 'you need to see this right now'
  const opts = { measure, font, maxWidthPx: 600, maxLines: 2, textTransform: 'uppercase' as const }

  it('groups words for word-by-word, handing over at each group start', () => {
    const one = layoutCue(cue(text, 0, 3500), { ...opts, groupSize: 1 })
    expect(one.pages.map((p) => p.lines.flatMap((l) => l.words.map((w) => w.display)).join(' '))).toEqual(
      'YOU NEED TO SEE THIS RIGHT NOW'.split(' '),
    )
    for (let i = 1; i < one.pages.length; i++) expect(one.pages[i].showMs).toBe(one.pages[i - 1].hideMs)
    const two = layoutCue(cue(text, 0, 3500), { ...opts, groupSize: 2 })
    expect(two.pages.map((p) => p.lines.flatMap((l) => l.words).length)).toEqual([2, 2, 2, 1])
  })

  it('makes natural phrases that break at punctuation', () => {
    const phrases = layoutCue(cue('Wait. You need to see this.', 0, 3000), { ...opts, groupSize: 0 })
    expect(phrases.pages.map((p) => p.lines.flatMap((l) => l.words.map((w) => w.text)).join(' '))).toEqual([
      'Wait.',
      'You need',
      'to see this.',
    ])
  })

  it('caps words per page for punchy short phrases', () => {
    const layout = layoutCue(cue(text + ' please', 0, 4000), { ...opts, maxWidthPx: 5000, maxWords: 4 })
    for (const page of layout.pages) expect(page.lastWord - page.firstWord + 1).toBeLessThanOrEqual(4)
  })

  it('measures emphasised words at their larger size', () => {
    const plain = layoutCue(cue('the biggest mistake'), opts)
    const big = layoutCue(cue('the biggest mistake'), { ...opts, wordStyle: (i) => (i === 1 ? { scale: 1.25, weight: 900 } : { scale: 1, weight: 800 }) })
    expect(big.pages[0].width).toBeCloseTo(plain.pages[0].width + 0.25 * 'BIGGEST'.length * 10, 5)
    expect(big.pages[0].lines[0].scale).toBe(1.25)
  })
})

describe('word and emphasis animation', () => {
  it('pop-in overshoots then settles', () => {
    const samples = Array.from({ length: 25 }, (_, i) => appearState('pop-in', i * 10, 240, 1.15).scale)
    expect(samples[0]).toBeCloseTo(0.75, 2)
    expect(Math.max(...samples)).toBeCloseTo(1.15, 2)
    expect(appearState('pop-in', 240, 240, 1.15)).toEqual(REST)
    expect(appearState('scale-fade', -1, 140).opacity).toBe(0)
  })

  it('shake decays and stops - never continuous', () => {
    const cfg = { activeDurationMs: 200, popScale: 1.1, shakeAmount: 0.5 }
    const word = { startMs: 0, endMs: 2000 }
    expect(Math.abs(wordState('shake', cfg, word, 40).rotate)).toBeGreaterThan(0.1)
    expect(wordState('shake', cfg, word, 250)).toMatchObject({ rotate: 0, translateX: 0, active: true })
  })

  it('off disables the active word entirely', () => {
    expect(wordState('off', { activeDurationMs: 200, popScale: 1.1 }, { startMs: 0, endMs: 500 }, 100).active).toBe(false)
  })

  it('spoken emphasis appears when the word is spoken; static is always on', () => {
    expect(emphasisState('fade', 'spoken', { startMs: 1000 }, 900, 260, 1.06).amount).toBe(0)
    expect(emphasisState('fade', 'spoken', { startMs: 1000 }, 1300, 260, 1.06).amount).toBe(1)
    expect(emphasisState('pop', 'static', { startMs: 1000 }, 0, 260, 1.06).amount).toBe(1)
  })
})

describe('style registry', () => {
  it('has all ten styles and every default is a valid config', async () => {
    const { CAPTION_STYLES } = await import('./registry.ts')
    const { CaptionStyleConfigSchema } = await import('@captionforge/project-format')
    expect(Object.keys(CAPTION_STYLES)).toEqual([
      'bold-pop', 'karaoke', 'highlight', 'creator', 'punch', 'minimal', 'word-by-word', 'podcast', 'news', 'cinematic',
    ])
    for (const def of Object.values(CAPTION_STYLES)) {
      expect(CaptionStyleConfigSchema.safeParse(def.defaults).success).toBe(true)
      for (const list of [def.activeModes, def.enterOptions, def.exitOptions, def.backgroundOptions]) {
        expect(list.length).toBeGreaterThan(0)
      }
      expect(def.activeModes.some((m) => m.value === def.defaults.activeAnimation)).toBe(true)
      expect(def.enterOptions.some((m) => m.value === def.defaults.enterAnimation)).toBe(true)
      expect(def.exitOptions.some((m) => m.value === def.defaults.exitAnimation)).toBe(true)
      expect(def.backgroundOptions.some((m) => m.value === def.defaults.background)).toBe(true)
    }
  })

  it('assigns stable speaker colors in order of appearance', async () => {
    const { speakerColor, SPEAKER_PALETTE } = await import('./speakers.ts')
    const project = {
      activeCaptionTrackId: 't',
      captionTracks: [{ id: 't', name: 'x', language: 'und', cues: [cue('a'), { ...cue('b'), speaker: 'Guest' }, { ...cue('c'), speaker: 'Host' }] }],
      speakers: [{ name: 'Host', color: '#123456' }],
    }
    expect(speakerColor(project, 'Guest')).toBe(SPEAKER_PALETTE[0])
    expect(speakerColor(project, 'Host')).toBe('#123456')
  })
})

describe('applying styles', () => {
  it('keeps a font the user picked, but not one that came with the previous style', async () => {
    const { styleConfigFor } = await import('./registry.ts')
    expect(styleConfigFor('karaoke', 'Montserrat', 'bold-pop').fontFamily).toBe('Montserrat')
    expect(styleConfigFor('karaoke', 'Playfair Display', 'cinematic').fontFamily).toBe('Inter')
    expect(styleConfigFor('cinematic', 'Montserrat', 'bold-pop').fontFamily).toBe('Playfair Display')
  })
})
