/**
 * Text measurement with a per-word cache.
 *
 * Words are measured once at a 100 px reference size and scaled linearly, so
 * font-size changes (including keyframed font size) never re-measure.
 */

export interface FontSpec {
  /** CSS font-family list, e.g. `"Inter Variable", system-ui, sans-serif` */
  family: string
  weight: number
  sizePx: number
  /** Letter spacing in em. */
  letterSpacing: number
}

export type MeasureText = (text: string, font: FontSpec) => number

const REFERENCE_SIZE = 100
const cache = new Map<string, number>()
let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null

function getContext() {
  if (context) return context
  if (typeof OffscreenCanvas !== 'undefined') {
    context = new OffscreenCanvas(1, 1).getContext('2d')
  } else if (typeof document !== 'undefined') {
    context = document.createElement('canvas').getContext('2d')
  }
  return context
}

/** Width of `text` in CSS px, matching how the browser lays out the same span. */
export const measureText: MeasureText = (text, font) => {
  const key = `${font.weight}|${font.family}|${text}`
  let width = cache.get(key)
  if (width === undefined) {
    const ctx = getContext()
    if (ctx) {
      ctx.font = `${font.weight} ${REFERENCE_SIZE}px ${font.family}`
      width = ctx.measureText(text).width
    } else {
      width = text.length * REFERENCE_SIZE * 0.55 // non-browser fallback
    }
    cache.set(key, width)
  }
  // CSS letter-spacing is added after every character.
  return (width / REFERENCE_SIZE) * font.sizePx + font.letterSpacing * font.sizePx * [...text].length
}

/** Call after web fonts finish loading so fallback-font measurements are discarded. */
export function clearMeasureCache() {
  cache.clear()
}
