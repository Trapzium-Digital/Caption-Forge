import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { CaptionStyleConfig, Cue, EmphasisLevel, Project } from '@captionforge/project-format'
import { speechWordTimingsCached, type SpeechEnvelope } from '@captionforge/captions'
import { REST, appearState, combine, emphasisState, enterState, exitState, wordState, type BlockState } from './animation.ts'
import { cssFontFamily, loadCaptionFont } from './fonts.ts'
import { evaluateLayer } from './keyframes.ts'
import { layoutCue, pageAt, type CaptionPage, type CueLayout, type LayoutWord } from './layout.ts'
import { clearMeasureCache, measureText, type FontSpec } from './measure.ts'
import { anchorParts, maxCaptionWidth, placeBox, safeRect, styleScale } from './placement.ts'
import { getCaptionStyle } from './registry.ts'
import { speakerColor } from './speakers.ts'

export type CaptionProject = Pick<
  Project,
  'composition' | 'captionTracks' | 'activeCaptionTrackId' | 'captionStyle' | 'captionLayer' | 'safeArea'
> &
  Partial<Pick<Project, 'speakers'>>

function hexChannels(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function rgba(hex: string, alpha: number): string {
  const c = hexChannels(hex)
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : hex
}

/** Black or white, whichever reads better on the given color. */
export function contrastText(hex: string): string {
  const c = hexChannels(hex)
  if (!c) return '#000000'
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000000' : '#FFFFFF'
}

/** Mix from `a` to `b` by `t` (0..1). color-mix keeps transitions smooth in preview and export alike. */
function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a
  if (t >= 1) return b
  return `color-mix(in srgb, ${b} ${Math.round(t * 100)}%, ${a})`
}

/** Spacing (in em) around text for each background mode. */
function spacing(config: CaptionStyleConfig) {
  switch (config.background) {
    case 'soft':
      return { blockX: 0.42, blockY: 0.24, lineX: 0, lineY: 0, gap: 0, stripe: 0 }
    case 'pill':
      return { blockX: 0, blockY: 0, lineX: 0.38, lineY: 0.06, gap: 0.08, stripe: 0 }
    case 'band':
      return { blockX: 0.2, blockY: 0.3, lineX: 0, lineY: 0, gap: 0, stripe: 0 }
    case 'bar':
      return { blockX: 0.5, blockY: 0.3, lineX: 0, lineY: 0, gap: 0, stripe: 0.14 }
    default:
      return { blockX: 0, blockY: 0, lineX: 0, lineY: 0, gap: 0, stripe: 0 }
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

function emphasisOf(cue: Cue, index: number, enabled = true): EmphasisLevel | undefined {
  return enabled ? cue.emphasis?.[String(index)] : undefined
}

/** Word marks only change styles that expose emphasis controls (Highlight, Creator, News, Cinematic). */
export function styleUsesEmphasis(styleId: string): boolean {
  return getCaptionStyle(styleId).sections.includes('emphasis')
}

/** Size multiplier and weight for a word, from its emphasis level. */
export function emphasisFont(config: CaptionStyleConfig, level: EmphasisLevel | undefined): { scale: number; weight: number } {
  const heavier = Math.max(config.fontWeight, config.emphasisWeight)
  if (level === 'primary') return { scale: config.emphasisScale, weight: heavier }
  if (level === 'important') {
    if (config.emphasisStyle === 'scale') return { scale: config.emphasisScale, weight: config.fontWeight }
    if (config.emphasisStyle === 'weight') return { scale: 1, weight: heavier }
  }
  return { scale: 1, weight: config.fontWeight }
}

/**
 * Loads the fonts used by a style and returns a counter that changes once they
 * are ready, so layouts measured with a fallback font are recomputed.
 */
export function useCaptionFontEpoch(config: Pick<CaptionStyleConfig, 'fontFamily' | 'fontWeight' | 'emphasisWeight'>): number {
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    let cancelled = false
    void loadCaptionFonts(config).then(() => {
      if (cancelled) return
      clearMeasureCache()
      setEpoch((e) => e + 1)
    })
    return () => {
      cancelled = true
    }
  }, [config.fontFamily, config.fontWeight, config.emphasisWeight])
  return epoch
}

export function loadCaptionFonts(config: Pick<CaptionStyleConfig, 'fontFamily' | 'fontWeight' | 'emphasisWeight'>): Promise<void> {
  const weights = [...new Set([config.fontWeight, Math.max(config.fontWeight, config.emphasisWeight), 800])]
  return Promise.all(weights.map((w) => loadCaptionFont(config.fontFamily, w))).then(() => undefined)
}

const MIC_PATH =
  'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-7 9a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V20h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A7 7 0 0 1 5 11z'

/**
 * The caption renderer. Used unchanged by the editor preview and by the
 * Remotion composition: given a project and a time, it draws the frame.
 */
export function CaptionLayer({
  project,
  timeMs,
  fontEpoch = 0,
  speech = null,
}: {
  project: CaptionProject
  timeMs: number
  fontEpoch?: number
  /**
   * Audio envelope of the main video. Without real word timings (WhisperX), words
   * are timed to the actual speech in it rather than spread evenly over the cue.
   */
  speech?: SpeechEnvelope | null
}) {
  const { composition, safeArea } = project
  const config = project.captionStyle.config
  const track = project.captionTracks.find((t) => t.id === project.activeCaptionTrackId) ?? project.captionTracks[0]
  const cue = track.cues.find((c) => timeMs >= c.startMs && timeMs < c.endMs)

  const S = styleScale(composition)
  const layer = evaluateLayer(project.captionLayer.keyframes, timeMs, config)
  const fontSizePx = layer.fontSize * S
  const space = spacing(config)
  const family = cssFontFamily(config.fontFamily)
  const contentWidth = maxCaptionWidth(composition, safeArea, config) - (2 * (space.blockX + space.lineX) + space.stripe) * fontSizePx
  const groupSize = config.revealMode === 'group' ? config.wordGroupSize : null
  const useEmphasis = styleUsesEmphasis(project.captionStyle.styleId)
  const timedWords = cue && !cue.words?.length && speech ? speechWordTimingsCached(cue, speech) : null

  const layout: CueLayout | null = useMemo(() => {
    if (!cue) return null
    const font: FontSpec = { family, weight: config.fontWeight, sizePx: fontSizePx, letterSpacing: config.letterSpacing }
    return layoutCue(cue, {
      measure: measureText,
      font,
      maxWidthPx: Math.max(fontSizePx, contentWidth),
      maxLines: config.maxLines,
      textTransform: config.textTransform,
      wordStyle: (i) => emphasisFont(config, emphasisOf(cue, i, useEmphasis)),
      maxWords: groupSize === null ? config.maxWords : 0,
      groupSize,
      words: timedWords,
    })
    // fontEpoch invalidates measurements taken before the font loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cue,
    family,
    config.fontWeight,
    fontSizePx,
    config.letterSpacing,
    contentWidth,
    config.maxLines,
    config.textTransform,
    config.emphasisStyle,
    config.emphasisScale,
    config.emphasisWeight,
    config.maxWords,
    groupSize,
    useEmphasis,
    timedWords,
    fontEpoch,
  ])

  if (!cue || !layout || layout.pages.length === 0) return null
  const page = pageAt(layout, timeMs)
  if (!page) return null
  const isLastPage = layout.pages.indexOf(page) === layout.pages.length - 1

  // Block animation: group reveal animates each group in; otherwise every page enters.
  // Only the end of the cue exits.
  let block: BlockState =
    config.revealMode === 'group'
      ? appearState(config.wordEnterAnimation, timeMs - page.showMs, config.wordEnterDurationMs, config.overshoot)
      : enterState(config.enterAnimation, timeMs - page.showMs, config.enterDurationMs, config.riseDistance, config.overshoot)
  if (isLastPage) block = combine(block, exitState(config.exitAnimation, cue.endMs - timeMs, config.exitDurationMs, config.riseDistance))

  const em = fontSizePx
  const speaker = cue.speaker?.trim() || null
  const accent = config.useSpeakerColors && speaker ? speakerColor(project, speaker) : config.activeColor
  const label = speaker && config.speakerLabel !== 'none' ? speaker : null
  const labelPx = config.speakerLabelSize * em
  const badge = labelPx * 1.7
  const labelText = label && config.speakerLabel !== 'initials' ? label.toUpperCase() : ''
  const labelTextWidth = labelText
    ? measureText(labelText, { family, weight: 800, sizePx: labelPx, letterSpacing: 0.08 })
    : 0
  const labelWidth = !label ? 0 : config.speakerLabel === 'initials' ? badge : labelTextWidth + (config.speakerLabel === 'name-icon' ? badge + labelPx * 0.5 : 0)
  const labelRowH = !label ? 0 : Math.max(badge * (config.speakerLabel === 'name' ? 0 : 1), labelPx * 1.3) + 0.28 * em

  const lineHeights = page.lines.map((l) => config.lineHeight * em * l.scale + 2 * space.lineY * em)
  const n = page.lines.length
  const box = {
    width: Math.max(page.width + 2 * space.lineX * em, labelWidth) + (2 * space.blockX + space.stripe) * em,
    height: lineHeights.reduce((a, b) => a + b, 0) + (n - 1) * space.gap * em + 2 * space.blockY * em + labelRowH,
  }
  const { left, top } = placeBox(composition, safeArea, config, box)
  const { h } = anchorParts(config.anchor)

  const shadow = config.shadow ? `0 ${0.05 * em}px ${config.shadowBlur * S}px ${rgba(config.shadowColor, config.shadowOpacity)}` : undefined
  const stroke = config.outline && config.outlineWidth > 0 ? `${config.outlineWidth * S * 2}px ${config.outlineColor}` : undefined
  const normal = config.textOpacity < 1 ? rgba(config.normalColor, config.textOpacity) : config.normalColor

  const filters: string[] = []
  if (layer.blur > 0) filters.push(`blur(${layer.blur * S}px)`)
  if (layer.glow > 0) filters.push(`drop-shadow(0 0 ${layer.glow * S}px ${accent})`)

  const outer: CSSProperties = {
    position: 'absolute',
    left,
    top,
    width: box.width,
    height: box.height,
    transform: `translate(${layer.x * composition.width}px, ${-layer.y * composition.height}px) rotate(${layer.rotation}deg) scale(${layer.scale})`,
    transformOrigin: 'center center',
    opacity: layer.opacity * block.opacity,
    filter: filters.length ? filters.join(' ') : undefined,
    pointerEvents: 'none',
  }

  const boxed = config.background === 'soft' || config.background === 'bar'
  const inner: CSSProperties = {
    position: 'relative',
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    padding: `${space.blockY * em}px ${space.blockX * em}px`,
    transform: `translate(${block.translateX}em, ${block.translateY}em) scale(${block.scale})`,
    transformOrigin: h === 'left' ? 'left bottom' : h === 'right' ? 'right bottom' : 'center bottom',
    filter: block.blur > 0 ? `blur(${block.blur * em}px)` : undefined,
    clipPath: block.clip < 1 ? `inset(-20% ${(1 - block.clip) * 100}% -20% -5%)` : undefined,
    fontFamily: family,
    fontWeight: config.fontWeight,
    fontSize: em,
    letterSpacing: `${config.letterSpacing}em`,
    color: normal,
    textAlign: h,
    textShadow: shadow,
    WebkitTextStroke: stroke,
    paintOrder: 'stroke fill',
    background: boxed ? rgba(config.backgroundColor, config.backgroundOpacity) : undefined,
    borderRadius: boxed ? config.backgroundRadius * S : undefined,
    borderLeft: config.background === 'bar' ? `${space.stripe * em}px solid ${accent}` : undefined,
    fontKerning: 'normal',
    textRendering: 'geometricPrecision',
  }

  // A single-word group has nothing to distinguish, so the active color only applies to larger groups.
  const singleWordGroup = config.revealMode === 'group' && page.firstWord === page.lastWord

  return (
    <div style={outer} data-caption-layer="" data-style={project.captionStyle.styleId}>
      {config.background === 'band' && (
        <div
          style={{
            position: 'absolute',
            left: -left - layer.x * composition.width,
            width: composition.width,
            top: 0,
            height: '100%',
            background: rgba(config.backgroundColor, config.backgroundOpacity),
            opacity: block.opacity,
          }}
        />
      )}
      <div style={inner}>
        {label && (
          <SpeakerLabel mode={config.speakerLabel} name={label} color={accent} labelPx={labelPx} badge={badge} rowH={labelRowH - 0.28 * em} gap={0.28 * em} align={h} />
        )}
        {page.lines.map((line, li) => (
          <div key={li} style={{ whiteSpace: 'pre', height: lineHeights[li], lineHeight: `${config.lineHeight * em * line.scale}px`, marginTop: li > 0 ? space.gap * em : 0 }}>
            <span
              style={
                config.background === 'pill'
                  ? {
                      display: 'inline-block',
                      padding: `${space.lineY * em}px ${space.lineX * em}px`,
                      borderRadius: lineHeights[li] / 2,
                      background: rgba(config.backgroundColor, config.backgroundOpacity),
                    }
                  : undefined
              }
            >
              {renderWords(line.words, page, { config, cue, timeMs, em, accent, normal, shadow, singleWordGroup, useEmphasis })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface WordContext {
  config: CaptionStyleConfig
  cue: Cue
  timeMs: number
  em: number
  accent: string
  normal: string
  shadow: string | undefined
  singleWordGroup: boolean
  useEmphasis: boolean
}

function renderWords(words: LayoutWord[], _page: CaptionPage, ctx: WordContext): ReactNode {
  const { config, cue, timeMs, em, accent, normal, shadow } = ctx
  const states = words.map((word) => {
    const level = emphasisOf(cue, word.index, ctx.useEmphasis)
    const inScope = config.activeScope === 'all' || Boolean(level && level !== 'secondary')
    const active = inScope && !ctx.singleWordGroup ? wordState(config.activeAnimation, config, word, timeMs) : wordState('off', config, word, timeMs)
    const emphasis = level ? emphasisState(config.emphasisAnimation, config.emphasisReveal, word, timeMs, 260, config.popScale) : null
    const appear = config.revealMode === 'cumulative' ? appearState(config.wordEnterAnimation, timeMs - word.startMs, config.wordEnterDurationMs, config.overshoot) : REST
    // While a word is making its entrance, the entrance is its pop: the two never stack.
    const entering = appear !== REST
    return { level, active, emphasis, appear, entering }
  })

  // A scaled word would cover its neighbours; push them apart by the extra width
  // (transforms only, using cached measurements - no layout work per frame).
  // Only growth beyond 100 % pushes neighbours (an entrance starting small never pulls them in).
  const extra = words.map((w, i) => {
    const st = states[i]
    const grow = (st.entering ? 1 : st.active.scale) * (st.emphasis?.scale ?? 1) * Math.max(1, st.appear.scale)
    return (grow - 1) * w.width
  })
  const shifts = extra.map((_, i) => {
    let shift = 0
    for (let j = 0; j < extra.length; j++) {
      if (j < i) shift += extra[j] / 2
      else if (j > i) shift -= extra[j] / 2
    }
    return shift
  })

  return words.map((word, wi) => {
    const { level, active, emphasis, appear, entering } = states[wi]
    const amount = emphasis?.amount ?? 0
    const strong = level === 'important' || level === 'primary'
    const scale = (entering ? 1 : active.scale) * (emphasis?.scale ?? 1) * appear.scale
    const tx = shifts[wi] + (active.translateX + appear.translateX) * em * (word.scale || 1)
    const ty = (active.translateY + appear.translateY + (emphasis?.translateY ?? 0)) * em
    const moved = scale !== 1 || tx !== 0 || ty !== 0 || active.rotate !== 0

    let color = normal
    if (level === 'secondary') color = mix(normal, config.secondaryColor, amount)
    if (strong && ['color', 'glow', 'underline', 'weight', 'scale'].includes(config.emphasisStyle)) color = mix(normal, accent, amount)
    if (active.active) color = accent

    const style: CSSProperties = {
      display: 'inline-block',
      position: 'relative',
      fontSize: word.scale !== 1 ? `${word.scale}em` : undefined,
      fontWeight: word.weight !== config.fontWeight ? word.weight : undefined,
      transform: moved ? `translate(${tx}px, ${ty}px) rotate(${active.rotate}deg) scale(${scale})` : undefined,
      transformOrigin: '50% 60%',
      color,
      opacity: appear.opacity < 1 ? appear.opacity : undefined,
      filter: appear.blur > 0 ? `blur(${appear.blur * em}px)` : undefined,
      zIndex: scale > 1 ? 1 : undefined,
    }

    const pad = config.pillPadding * em * word.scale
    const boxWord = (background: string, textColor: string, radius: number) => {
      style.background = background
      style.color = textColor
      style.borderRadius = radius
      style.padding = `0 ${pad}px`
      style.margin = `0 ${-pad}px`
      style.WebkitTextStroke = 'initial'
      style.textShadow = 'none'
    }

    // Emphasis treatments (marked words)
    if (strong && amount > 0) {
      const radius = config.emphasisStyle === 'block' ? config.pillRadius * 0.5 * em : config.pillRadius * em
      if (config.emphasisStyle === 'pill' || config.emphasisStyle === 'block') {
        boxWord(rgba(accent, amount), mix(normal, contrastText(accent), amount), radius * word.scale)
      } else if (config.emphasisStyle === 'marker') {
        style.backgroundImage = `linear-gradient(transparent 52%, ${rgba(accent, 0.85)} 52%, ${rgba(accent, 0.85)} 92%, transparent 92%)`
        style.backgroundSize = `${amount * 100}% 100%`
        style.backgroundRepeat = 'no-repeat'
        style.padding = `0 ${pad * 0.5}px`
        style.margin = `0 ${-pad * 0.5}px`
      } else if (config.emphasisStyle === 'glow') {
        style.textShadow = [`0 0 ${0.3 * em * amount * config.glowStrength}px ${rgba(accent, 0.9)}`, shadow].filter(Boolean).join(', ')
      }
    }

    // Active-word effects
    if (active.glow > 0) {
      const g = active.glow * config.glowStrength
      style.textShadow = [`0 0 ${0.3 * em * g}px ${rgba(accent, 0.9)}`, `0 0 ${0.12 * em * g}px ${rgba(accent, 0.9)}`, shadow].filter(Boolean).join(', ')
    }
    if (active.highlight > 0) boxWord(rgba(accent, active.highlight), contrastText(accent), config.pillRadius * em)
    if (active.invert > 0) boxWord(rgba(config.normalColor, active.invert), contrastText(config.normalColor), config.pillRadius * 0.6 * em)

    const underline = Math.max(active.underline, strong && config.emphasisStyle === 'underline' ? amount : 0)
    return (
      <span key={word.index}>
        {wi > 0 ? ' ' : null}
        <span style={style} data-word={word.index} data-emphasis={level}>
          {word.display}
          {underline > 0 && (
            <span
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0.02 * em,
                height: config.underlineThickness * em,
                borderRadius: (config.underlineThickness / 2) * em,
                background: accent,
                transform: `scaleX(${underline})`,
                transformOrigin: 'left center',
              }}
            />
          )}
        </span>
      </span>
    )
  })
}

function SpeakerLabel({
  mode,
  name,
  color,
  labelPx,
  badge,
  rowH,
  gap,
  align,
}: {
  mode: CaptionStyleConfig['speakerLabel']
  name: string
  color: string
  labelPx: number
  badge: number
  rowH: number
  gap: number
  align: 'left' | 'center' | 'right'
}) {
  const circle: CSSProperties = {
    display: 'inline-grid',
    placeItems: 'center',
    width: badge,
    height: badge,
    borderRadius: '50%',
    background: color,
    color: contrastText(color),
    fontSize: labelPx * 0.9,
    fontWeight: 800,
    letterSpacing: 0,
  }
  return (
    <div
      data-speaker-label=""
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
        gap: labelPx * 0.5,
        height: rowH,
        marginBottom: gap,
        WebkitTextStroke: 'initial',
        textShadow: 'none',
        lineHeight: 1,
      }}
    >
      {mode === 'initials' && <span style={circle}>{initials(name)}</span>}
      {mode === 'name-icon' && (
        <span style={circle}>
          <svg viewBox="0 0 24 24" width={badge * 0.55} height={badge * 0.55} fill={contrastText(color)} aria-hidden>
            <path d={MIC_PATH} />
          </svg>
        </span>
      )}
      {mode !== 'initials' && (
        <span style={{ fontSize: labelPx, fontWeight: 800, letterSpacing: '0.08em', color, whiteSpace: 'nowrap' }}>{name.toUpperCase()}</span>
      )}
    </div>
  )
}

/** Editor-only overlay showing the safe area (never rendered into exports). */
export function SafeAreaGuides({ project, scale = 1 }: { project: Pick<Project, 'composition' | 'safeArea'>; scale?: number }) {
  const rect = safeRect(project.composition, project.safeArea)
  const line = 2 / scale
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          outline: `${line}px dashed rgba(56, 189, 248, 0.8)`,
          boxShadow: '0 0 0 100000px rgba(15, 23, 42, 0.28)',
        }}
      />
      {/* Centre line: centred captions sit on it, even though the box is wider on the left. */}
      <div
        style={{
          position: 'absolute',
          left: project.composition.width / 2 - line / 2,
          top: rect.y,
          width: line,
          height: rect.height,
          background: 'rgba(56, 189, 248, 0.35)',
        }}
      />
    </div>
  )
}
