import '@fontsource-variable/inter'
import '@fontsource-variable/montserrat'
import '@fontsource-variable/geist'
import '@fontsource/anton'
import '@fontsource/bebas-neue'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/700.css'
import '@fontsource/poppins/800.css'
import '@fontsource/poppins/900.css'
import '@fontsource-variable/playfair-display'

/**
 * Fonts bundled with CaptionForge. The same files are loaded by the editor
 * preview and by the Remotion renderer, so text metrics match exactly.
 */
export const FONT_OPTIONS: { label: string; family: string; weights: number[] }[] = [
  { label: 'Inter', family: 'Inter Variable', weights: [400, 500, 600, 700, 800, 900] },
  { label: 'Montserrat', family: 'Montserrat Variable', weights: [400, 500, 600, 700, 800, 900] },
  { label: 'Poppins', family: 'Poppins', weights: [500, 700, 800, 900] },
  { label: 'Geist', family: 'Geist Variable', weights: [400, 500, 600, 700, 800, 900] },
  { label: 'Anton', family: 'Anton', weights: [400] },
  { label: 'Bebas Neue', family: 'Bebas Neue', weights: [400] },
  { label: 'Playfair Display', family: 'Playfair Display Variable', weights: [400, 500, 600, 700, 800, 900] },
]

export function fontEntry(family: string) {
  return FONT_OPTIONS.find((f) => f.label === family || f.family === family)
}

export function cssFontFamily(family: string): string {
  return `"${fontEntry(family)?.family ?? family}", system-ui, sans-serif`
}

/** Loads the font face used by a style. Resolves even if loading fails (fallback font is used). */
export async function loadCaptionFont(family: string, weight: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const name = fontEntry(family)?.family ?? family
  try {
    await document.fonts.load(`${weight} 100px "${name}"`, 'ABCabc')
  } catch {
    /* fall back silently */
  }
}
