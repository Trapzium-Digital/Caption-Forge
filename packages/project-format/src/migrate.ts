import { BOLD_POP_DEFAULTS, SAFE_AREA_PRESETS, safeAreaFromPreset } from './factory.ts'
import { CURRENT_SCHEMA_VERSION, ProjectSchema, type Project } from './schema.ts'

type RawProject = Record<string, unknown>

/**
 * Each migration upgrades a document from version N to N + 1.
 * Add a new entry here whenever the schema changes; never edit an old one.
 */
const migrations: Record<number, (doc: RawProject) => RawProject> = {
  // v1 -> v2: the single `style` object becomes a caption-style reference (Bold Pop),
  // plus safe areas and caption-layer keyframes.
  1: (doc) => {
    const { style, ...rest } = doc as RawProject & { style?: Record<string, unknown> }
    const old = style ?? {}
    const bg = (old.background ?? {}) as Record<string, unknown>
    const pick = <T>(value: unknown, fallback: T): T => (typeof value === typeof fallback ? (value as T) : fallback)
    const strokeWidth = pick(old.strokeWidth, 0)
    return {
      ...rest,
      schemaVersion: 2,
      captionStyle: {
        styleId: 'bold-pop',
        templateId: null,
        config: {
          ...BOLD_POP_DEFAULTS,
          fontFamily: pick(old.fontFamily, BOLD_POP_DEFAULTS.fontFamily),
          fontWeight: pick(old.fontWeight, BOLD_POP_DEFAULTS.fontWeight),
          fontSize: pick(old.fontSize, BOLD_POP_DEFAULTS.fontSize),
          textTransform: pick(old.textTransform, BOLD_POP_DEFAULTS.textTransform),
          normalColor: pick(old.color, BOLD_POP_DEFAULTS.normalColor),
          activeColor: pick(old.highlightColor, BOLD_POP_DEFAULTS.activeColor),
          outline: strokeWidth > 0,
          outlineWidth: strokeWidth > 0 ? strokeWidth : BOLD_POP_DEFAULTS.outlineWidth,
          outlineColor: pick(old.strokeColor, BOLD_POP_DEFAULTS.outlineColor),
          shadow: pick(old.shadow, BOLD_POP_DEFAULTS.shadow),
          background: bg.enabled === true ? 'soft' : 'none',
          backgroundColor: pick(bg.color, BOLD_POP_DEFAULTS.backgroundColor),
          backgroundOpacity: pick(bg.opacity, BOLD_POP_DEFAULTS.backgroundOpacity),
          backgroundRadius: pick(bg.radius, BOLD_POP_DEFAULTS.backgroundRadius),
          maxWidth: Math.max(0.2, pick(old.maxWidth, BOLD_POP_DEFAULTS.maxWidth)),
          activeAnimation: old.karaoke === false ? 'none' : 'pop',
        },
      },
      captionLayer: { keyframes: [] },
      safeArea: safeAreaFromPreset('universal'),
    }
  },
  // v2 -> v3: active-word effect settings (defaults keep Bold Pop unchanged).
  2: (doc) => {
    const style = (doc.captionStyle ?? {}) as { config?: Record<string, unknown> }
    const config = style.config ?? {}
    return {
      ...doc,
      schemaVersion: 3,
      captionStyle: {
        ...style,
        config: {
          activeScaleWithEffects: BOLD_POP_DEFAULTS.activeScaleWithEffects,
          glowStrength: BOLD_POP_DEFAULTS.glowStrength,
          pillPadding: BOLD_POP_DEFAULTS.pillPadding,
          pillRadius: BOLD_POP_DEFAULTS.pillRadius,
          underlineThickness: BOLD_POP_DEFAULTS.underlineThickness,
          ...config,
        },
      },
    }
  },
  // v3 -> v4: reveal modes, emphasis, speakers and new animations (defaults keep existing looks).
  3: (doc) => {
    const style = (doc.captionStyle ?? {}) as { config?: Record<string, unknown> }
    const added = Object.fromEntries(
      Object.entries(BOLD_POP_DEFAULTS).filter(([key]) => V4_FIELDS.includes(key as (typeof V4_FIELDS)[number])),
    )
    return {
      ...doc,
      schemaVersion: 4,
      speakers: [],
      captionStyle: { ...style, config: { ...added, ...(style.config ?? {}) } },
    }
  },
}

const V4_FIELDS = [
  'activeScope',
  'shakeAmount',
  'textOpacity',
  'riseDistance',
  'revealMode',
  'wordGroupSize',
  'maxWords',
  'wordEnterAnimation',
  'wordEnterDurationMs',
  'overshoot',
  'emphasisStyle',
  'secondaryColor',
  'emphasisScale',
  'emphasisWeight',
  'emphasisReveal',
  'emphasisAnimation',
  'speakerLabel',
  'speakerLabelSize',
  'useSpeakerColors',
] as const

export class ProjectFormatError extends Error {}

/**
 * Times are whole milliseconds. Older builds could store a fractional time (e.g. a
 * split at the playhead, 127357.592). Round every time field so such projects still
 * open and render, instead of failing validation.
 */
function repairTimes(doc: RawProject): RawProject {
  const round = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : v)
  const tracks = Array.isArray(doc.captionTracks) ? doc.captionTracks : null
  const layer = doc.captionLayer as { keyframes?: unknown[] } | undefined
  return {
    ...doc,
    ...(tracks && {
      captionTracks: tracks.map((t: Record<string, unknown>) => ({
        ...t,
        cues: Array.isArray(t.cues)
          ? t.cues.map((c: Record<string, unknown>) => ({
              ...c,
              startMs: round(c.startMs),
              endMs: round(c.endMs),
              ...(Array.isArray(c.words) && {
                words: c.words.map((w: Record<string, unknown>) => ({ ...w, startMs: round(w.startMs), endMs: round(w.endMs) })),
              }),
            }))
          : t.cues,
      })),
    }),
    ...(layer && Array.isArray(layer.keyframes) && {
      captionLayer: { ...layer, keyframes: layer.keyframes.map((k) => ({ ...(k as object), timeMs: round((k as { timeMs?: unknown }).timeMs) })) },
    }),
  }
}

/** A named safe-area preset always uses the current preset values; only "custom" keeps its own numbers. */
function syncSafeAreaPreset(doc: RawProject): RawProject {
  const preset = (doc.safeArea as { preset?: unknown } | undefined)?.preset
  if (typeof preset !== 'string' || !(preset in SAFE_AREA_PRESETS)) return doc
  return { ...doc, safeArea: safeAreaFromPreset(preset as keyof typeof SAFE_AREA_PRESETS) }
}

export function migrateProject(input: unknown): Project {
  if (typeof input !== 'object' || input === null) {
    throw new ProjectFormatError('Project file is not a JSON object')
  }
  let doc = { ...(input as RawProject) }
  if (doc.format !== 'cfproject') {
    throw new ProjectFormatError('Not a CaptionForge project (missing "format": "cfproject")')
  }
  doc = repairTimes(doc)

  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `Project was saved by a newer CaptionForge (schema v${version}); this version supports up to v${CURRENT_SCHEMA_VERSION}`,
    )
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations[version]
    if (!step) throw new ProjectFormatError(`No migration from schema v${version}`)
    doc = step(doc)
    version += 1
  }

  doc = syncSafeAreaPreset(doc)

  const parsed = ProjectSchema.safeParse(doc)
  if (!parsed.success) {
    throw new ProjectFormatError(`Invalid project: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
  }
  return parsed.data
}
