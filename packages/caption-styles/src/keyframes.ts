import type { CaptionStyleConfig, Easing, Keyframe, KeyframeProperty } from '@captionforge/project-format'
import { easeInOutCubic, easeOutCubic } from './animation.ts'

export interface KeyframePropertyInfo {
  label: string
  unit: string
  min: number
  max: number
  step: number
}

export const KEYFRAME_PROPERTIES: Record<KeyframeProperty, KeyframePropertyInfo> = {
  x: { label: 'X', unit: '%', min: -0.5, max: 0.5, step: 0.005 },
  y: { label: 'Y', unit: '%', min: -0.5, max: 0.5, step: 0.005 },
  scale: { label: 'Scale', unit: '×', min: 0.2, max: 3, step: 0.01 },
  rotation: { label: 'Rotation', unit: '°', min: -180, max: 180, step: 1 },
  opacity: { label: 'Opacity', unit: '%', min: 0, max: 1, step: 0.01 },
  blur: { label: 'Blur', unit: 'px', min: 0, max: 40, step: 0.5 },
  glow: { label: 'Glow', unit: 'px', min: 0, max: 60, step: 1 },
  fontSize: { label: 'Font size', unit: 'px', min: 8, max: 400, step: 1 },
}

export type LayerValues = Record<KeyframeProperty, number>

export function baseLayerValues(config: CaptionStyleConfig): LayerValues {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, blur: 0, glow: 0, fontSize: config.fontSize }
}

function ease(easing: Easing, t: number): number {
  if (easing === 'hold') return 0
  if (easing === 'ease-in-out') return easeInOutCubic(t)
  if (easing === 'ease-out') return easeOutCubic(t)
  return t
}

export function keyframesFor(keyframes: Keyframe[], property: KeyframeProperty): Keyframe[] {
  return keyframes.filter((k) => k.property === property).sort((a, b) => a.timeMs - b.timeMs)
}

/** Value of one property at a time. Without keyframes the style's base value is used. */
export function evaluateProperty(keyframes: Keyframe[], property: KeyframeProperty, timeMs: number, base: number): number {
  const list = keyframesFor(keyframes, property)
  if (list.length === 0) return base
  if (timeMs <= list[0].timeMs) return list[0].value
  const last = list[list.length - 1]
  if (timeMs >= last.timeMs) return last.value
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]
    const b = list[i + 1]
    if (timeMs >= a.timeMs && timeMs < b.timeMs) {
      const t = (timeMs - a.timeMs) / (b.timeMs - a.timeMs)
      return a.value + (b.value - a.value) * ease(a.easing, t)
    }
  }
  return last.value
}

export function evaluateLayer(keyframes: Keyframe[], timeMs: number, config: CaptionStyleConfig): LayerValues {
  const base = baseLayerValues(config)
  const out = { ...base }
  for (const property of Object.keys(base) as KeyframeProperty[]) {
    out[property] = evaluateProperty(keyframes, property, timeMs, base[property])
  }
  return out
}
