import { create } from 'zustand'
import { createId, type CaptionStyleConfig, type CaptionTrack, type Cue, type Project } from '@captionforge/project-format'
import { mergeCues, sortCues, splitCue, MIN_CUE_MS } from '@captionforge/captions'
import type { MediaAsset, Waveform } from '@/lib/api'

const HISTORY_LIMIT = 200
const COALESCE_MS = 600

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

interface EditorState {
  project: Project | null
  media: MediaAsset[]
  revision: number
  saveState: SaveState
  past: Project[]
  future: Project[]
  lastEdit: { key: string; at: number } | null

  selectedCueId: string | null
  currentTimeMs: number
  playing: boolean
  pxPerSecond: number
  showSafeArea: boolean
  /** Audio envelope of the main video (timeline display + speech-aware word timing). */
  waveform: Waveform | null

  load: (project: Project, media: MediaAsset[]) => void
  unload: () => void
  setMedia: (media: MediaAsset[]) => void
  /** Apply an edit. Edits sharing a coalesceKey within a short window become one undo step. */
  update: (recipe: (draft: Project) => void, coalesceKey?: string) => void
  undo: () => void
  redo: () => void
  setSaveState: (s: SaveState) => void

  selectCue: (id: string | null) => void
  setCurrentTime: (ms: number) => void
  setPlaying: (playing: boolean) => void
  setZoom: (pxPerSecond: number) => void
  setShowSafeArea: (show: boolean) => void
  setWaveform: (waveform: Waveform | null) => void
  /** Change caption style settings. Edits made after applying a template detach nothing; the template link is kept. */
  setStyle: (patch: Partial<CaptionStyleConfig>, coalesceKey?: string) => void

  setCues: (cues: Cue[]) => void
  setActiveTrack: (id: string) => void
  addTrack: (track: CaptionTrack) => void
  renameTrack: (id: string, name: string) => void
  deleteTrack: (id: string) => void
  updateCue: (id: string, patch: Partial<Cue>, coalesceKey?: string) => void
  addCueAt: (startMs: number, durationMs?: number) => void
  deleteCue: (id: string) => void
  splitSelectedAt: (ms: number) => boolean
  mergeSelectedWithNext: () => boolean
}

export function activeTrack(project: Project): CaptionTrack {
  return project.captionTracks.find((t) => t.id === project.activeCaptionTrackId) ?? project.captionTracks[0]
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  media: [],
  revision: 0,
  saveState: 'saved',
  past: [],
  future: [],
  lastEdit: null,
  selectedCueId: null,
  currentTimeMs: 0,
  playing: false,
  pxPerSecond: 120,
  showSafeArea: true,
  waveform: null,

  load: (project, media) =>
    set({
      project,
      media,
      revision: 0,
      saveState: 'saved',
      past: [],
      future: [],
      lastEdit: null,
      selectedCueId: null,
      currentTimeMs: 0,
      playing: false,
    }),
  unload: () => set({ project: null, media: [], past: [], future: [], waveform: null }),
  setMedia: (media) => set({ media }),

  update: (recipe, coalesceKey) => {
    const { project, past, lastEdit, revision } = get()
    if (!project) return
    const draft = structuredClone(project)
    recipe(draft)
    const now = Date.now()
    // Keys starting with "drag:" are unique per pointer gesture, so the whole drag is one undo step.
    const coalesce =
      coalesceKey && lastEdit?.key === coalesceKey && (coalesceKey.startsWith('drag:') || now - lastEdit.at < COALESCE_MS)
    set({
      project: draft,
      past: coalesce ? past : [...past, project].slice(-HISTORY_LIMIT),
      future: [],
      lastEdit: coalesceKey ? { key: coalesceKey, at: now } : null,
      revision: revision + 1,
      saveState: 'dirty',
    })
  },

  undo: () => {
    const { project, past, future, revision } = get()
    if (!project || past.length === 0) return
    set({
      project: past[past.length - 1],
      past: past.slice(0, -1),
      future: [project, ...future],
      lastEdit: null,
      revision: revision + 1,
      saveState: 'dirty',
    })
  },

  redo: () => {
    const { project, past, future, revision } = get()
    if (!project || future.length === 0) return
    set({
      project: future[0],
      past: [...past, project],
      future: future.slice(1),
      lastEdit: null,
      revision: revision + 1,
      saveState: 'dirty',
    })
  },

  setSaveState: (saveState) => set({ saveState }),
  selectCue: (selectedCueId) => set({ selectedCueId }),
  setCurrentTime: (ms) => set({ currentTimeMs: Math.max(0, ms) }),
  setPlaying: (playing) => set({ playing }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: Math.min(1200, Math.max(10, pxPerSecond)) }),
  setShowSafeArea: (showSafeArea) => set({ showSafeArea }),
  setWaveform: (waveform) => set({ waveform }),
  setStyle: (patch, coalesceKey) =>
    get().update((p) => {
      p.captionStyle.config = { ...p.captionStyle.config, ...patch }
    }, coalesceKey ?? `style:${Object.keys(patch).join(',')}`),

  setActiveTrack: (id) => {
    get().update((p) => {
      if (p.captionTracks.some((t) => t.id === id)) p.activeCaptionTrackId = id
    })
    set({ selectedCueId: null })
  },
  addTrack: (track) => {
    get().update((p) => {
      p.captionTracks.push(track)
      p.activeCaptionTrackId = track.id
    })
    set({ selectedCueId: null })
  },
  renameTrack: (id, name) =>
    get().update((p) => {
      const track = p.captionTracks.find((t) => t.id === id)
      if (track) track.name = name.trim() || track.name
    }, `track-name:${id}`),
  deleteTrack: (id) => {
    get().update((p) => {
      if (p.captionTracks.length < 2) return
      p.captionTracks = p.captionTracks.filter((t) => t.id !== id)
      if (p.activeCaptionTrackId === id) p.activeCaptionTrackId = p.captionTracks[0].id
    })
    set({ selectedCueId: null })
  },

  setCues: (cues) =>
    get().update((p) => {
      activeTrack(p).cues = sortCues(cues)
    }),

  updateCue: (id, patch, coalesceKey) =>
    get().update((p) => {
      const track = activeTrack(p)
      track.cues = sortCues(track.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    }, coalesceKey ?? `cue:${id}:${Object.keys(patch).join(',')}`),

  addCueAt: (startMs, durationMs = 2000) => {
    const { project } = get()
    if (!project) return
    const cues = activeTrack(project).cues
    const next = cues.find((c) => c.startMs > startMs)
    const endMs = Math.min(startMs + durationMs, next ? next.startMs : Infinity)
    if (endMs - startMs < MIN_CUE_MS) return
    const cue: Cue = { id: createId('cue'), startMs: Math.round(startMs), endMs: Math.round(endMs), text: 'New caption' }
    get().update((p) => {
      const track = activeTrack(p)
      track.cues = sortCues([...track.cues, cue])
    })
    set({ selectedCueId: cue.id })
  },

  deleteCue: (id) => {
    get().update((p) => {
      const track = activeTrack(p)
      track.cues = track.cues.filter((c) => c.id !== id)
    })
    if (get().selectedCueId === id) set({ selectedCueId: null })
  },

  splitSelectedAt: (ms) => {
    const { project, selectedCueId } = get()
    if (!project) return false
    const cues = activeTrack(project).cues
    const target = cues.find((c) => c.id === selectedCueId && ms > c.startMs && ms < c.endMs) ?? cues.find((c) => ms > c.startMs && ms < c.endMs)
    if (!target) return false
    const parts = splitCue(target, ms)
    if (!parts) return false
    get().update((p) => {
      const track = activeTrack(p)
      track.cues = sortCues(track.cues.flatMap((c) => (c.id === target.id ? parts : [c])))
    })
    set({ selectedCueId: parts[1].id })
    return true
  },

  mergeSelectedWithNext: () => {
    const { project, selectedCueId } = get()
    if (!project || !selectedCueId) return false
    const cues = activeTrack(project).cues
    const index = cues.findIndex((c) => c.id === selectedCueId)
    if (index < 0 || index === cues.length - 1) return false
    const merged = mergeCues(cues[index], cues[index + 1])
    get().update((p) => {
      const track = activeTrack(p)
      track.cues = [...cues.slice(0, index), merged, ...cues.slice(index + 2)]
    })
    return true
  },
}))

export function primaryVideo(state: { project: Project | null; media: MediaAsset[] }): MediaAsset | undefined {
  const id = state.project?.primaryVideoId
  return id ? state.media.find((m) => m.id === id) : undefined
}

/** Timeline length: the longest of the video, the last cue (+2 s) or 30 s. */
export function projectDurationMs(state: { project: Project | null; media: MediaAsset[] }): number {
  const video = primaryVideo(state)
  const cues = state.project ? activeTrack(state.project).cues : []
  const lastCue = cues.length ? cues[cues.length - 1].endMs + 2000 : 0
  return Math.max(video?.durationMs ?? 0, lastCue, 30_000)
}
