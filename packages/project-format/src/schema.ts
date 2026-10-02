import { z } from 'zod'

/**
 * Canonical CaptionForge project document (.cfproject).
 *
 * All times are integer milliseconds. Positions and offsets are normalised
 * 0..1 relative to the composition frame so projects survive resolution
 * changes. Pixel sizes in caption styles are authored against a 1080 px
 * short side and scaled to the actual composition.
 */

export const CURRENT_SCHEMA_VERSION = 4

/** Style pixel values are authored for a frame whose short side is this many pixels. */
export const STYLE_REFERENCE_PX = 1080

export const WordSchema = z.object({
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
})

export const EmphasisLevelSchema = z.enum(['important', 'primary', 'secondary'])

export const CueSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
  words: z.array(WordSchema).optional(),
  speaker: z.string().optional(),
  /** Manual word emphasis, keyed by word index in the cue ("0", "1", …). Missing = normal. */
  emphasis: z.record(z.string(), EmphasisLevelSchema).optional(),
})

export const SpeakerSchema = z.object({
  name: z.string().min(1),
  color: z.string(),
})

export const CaptionTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string().default('und'),
  cues: z.array(CueSchema),
  /** Set on a translated track: the track it was translated from. */
  sourceTrackId: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Caption styles

export const AnchorSchema = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
])

/** How the caption block appears. */
export const EnterAnimationSchema = z.enum(['none', 'fade', 'fade-rise', 'pop-in', 'slide-left', 'blur-in', 'wipe'])
/** How the caption block leaves. */
export const ExitAnimationSchema = z.enum(['none', 'fade', 'fade-drop', 'scale-down', 'blur-out'])
/**
 * Effect on the spoken word. `none` = color change only, `off` = no active-word
 * treatment at all (styles that emphasise chosen words instead).
 */
export const ActiveWordAnimationSchema = z.enum(['off', 'none', 'pop', 'bounce', 'shake', 'glow', 'highlight', 'underline', 'invert'])
export const BackgroundModeSchema = z.enum(['none', 'soft', 'pill', 'band', 'bar'])
/** Which words are on screen: the whole cue, words once spoken, or only the current group. */
export const RevealModeSchema = z.enum(['cue', 'cumulative', 'group'])
/** How an individual word (cumulative) or word group (group) appears. */
export const WordEnterAnimationSchema = z.enum(['none', 'fade', 'scale-fade', 'pop-in', 'bounce', 'slide-up', 'slide-left', 'slide-right', 'blur'])
export const EmphasisStyleSchema = z.enum(['color', 'pill', 'marker', 'underline', 'glow', 'block', 'weight', 'scale'])
export const EmphasisAnimationSchema = z.enum(['none', 'fade', 'scale', 'slide-up', 'pop'])
export const SpeakerLabelSchema = z.enum(['none', 'name', 'name-icon', 'initials'])

/**
 * Word-timed social caption configuration. Every style in the style registry
 * is expressed with this config; a style is a named set of defaults plus the
 * renderer features it enables.
 */
export const CaptionStyleConfigSchema = z.object({
  // Typography
  fontFamily: z.string(),
  fontWeight: z.number().int().min(100).max(900),
  fontSize: z.number().min(8).max(400),
  letterSpacing: z.number().min(-0.2).max(0.5), // em
  lineHeight: z.number().min(0.7).max(2.5),
  textTransform: z.enum(['none', 'uppercase', 'lowercase']),
  // Color
  normalColor: z.string(),
  activeColor: z.string(),
  // Layout
  anchor: AnchorSchema,
  xOffset: z.number().min(-1).max(1), // fraction of width, + = right
  yOffset: z.number().min(-1).max(1), // fraction of height, + = up
  maxWidth: z.number().min(0.2).max(1), // fraction of width
  maxLines: z.number().int().min(1).max(4),
  // Appearance
  outline: z.boolean(),
  outlineWidth: z.number().min(0).max(20),
  outlineColor: z.string(),
  shadow: z.boolean(),
  shadowBlur: z.number().min(0).max(60),
  shadowOpacity: z.number().min(0).max(1),
  shadowColor: z.string(),
  background: BackgroundModeSchema,
  backgroundColor: z.string(),
  backgroundOpacity: z.number().min(0).max(1),
  backgroundRadius: z.number().min(0).max(100),
  // Animation
  enterAnimation: EnterAnimationSchema,
  activeAnimation: ActiveWordAnimationSchema,
  exitAnimation: ExitAnimationSchema,
  enterDurationMs: z.number().int().min(0).max(1000),
  activeDurationMs: z.number().int().min(40).max(1000),
  exitDurationMs: z.number().int().min(0).max(1000),
  popScale: z.number().min(1).max(1.5),
  /** Also run the scale pop in glow / pill / underline modes (Karaoke), not only in Pop. */
  activeScaleWithEffects: z.boolean(),
  // Active-word effect settings
  glowStrength: z.number().min(0).max(2),
  pillPadding: z.number().min(0).max(0.6), // em
  pillRadius: z.number().min(0).max(0.6), // em
  underlineThickness: z.number().min(0.02).max(0.3), // em
  /** Which words get the active-word effect. */
  activeScope: z.enum(['all', 'emphasized']),
  shakeAmount: z.number().min(0).max(1),
  // Text
  textOpacity: z.number().min(0).max(1),
  /** Distance for rise/drop animations, em. */
  riseDistance: z.number().min(0).max(1),
  // Reveal
  revealMode: RevealModeSchema,
  /** Words per group in group reveal; 0 = natural phrase. */
  wordGroupSize: z.number().int().min(0).max(6),
  /** Max words on screen at once (cue/cumulative); 0 = unlimited. */
  maxWords: z.number().int().min(0).max(40),
  wordEnterAnimation: WordEnterAnimationSchema,
  wordEnterDurationMs: z.number().int().min(0).max(1000),
  overshoot: z.number().min(1).max(1.4),
  // Emphasis (manually marked words)
  emphasisStyle: EmphasisStyleSchema,
  secondaryColor: z.string(),
  emphasisScale: z.number().min(1).max(2),
  emphasisWeight: z.number().int().min(100).max(900),
  /** `static`: emphasis always shown. `spoken`: emphasis animates in when the word is spoken. */
  emphasisReveal: z.enum(['static', 'spoken']),
  emphasisAnimation: EmphasisAnimationSchema,
  // Speakers
  speakerLabel: SpeakerLabelSchema,
  speakerLabelSize: z.number().min(0.3).max(1.2), // em
  /** Color labels and active words with each speaker's color. */
  useSpeakerColors: z.boolean(),
})

export const CaptionStyleRefSchema = z.object({
  /** Built-in style id from the style registry, e.g. "bold-pop". */
  styleId: z.string(),
  /** Template the settings came from, if any (templates live in the local API). */
  templateId: z.string().nullable(),
  config: CaptionStyleConfigSchema,
})

// ---------------------------------------------------------------------------
// Safe areas and caption-layer keyframes

export const SafeAreaPresetSchema = z.enum(['none', 'universal', 'tiktok', 'reels', 'shorts', 'custom'])

export const SafeAreaSchema = z.object({
  preset: SafeAreaPresetSchema,
  top: z.number().min(0).max(0.5),
  bottom: z.number().min(0).max(0.5),
  left: z.number().min(0).max(0.5),
  right: z.number().min(0).max(0.5),
})

export const KeyframePropertySchema = z.enum(['x', 'y', 'scale', 'rotation', 'opacity', 'blur', 'glow', 'fontSize'])
export const EasingSchema = z.enum(['linear', 'ease-in-out', 'ease-out', 'hold'])

export const KeyframeSchema = z.object({
  id: z.string(),
  property: KeyframePropertySchema,
  timeMs: z.number().int().nonnegative(),
  value: z.number(),
  /** Easing used from this keyframe to the next one. */
  easing: EasingSchema,
})

export const CaptionLayerSchema = z.object({
  keyframes: z.array(KeyframeSchema),
})

// ---------------------------------------------------------------------------
// Media, audio, project

export const MediaKindSchema = z.enum(['video', 'audio', 'image'])

export const MediaRefSchema = z.object({
  id: z.string(),
  kind: MediaKindSchema,
  name: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  hasAudio: z.boolean().optional(),
})

export const AudioTrackSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  name: z.string(),
  startMs: z.number().int().nonnegative(),
  volume: z.number().min(0).max(2),
  fadeInMs: z.number().int().nonnegative(),
  fadeOutMs: z.number().int().nonnegative(),
  loop: z.boolean(),
  muted: z.boolean(),
  solo: z.boolean(),
})

export const CompositionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
})

export const ProjectSchema = z.object({
  format: z.literal('cfproject'),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  composition: CompositionSchema,
  media: z.array(MediaRefSchema),
  primaryVideoId: z.string().nullable(),
  captionTracks: z.array(CaptionTrackSchema).min(1),
  activeCaptionTrackId: z.string(),
  captionStyle: CaptionStyleRefSchema,
  captionLayer: CaptionLayerSchema,
  speakers: z.array(SpeakerSchema),
  safeArea: SafeAreaSchema,
  audioTracks: z.array(AudioTrackSchema),
})

export type Word = z.infer<typeof WordSchema>
export type EmphasisLevel = z.infer<typeof EmphasisLevelSchema>
export type Speaker = z.infer<typeof SpeakerSchema>
export type RevealMode = z.infer<typeof RevealModeSchema>
export type WordEnterAnimation = z.infer<typeof WordEnterAnimationSchema>
export type EmphasisStyle = z.infer<typeof EmphasisStyleSchema>
export type EmphasisAnimation = z.infer<typeof EmphasisAnimationSchema>
export type SpeakerLabel = z.infer<typeof SpeakerLabelSchema>
export type Cue = z.infer<typeof CueSchema>
export type CaptionTrack = z.infer<typeof CaptionTrackSchema>
export type Anchor = z.infer<typeof AnchorSchema>
export type EnterAnimation = z.infer<typeof EnterAnimationSchema>
export type ExitAnimation = z.infer<typeof ExitAnimationSchema>
export type ActiveWordAnimation = z.infer<typeof ActiveWordAnimationSchema>
export type BackgroundMode = z.infer<typeof BackgroundModeSchema>
export type CaptionStyleConfig = z.infer<typeof CaptionStyleConfigSchema>
export type CaptionStyleRef = z.infer<typeof CaptionStyleRefSchema>
export type SafeAreaPreset = z.infer<typeof SafeAreaPresetSchema>
export type SafeArea = z.infer<typeof SafeAreaSchema>
export type KeyframeProperty = z.infer<typeof KeyframePropertySchema>
export type Easing = z.infer<typeof EasingSchema>
export type Keyframe = z.infer<typeof KeyframeSchema>
export type CaptionLayer = z.infer<typeof CaptionLayerSchema>
export type MediaKind = z.infer<typeof MediaKindSchema>
export type MediaRef = z.infer<typeof MediaRefSchema>
export type AudioTrack = z.infer<typeof AudioTrackSchema>
export type Composition = z.infer<typeof CompositionSchema>
export type Project = z.infer<typeof ProjectSchema>
