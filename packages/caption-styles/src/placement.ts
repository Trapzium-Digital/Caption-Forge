import { STYLE_REFERENCE_PX, type Anchor, type CaptionStyleConfig, type Composition, type SafeArea } from '@captionforge/project-format'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Multiplier from style pixels (authored at 1080 short side) to composition pixels. */
export function styleScale(composition: Composition): number {
  return Math.min(composition.width, composition.height) / STYLE_REFERENCE_PX
}

export function safeRect(composition: Composition, safeArea: SafeArea): Rect {
  const x = safeArea.left * composition.width
  const y = safeArea.top * composition.height
  return {
    x,
    y,
    width: Math.max(1, composition.width * (1 - safeArea.left - safeArea.right)),
    height: Math.max(1, composition.height * (1 - safeArea.top - safeArea.bottom)),
  }
}

export function anchorParts(anchor: Anchor): { h: 'left' | 'center' | 'right'; v: 'top' | 'middle' | 'bottom' } {
  const [v, h] = anchor.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right']
  return { h, v }
}

/** Widest a caption line may be: the style's max width, never wider than the safe area. */
export function maxCaptionWidth(composition: Composition, safeArea: SafeArea, config: CaptionStyleConfig): number {
  return Math.min(config.maxWidth * composition.width, safeRect(composition, safeArea).width)
}

/**
 * Top-left position for a caption box of the given size: anchored inside the
 * safe area, moved by the style offsets, then kept inside the safe area.
 */
export function placeBox(
  composition: Composition,
  safeArea: SafeArea,
  config: Pick<CaptionStyleConfig, 'anchor' | 'xOffset' | 'yOffset'>,
  box: { width: number; height: number },
): { left: number; top: number } {
  const safe = safeRect(composition, safeArea)
  const { h, v } = anchorParts(config.anchor)
  let left = h === 'left' ? safe.x : h === 'right' ? safe.x + safe.width - box.width : safe.x + (safe.width - box.width) / 2
  let top = v === 'top' ? safe.y : v === 'bottom' ? safe.y + safe.height - box.height : safe.y + (safe.height - box.height) / 2
  left += config.xOffset * composition.width
  top -= config.yOffset * composition.height

  const clamp = (value: number, min: number, size: number, available: number) =>
    size >= available ? min + (available - size) / 2 : Math.min(Math.max(value, min), min + available - size)
  left = clamp(left, safe.x, box.width, safe.width)
  top = clamp(top, safe.y, box.height, safe.height)
  return { left, top }
}
