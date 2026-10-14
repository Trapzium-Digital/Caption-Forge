import { describe, expect, it } from 'vitest'
import { BOLD_POP_DEFAULTS, createProject, migrateProject, ProjectFormatError } from './index.ts'

describe('migrateProject', () => {
  it('accepts a freshly created project', () => {
    const project = createProject('Demo')
    expect(migrateProject(JSON.parse(JSON.stringify(project)))).toEqual(project)
  })

  it('rejects non-CaptionForge files', () => {
    expect(() => migrateProject({ hello: 'world' })).toThrow(ProjectFormatError)
  })

  it('rejects projects from a newer schema', () => {
    const project = { ...createProject('Demo'), schemaVersion: 999 }
    expect(() => migrateProject(project)).toThrow(/newer CaptionForge/)
  })

  it('reports invalid fields', () => {
    const project = { ...createProject('Demo'), name: '' }
    expect(() => migrateProject(project)).toThrow(/name/)
  })

  it('upgrades v1 projects to Bold Pop, keeping their look', () => {
    const v1 = {
      format: 'cfproject',
      schemaVersion: 1,
      id: 'proj_old',
      name: 'Old',
      createdAt: '2026-09-30T00:00:00Z',
      updatedAt: '2026-09-30T00:00:00Z',
      composition: { width: 1080, height: 1920, fps: 30 },
      media: [],
      primaryVideoId: null,
      captionTracks: [{ id: 't1', name: 'Captions', language: 'und', cues: [] }],
      activeCaptionTrackId: 't1',
      style: {
        fontFamily: 'Montserrat',
        fontSize: 70,
        fontWeight: 700,
        textTransform: 'none',
        color: '#eeeeee',
        highlightColor: '#ff0000',
        karaoke: true,
        strokeColor: '#111111',
        strokeWidth: 3,
        shadow: false,
        background: { enabled: true, color: '#222222', opacity: 0.4, radius: 10, padding: 16 },
        align: 'center',
        position: { x: 0.5, y: 0.8 },
        maxWidth: 0.8,
      },
      audioTracks: [],
    }
    const project = migrateProject(v1)
    expect(project.schemaVersion).toBe(4)
    expect(project.captionStyle.styleId).toBe('bold-pop')
    expect(project.captionStyle.config).toMatchObject({
      fontFamily: 'Montserrat',
      fontSize: 70,
      normalColor: '#eeeeee',
      activeColor: '#ff0000',
      outline: true,
      outlineWidth: 3,
      shadow: false,
      background: 'soft',
      activeAnimation: 'pop',
    })
    expect(project.captionLayer.keyframes).toEqual([])
    expect(project.safeArea.preset).toBe('universal')
    expect('style' in project).toBe(false)
  })

  it('upgrades v2 projects with effect settings that keep Bold Pop unchanged', () => {
    const v3 = createProject('Demo')
    const { activeScaleWithEffects, glowStrength, pillPadding, pillRadius, underlineThickness, ...v2config } = v3.captionStyle.config
    void [activeScaleWithEffects, glowStrength, pillPadding, pillRadius, underlineThickness]
    const v4only = ['activeScope', 'shakeAmount', 'textOpacity', 'riseDistance', 'revealMode', 'wordGroupSize', 'maxWords', 'wordEnterAnimation', 'wordEnterDurationMs', 'overshoot', 'emphasisStyle', 'secondaryColor', 'emphasisScale', 'emphasisWeight', 'emphasisReveal', 'emphasisAnimation', 'speakerLabel', 'speakerLabelSize', 'useSpeakerColors']
    const v2cfg = Object.fromEntries(Object.entries(v2config).filter(([k]) => !v4only.includes(k)))
    const { speakers, ...noSpeakers } = v3
    void speakers
    const v2 = { ...noSpeakers, schemaVersion: 2, captionStyle: { ...v3.captionStyle, config: v2cfg } }
    const project = migrateProject(JSON.parse(JSON.stringify(v2)))
    expect(project.schemaVersion).toBe(4)
    expect(project.captionStyle.config).toEqual(BOLD_POP_DEFAULTS)
  })

  it('keeps named safe-area presets in step with their current values', () => {
    const project = createProject('Demo')
    const old = { ...project, safeArea: { preset: 'universal', top: 0.1, bottom: 0.14, left: 0.06, right: 0.12 } }
    expect(migrateProject(JSON.parse(JSON.stringify(old))).safeArea).toMatchObject({ left: 0.1, right: 0.1 })
    const custom = { ...project, safeArea: { preset: 'custom', top: 0.1, bottom: 0.14, left: 0.06, right: 0.12 } }
    expect(migrateProject(JSON.parse(JSON.stringify(custom))).safeArea).toMatchObject({ left: 0.06, right: 0.12 })
  })

  it('repairs fractional times instead of rejecting the project', () => {
    const project = createProject('Demo')
    project.captionTracks[0].cues = [
      { id: 'c', startMs: 126360, endMs: 127357.59199999999, text: 'I want', words: [{ text: 'I', startMs: 126360.4, endMs: 126800.6 }] },
    ]
    project.captionLayer.keyframes = [{ id: 'k', property: 'scale', timeMs: 1000.7, value: 1.2, easing: 'linear' }]
    const repaired = migrateProject(JSON.parse(JSON.stringify(project)))
    expect(repaired.captionTracks[0].cues[0]).toMatchObject({ startMs: 126360, endMs: 127358, words: [{ startMs: 126360, endMs: 126801 }] })
    expect(repaired.captionLayer.keyframes[0].timeMs).toBe(1001)
  })
})
