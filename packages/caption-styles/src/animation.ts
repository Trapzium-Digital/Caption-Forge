import type {
  ActiveWordAnimation,
  CaptionStyleConfig,
  EmphasisAnimation,
  EnterAnimation,
  ExitAnimation,
  WordEnterAnimation,
} from '@captionforge/project-format'

/**
 * All animation is a pure function of time. The preview and the Remotion
 * export evaluate the same functions for the same timestamp, so frames match.
 */

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3)
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export interface BlockState {
  opacity: number
  /** em, positive = right */
  translateX: number
  /** em, positive = down */
  translateY: number
  scale: number
  /** em */
  blur: number
  /** 0..1 revealed from the left (wipe) */
  clip: number
}

export const REST: BlockState = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0, clip: 1 }

/** Scale that overshoots: `from` -> `overshoot` (at 60 %) -> 1. */
function overshootScale(p: number, from: number, overshoot: number): number {
  if (p >= 1) return 1
  if (p < 0.6) return from + (overshoot - from) * easeOutCubic(p / 0.6)
  return overshoot + (1 - overshoot) * easeInOutCubic((p - 0.6) / 0.4)
}

/** Entrance of the caption block: `elapsedMs` since the page appeared. */
export function enterState(animation: EnterAnimation, elapsedMs: number, durationMs: number, rise = 0.22, overshoot = 1.15): BlockState {
  if (animation === 'none' || durationMs <= 0 || elapsedMs >= durationMs) return REST
  const t = clamp01(elapsedMs / durationMs)
  const p = easeOutCubic(t)
  switch (animation) {
    case 'fade':
      return { ...REST, opacity: p }
    case 'fade-rise': // fade in while rising slightly and settling from 96 % scale
      return { ...REST, opacity: p, translateY: rise * (1 - p), scale: 0.96 + 0.04 * p }
    case 'pop-in':
      return { ...REST, opacity: easeOutCubic(t / 0.4), scale: overshootScale(t, 0.75, overshoot) }
    case 'slide-left':
      return { ...REST, opacity: p, translateX: -0.6 * (1 - p) }
    case 'blur-in':
      return { ...REST, opacity: p, blur: 0.18 * (1 - p), scale: 1.02 - 0.02 * p }
    case 'wipe':
      return { ...REST, clip: easeInOutCubic(t) }
  }
}

/** Exit: `remainingMs` until the caption disappears. */
export function exitState(animation: ExitAnimation, remainingMs: number, durationMs: number, rise = 0.22): BlockState {
  if (animation === 'none' || durationMs <= 0 || remainingMs >= durationMs) return REST
  const p = easeInCubic(1 - remainingMs / durationMs)
  switch (animation) {
    case 'fade':
      return { ...REST, opacity: 1 - p }
    case 'fade-drop': // fade out while dropping slightly
      return { ...REST, opacity: 1 - p, translateY: rise * 0.72 * p }
    case 'scale-down':
      return { ...REST, opacity: 1 - p, scale: 1 - 0.2 * p }
    case 'blur-out':
      return { ...REST, opacity: 1 - p, blur: 0.14 * p }
  }
}

/** Appearance of a single word (cumulative reveal) or a word group (group reveal). */
export function appearState(animation: WordEnterAnimation, elapsedMs: number, durationMs: number, overshoot = 1.15): BlockState {
  if (elapsedMs < 0) return { ...REST, opacity: 0 }
  if (animation === 'none' || durationMs <= 0 || elapsedMs >= durationMs) return REST
  const t = clamp01(elapsedMs / durationMs)
  const p = easeOutCubic(t)
  switch (animation) {
    case 'fade':
      return { ...REST, opacity: p }
    case 'scale-fade':
      return { ...REST, opacity: p, scale: 0.85 + 0.15 * p }
    case 'pop-in':
      return { ...REST, opacity: easeOutCubic(t / 0.35), scale: overshootScale(t, 0.75, overshoot) }
    case 'bounce': {
      // drop in from above and settle with one small rebound
      const y = t < 0.65 ? -0.45 * (1 - easeInCubic(t / 0.65)) : -0.48 * (overshoot - 1) * Math.sin(Math.PI * ((t - 0.65) / 0.35))
      return { ...REST, opacity: easeOutCubic(t / 0.3), translateY: y }
    }
    case 'slide-up':
      return { ...REST, opacity: p, translateY: 0.4 * (1 - p) }
    case 'slide-left':
      return { ...REST, opacity: p, translateX: 0.5 * (1 - p) }
    case 'slide-right':
      return { ...REST, opacity: p, translateX: -0.5 * (1 - p) }
    case 'blur':
      return { ...REST, opacity: p, blur: 0.25 * (1 - p) }
  }
}

export function combine(a: BlockState, b: BlockState): BlockState {
  return {
    opacity: a.opacity * b.opacity,
    translateX: a.translateX + b.translateX,
    translateY: a.translateY + b.translateY,
    scale: a.scale * b.scale,
    blur: Math.max(a.blur, b.blur),
    clip: Math.min(a.clip, b.clip),
  }
}

export interface WordState {
  active: boolean
  scale: number
  /** em, positive = right */
  translateX: number
  /** em, positive = down */
  translateY: number
  /** degrees */
  rotate: number
  /** 0..1 strength of the glow effect */
  glow: number
  /** 0..1 strength of the highlight box */
  highlight: number
  /** 0..1 underline draw progress */
  underline: number
  /** 0..1 color inversion (text on a normal-color box) */
  invert: number
}

const IDLE: WordState = { active: false, scale: 1, translateX: 0, translateY: 0, rotate: 0, glow: 0, highlight: 0, underline: 0, invert: 0 }

/** Scale of the controlled pop: quick ease-out rise to the peak, then a smooth settle back to 1. */
export function popScaleAt(p: number, popScale: number): number {
  if (p < 0 || p >= 1) return 1
  const peak = popScale - 1
  return p < 0.35 ? 1 + peak * easeOutCubic(p / 0.35) : 1 + peak * (1 - easeInOutCubic((p - 0.35) / 0.65))
}

/**
 * State of one word at `timeMs`. Effects run for `activeDurationMs` from the
 * word start so short words still get a complete, controlled motion.
 */
export function wordState(
  animation: ActiveWordAnimation,
  config: Pick<CaptionStyleConfig, 'activeDurationMs' | 'popScale'> &
    Partial<Pick<CaptionStyleConfig, 'activeScaleWithEffects' | 'shakeAmount'>>,
  word: { startMs: number; endMs: number },
  timeMs: number,
): WordState {
  if (animation === 'off') return IDLE
  const active = timeMs >= word.startMs && timeMs < word.endMs
  const elapsed = timeMs - word.startMs
  if (elapsed < 0) return IDLE
  const d = config.activeDurationMs
  const p = elapsed / d
  // Karaoke-style modes can add the same small pop on top of their effect.
  const effectScale = config.activeScaleWithEffects ? popScaleAt(p, config.popScale) : 1

  switch (animation) {
    case 'pop':
      return { ...IDLE, active, scale: popScaleAt(p, config.popScale) }
    case 'bounce': {
      if (p >= 1) return { ...IDLE, active }
      const lift = Math.sin(Math.PI * p) * (1 - 0.35 * p)
      return { ...IDLE, active, translateY: -0.14 * lift, scale: 1 + (config.popScale - 1) * 0.4 * lift }
    }
    case 'shake': {
      // A short decaying shake at the start of the word - never continuous.
      if (p >= 1) return { ...IDLE, active }
      const amount = config.shakeAmount ?? 0.5
      const wave = Math.sin(2 * Math.PI * 3 * p) * (1 - p)
      return { ...IDLE, active, translateX: 0.05 * amount * wave, rotate: 4 * amount * wave, scale: popScaleAt(p, config.popScale) }
    }
    case 'glow':
      return { ...IDLE, active, scale: effectScale, glow: active ? easeOutCubic(elapsed / 90) : 0 }
    case 'highlight':
      return { ...IDLE, active, scale: effectScale, highlight: active ? easeOutCubic(elapsed / 80) : 0 }
    case 'underline':
      return { ...IDLE, active, scale: effectScale, underline: active ? easeOutCubic(elapsed / 140) : 0 }
    case 'invert':
      return { ...IDLE, active, scale: effectScale, invert: active ? easeOutCubic(elapsed / 60) : 0 }
    default:
      return { ...IDLE, active }
  }
}

export interface EmphasisState {
  /** 0..1 how much of the emphasis treatment is shown */
  amount: number
  scale: number
  /** em */
  translateY: number
}

/** Emphasis on a marked word: always on (`static`) or animated in when the word is spoken. */
export function emphasisState(
  animation: EmphasisAnimation,
  reveal: 'static' | 'spoken',
  word: { startMs: number },
  timeMs: number,
  durationMs: number,
  popScale: number,
): EmphasisState {
  if (reveal === 'static') return { amount: 1, scale: 1, translateY: 0 }
  const elapsed = timeMs - word.startMs
  if (elapsed < 0) return { amount: 0, scale: 1, translateY: 0 }
  const t = durationMs > 0 ? elapsed / durationMs : 1
  const amount = animation === 'none' ? 1 : easeOutCubic(t)
  switch (animation) {
    case 'scale':
      return { amount, scale: 1 + 0.06 * Math.sin(Math.PI * clamp01(t)), translateY: 0 }
    case 'slide-up':
      return { amount, scale: 1, translateY: 0.22 * (1 - amount) }
    case 'pop':
      return { amount, scale: popScaleAt(t, popScale), translateY: 0 }
    default:
      return { amount, scale: 1, translateY: 0 }
  }
}
