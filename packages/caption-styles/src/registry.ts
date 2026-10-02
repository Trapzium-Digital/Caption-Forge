import {
  BOLD_POP_DEFAULTS,
  CINEMATIC_DEFAULTS,
  CREATOR_DEFAULTS,
  HIGHLIGHT_DEFAULTS,
  KARAOKE_DEFAULTS,
  MINIMAL_DEFAULTS,
  NEWS_DEFAULTS,
  PODCAST_DEFAULTS,
  PUNCH_DEFAULTS,
  WORD_BY_WORD_DEFAULTS,
  type ActiveWordAnimation,
  type BackgroundMode,
  type CaptionStyleConfig,
  type EmphasisAnimation,
  type EmphasisStyle,
  type EnterAnimation,
  type ExitAnimation,
  type WordEnterAnimation,
} from '@captionforge/project-format'

/**
 * Caption style registry. Every style is a preset over the same word-timed
 * renderer (CaptionLayer), plus how its inspector presents the options.
 * Preview and Remotion export render any style with that same component.
 */

export type InspectorSection =
  | 'typography'
  | 'color'
  | 'highlight'
  | 'emphasis'
  | 'punch'
  | 'wordGroup'
  | 'speaker'
  | 'layout'
  | 'appearance'
  | 'animation'
  | 'simple'

type Option<T> = { value: T; label: string }

export interface CaptionStyleDefinition {
  id: string
  name: string
  description: string
  defaults: CaptionStyleConfig
  /** Applying the style keeps the font the user already picked. */
  keepUserFont: boolean
  sections: InspectorSection[]
  activeLabel: string
  activeModes: Option<ActiveWordAnimation>[]
  scaleLabel: string
  scaleRange: [number, number]
  enterOptions: Option<EnterAnimation>[]
  exitOptions: Option<ExitAnimation>[]
  backgroundOptions: Option<BackgroundMode>[]
}

const ENTER_ALL: Option<EnterAnimation>[] = [
  { value: 'fade-rise', label: 'Fade + rise' },
  { value: 'fade', label: 'Fade' },
  { value: 'pop-in', label: 'Pop in (overshoot)' },
  { value: 'slide-left', label: 'Slide in' },
  { value: 'blur-in', label: 'Blur → sharp' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'none', label: 'None' },
]
const EXIT_ALL: Option<ExitAnimation>[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'fade-drop', label: 'Fade + drop' },
  { value: 'scale-down', label: 'Scale down + fade' },
  { value: 'blur-out', label: 'Blur out' },
  { value: 'none', label: 'None' },
]
const NONE_ENTER: Option<EnterAnimation> = { value: 'none', label: 'None' }
const NONE_EXIT: Option<ExitAnimation> = { value: 'none', label: 'None' }
const BG_BASIC: Option<BackgroundMode>[] = [
  { value: 'none', label: 'None' },
  { value: 'soft', label: 'Soft background' },
  { value: 'pill', label: 'Pill' },
]
const BG_ALL: Option<BackgroundMode>[] = [...BG_BASIC, { value: 'band', label: 'Full-width band' }, { value: 'bar', label: 'Bar with accent stripe' }]

export const WORD_ENTER_OPTIONS: Option<WordEnterAnimation>[] = [
  { value: 'scale-fade', label: 'Scale + fade' },
  { value: 'pop-in', label: 'Pop (overshoot)' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'slide-left', label: 'Slide left' },
  { value: 'slide-right', label: 'Slide right' },
  { value: 'blur', label: 'Blur → sharp' },
  { value: 'fade', label: 'Fade' },
  { value: 'none', label: 'None' },
]
export const EMPHASIS_STYLE_OPTIONS: Option<EmphasisStyle>[] = [
  { value: 'color', label: 'Accent color' },
  { value: 'pill', label: 'Pill' },
  { value: 'marker', label: 'Marker' },
  { value: 'underline', label: 'Underline' },
  { value: 'glow', label: 'Soft glow' },
  { value: 'block', label: 'Background block' },
  { value: 'weight', label: 'Weight change' },
  { value: 'scale', label: 'Scale change' },
]
export const EMPHASIS_ANIMATION_OPTIONS: Option<EmphasisAnimation>[] = [
  { value: 'pop', label: 'Pop' },
  { value: 'scale', label: 'Scale slightly' },
  { value: 'fade', label: 'Fade in' },
  { value: 'slide-up', label: 'Slide upward' },
  { value: 'none', label: 'None' },
]

const TAIL: InspectorSection[] = ['layout', 'appearance', 'animation']

export const CAPTION_STYLES: Record<string, CaptionStyleDefinition> = {
  'bold-pop': {
    id: 'bold-pop',
    name: 'Bold Pop',
    description: 'Heavy, high-contrast social captions. The spoken word turns the accent color with a controlled pop.',
    defaults: BOLD_POP_DEFAULTS,
    keepUserFont: true,
    sections: ['typography', 'color', ...TAIL],
    activeLabel: 'Active word',
    activeModes: [
      { value: 'pop', label: 'Pop' },
      { value: 'bounce', label: 'Bounce' },
      { value: 'glow', label: 'Glow' },
      { value: 'highlight', label: 'Highlight' },
      { value: 'underline', label: 'Underline' },
      { value: 'none', label: 'None (color only)' },
    ],
    scaleLabel: 'Pop strength',
    scaleRange: [1, 1.2],
    enterOptions: [...ENTER_ALL.slice(0, 2), NONE_ENTER],
    exitOptions: [EXIT_ALL[1], EXIT_ALL[0], NONE_EXIT],
    backgroundOptions: BG_BASIC,
  },
  karaoke: {
    id: 'karaoke',
    name: 'Karaoke',
    description: 'The whole caption stays on screen and follows the voice: the spoken word lights up with a small, rhythmic pop.',
    defaults: KARAOKE_DEFAULTS,
    keepUserFont: true,
    sections: ['typography', 'highlight', ...TAIL],
    activeLabel: 'Highlight mode',
    activeModes: [
      { value: 'pop', label: 'Color + Pop' },
      { value: 'none', label: 'Color' },
      { value: 'highlight', label: 'Pill' },
      { value: 'underline', label: 'Underline' },
      { value: 'glow', label: 'Glow' },
    ],
    scaleLabel: 'Active scale',
    scaleRange: [1, 1.12],
    enterOptions: [...ENTER_ALL.slice(0, 2), NONE_ENTER],
    exitOptions: [EXIT_ALL[0], EXIT_ALL[1], NONE_EXIT],
    backgroundOptions: BG_BASIC,
  },
  highlight: {
    id: 'highlight',
    name: 'Highlight',
    description: 'Calm, readable captions. Only the words you mark as important are emphasised - pill, marker, underline or glow.',
    defaults: HIGHLIGHT_DEFAULTS,
    keepUserFont: false,
    sections: ['typography', 'emphasis', ...TAIL],
    activeLabel: 'Spoken word',
    activeModes: [
      { value: 'off', label: 'No change' },
      { value: 'none', label: 'Accent color' },
    ],
    scaleLabel: 'Pop strength',
    scaleRange: [1, 1.12],
    enterOptions: [...ENTER_ALL.slice(0, 2), NONE_ENTER],
    exitOptions: [EXIT_ALL[0], EXIT_ALL[1], NONE_EXIT],
    backgroundOptions: BG_BASIC,
  },
  creator: {
    id: 'creator',
    name: 'Creator',
    description: 'Premium, confident hierarchy. The key phrase is larger, bolder and in the accent color; everything else stays still.',
    defaults: CREATOR_DEFAULTS,
    keepUserFont: false,
    sections: ['typography', 'emphasis', ...TAIL],
    activeLabel: 'Active',
    activeModes: [
      { value: 'pop', label: 'Small scale (marked words)' },
      { value: 'none', label: 'Color only' },
      { value: 'off', label: 'None' },
    ],
    scaleLabel: 'Active scale',
    scaleRange: [1, 1.1],
    enterOptions: [...ENTER_ALL.slice(0, 3), NONE_ENTER],
    exitOptions: [EXIT_ALL[0], EXIT_ALL[1], NONE_EXIT],
    backgroundOptions: BG_BASIC,
  },
  punch: {
    id: 'punch',
    name: 'Punch',
    description: 'Explosive hooks. Short phrases whose words slam in one by one with an overshoot. Readable, never shaking continuously.',
    defaults: PUNCH_DEFAULTS,
    keepUserFont: false,
    sections: ['typography', 'punch', ...TAIL],
    activeLabel: 'Active word',
    activeModes: [
      { value: 'pop', label: 'Pop' },
      { value: 'bounce', label: 'Bounce' },
      { value: 'shake', label: 'Shake' },
      { value: 'glow', label: 'Glow' },
      { value: 'invert', label: 'Color inversion' },
      { value: 'none', label: 'Accent color' },
    ],
    scaleLabel: 'Animation strength',
    scaleRange: [1, 1.25],
    enterOptions: [{ value: 'none', label: 'Words reveal themselves' }, ...ENTER_ALL.slice(0, 4)],
    exitOptions: [EXIT_ALL[2], EXIT_ALL[0], NONE_EXIT],
    backgroundOptions: [
      { value: 'none', label: 'None' },
      { value: 'pill', label: 'Pill' },
      { value: 'soft', label: 'Rounded block' },
      { value: 'band', label: 'Full-width band' },
    ],
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Quiet, elegant typography for documentary, luxury and corporate video. Supports the picture instead of dominating it.',
    defaults: MINIMAL_DEFAULTS,
    keepUserFont: false,
    sections: ['simple'],
    activeLabel: 'Active word',
    activeModes: [
      { value: 'off', label: 'None' },
      { value: 'none', label: 'Subtle color change' },
    ],
    scaleLabel: 'Scale',
    scaleRange: [1, 1],
    enterOptions: [ENTER_ALL[0], ENTER_ALL[1]],
    exitOptions: [EXIT_ALL[0]],
    backgroundOptions: [
      { value: 'none', label: 'None' },
      { value: 'soft', label: 'Subtle background' },
    ],
  },
  'word-by-word': {
    id: 'word-by-word',
    name: 'Word-by-Word',
    description: 'One spoken word (or small group) at a time, animated in at a stable anchor point. Fast and rhythmic.',
    defaults: WORD_BY_WORD_DEFAULTS,
    keepUserFont: false,
    sections: ['typography', 'wordGroup', 'layout', 'appearance'],
    activeLabel: 'Active word',
    activeModes: [
      { value: 'none', label: 'Accent color' },
      { value: 'pop', label: 'Pop' },
      { value: 'off', label: 'None' },
    ],
    scaleLabel: 'Pop strength',
    scaleRange: [1, 1.2],
    enterOptions: [NONE_ENTER],
    exitOptions: EXIT_ALL,
    backgroundOptions: BG_BASIC,
  },
  podcast: {
    id: 'podcast',
    name: 'Podcast',
    description: 'Structured conversation captions: a speaker name above each caption and a color per speaker. Built for interviews.',
    defaults: PODCAST_DEFAULTS,
    keepUserFont: false,
    sections: ['typography', 'speaker', ...TAIL],
    activeLabel: 'Active word',
    activeModes: [
      { value: 'none', label: 'Speaker color' },
      { value: 'pop', label: 'Speaker color + pop' },
      { value: 'underline', label: 'Underline' },
      { value: 'off', label: 'None' },
    ],
    scaleLabel: 'Active scale',
    scaleRange: [1, 1.1],
    enterOptions: [...ENTER_ALL.slice(0, 2), NONE_ENTER],
    exitOptions: [EXIT_ALL[0], EXIT_ALL[1], NONE_EXIT],
    backgroundOptions: BG_BASIC,
  },
  news: {
    id: 'news',
    name: 'News / Commentary',
    description: 'A broadcast-style lower third: solid bar, accent stripe and speaker tag, wiped in from the left. Mark words to flag them.',
    defaults: NEWS_DEFAULTS,
    keepUserFont: false,
    sections: ['typography', 'emphasis', 'speaker', ...TAIL],
    activeLabel: 'Spoken word',
    activeModes: [
      { value: 'off', label: 'No change' },
      { value: 'none', label: 'Accent color' },
      { value: 'underline', label: 'Underline' },
    ],
    scaleLabel: 'Scale',
    scaleRange: [1, 1.1],
    enterOptions: [ENTER_ALL[5], ENTER_ALL[3], ENTER_ALL[1], NONE_ENTER],
    exitOptions: [EXIT_ALL[0], EXIT_ALL[1], NONE_EXIT],
    backgroundOptions: BG_ALL,
  },
  cinematic: {
    id: 'cinematic',
    name: 'Cinematic Social',
    description: 'Film-title elegance for social: a refined serif, warm light and a slow focus-pull entrance. Marked words turn gold.',
    defaults: CINEMATIC_DEFAULTS,
    keepUserFont: false,
    sections: ['typography', 'emphasis', ...TAIL],
    activeLabel: 'Spoken word',
    activeModes: [
      { value: 'off', label: 'No change' },
      { value: 'none', label: 'Warm color' },
      { value: 'glow', label: 'Soft glow' },
    ],
    scaleLabel: 'Scale',
    scaleRange: [1, 1.06],
    enterOptions: [ENTER_ALL[4], ENTER_ALL[1], ENTER_ALL[0]],
    exitOptions: [EXIT_ALL[3], EXIT_ALL[0]],
    backgroundOptions: BG_BASIC,
  },
}

export function getCaptionStyle(id: string): CaptionStyleDefinition {
  return CAPTION_STYLES[id] ?? CAPTION_STYLES['bold-pop']
}

/**
 * Config for applying a style. Styles that respect the user's font keep it -
 * but only a font the user actually picked, not one that came with the
 * previous style (e.g. Cinematic's serif).
 */
export function styleConfigFor(id: string, currentFont?: string, currentStyleId?: string): CaptionStyleConfig {
  const def = getCaptionStyle(id)
  const config = structuredClone(def.defaults)
  const cameWithStyle = currentStyleId !== undefined && getCaptionStyle(currentStyleId).defaults.fontFamily === currentFont
  if (def.keepUserFont && currentFont && !cameWithStyle) config.fontFamily = currentFont
  return config
}
