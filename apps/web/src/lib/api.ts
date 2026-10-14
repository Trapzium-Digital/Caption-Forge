import type { CaptionStyleConfig, Project } from '@captionforge/project-format'

/** All requests go to /api on the same origin; the dev proxy (or app shell) adds the local token. */

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  primaryVideoId: string | null
  cueCount: number
}

export interface MediaAsset {
  id: string
  projectId: string | null
  kind: 'video' | 'audio' | 'image'
  name: string
  sizeBytes: number
  durationMs: number | null
  width: number | null
  height: number | null
  fps: number | null
  hasVideo: boolean
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
}

export type JobStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'

export interface Job {
  id: string
  kind: string
  status: JobStatus
  stage: string | null
  progress: number
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  projectId: string | null
  createdAt: string
}

export interface RuntimeComponent {
  name: string
  ok: boolean
  version: string | null
  required: boolean
  fix: string | null
  milestone: string | null
}

export interface RuntimeStatus {
  apiVersion: string
  platform: string
  ready: boolean
  workspace: string
  databaseSchema: number
  components: RuntimeComponent[]
}

export interface CaptionTemplate {
  id: string
  name: string
  styleId: string
  parentId: string | null
  config: CaptionStyleConfig
  createdAt: string
  updatedAt: string
}

export interface AiModel {
  name: string
  label: string
  sizeMb: number
  note: string
  installed: boolean
}

export interface AiStatus {
  available: boolean
  versions: Record<string, string> | null
  device: string | null
  models: AiModel[]
  hfTokenSet: boolean
}

export interface TranscriptionOptions {
  mediaId: string
  model: string
  language: string | null
  diarize: boolean
  minSpeakers?: number | null
  maxSpeakers?: number | null
}

export interface TranscriptWord {
  text: string
  startMs?: number
  endMs?: number
  score?: number
  speaker?: string
}

export interface Transcript {
  model: string
  language: string
  aligned: boolean
  durationMs: number
  words: TranscriptWord[]
}

export interface TranslateLanguages {
  languages: { code: string; name: string }[]
  pairs: [string, string][]
  installed: [string, string][]
}

export type RenderFormat = 'mp4' | 'mov-alpha' | 'mov-png' | 'webm-alpha'
export type RenderQuality = 'standard' | 'high'

export interface Waveform {
  peaksPerSecond: number
  peaks: number[]
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError('Cannot reach the CaptionForge local API. Is it running?', 0)
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* not JSON */
    }
    if (res.status === 502 || res.status === 504) detail = 'Cannot reach the CaptionForge local API. Is it running?'
    throw new ApiError(detail, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<{ status: string; version: string }>('/health'),
  runtime: () => request<RuntimeStatus>('/runtime'),

  listProjects: () => request<ProjectSummary[]>('/projects'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (document: Project, reason = 'created') => request<Project>('/projects', json('POST', { document, reason })),
  saveProject: (document: Project, reason: 'autosave' | 'manual' = 'autosave') =>
    request<{ id: string; updatedAt: string }>(`/projects/${document.id}`, json('PUT', { document, reason })),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  duplicateProject: (id: string, name?: string) => request<ProjectSummary>(`/projects/${id}/duplicate`, json('POST', { name })),
  translateLanguages: () => request<TranslateLanguages>('/ai/translate/languages'),
  startTranslation: (body: { projectId: string; sourceLanguage: string; targetLanguage: string; texts: string[] }) =>
    request<Job>('/ai/translations', json('POST', body)),

  listMedia: (projectId: string) => request<MediaAsset[]>(`/media?projectId=${encodeURIComponent(projectId)}`),
  deleteMedia: (id: string) => request<void>(`/media/${id}`, { method: 'DELETE' }),
  waveform: (id: string) => request<Waveform>(`/media/${id}/waveform`),
  mediaFileUrl: (id: string) => `/api/media/${id}/file`,
  thumbnailUrl: (id: string) => `/api/media/${id}/thumbnail`,

  listJobs: (projectId: string) => request<Job[]>(`/jobs?projectId=${encodeURIComponent(projectId)}`),
  cancelJob: (id: string) => request<Job>(`/jobs/${id}`, { method: 'DELETE' }),
  getJob: (id: string) => request<Job>(`/jobs/${id}`),
  startRender: (projectId: string, format: RenderFormat, quality: RenderQuality = 'standard') =>
    request<Job>('/renders', json('POST', { projectId, payload: { format, quality } })),
  renderFileUrl: (jobId: string) => `/api/renders/${jobId}/file`,

  listTemplates: () => request<CaptionTemplate[]>('/templates'),
  createTemplate: (body: { name: string; styleId: string; config: CaptionStyleConfig; parentId?: string | null }) =>
    request<CaptionTemplate>('/templates', json('POST', body)),
  updateTemplate: (id: string, body: { name?: string; config?: CaptionStyleConfig }) =>
    request<CaptionTemplate>(`/templates/${id}`, json('PUT', body)),
  duplicateTemplate: (id: string, variant: boolean, name?: string) =>
    request<CaptionTemplate>(`/templates/${id}/duplicate`, json('POST', { variant, name })),
  deleteTemplate: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),

  aiStatus: () => request<AiStatus>('/ai'),
  installAi: () => request<Job>('/ai/install', { method: 'POST' }),
  saveAiSettings: (hfToken: string | null) => request<{ hfTokenSet: boolean }>('/ai/settings', json('PUT', { hfToken })),
  startTranscription: (projectId: string, options: TranscriptionOptions) =>
    request<Job>('/transcriptions', json('POST', { projectId, payload: options })),

  /** Streams the file body to the API; XHR is used for upload progress. */
  importMedia(file: File, projectId: string, onProgress?: (fraction: number) => void): Promise<MediaAsset> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const params = new URLSearchParams({ filename: file.name, projectId })
      xhr.open('POST', `/api/media/import?${params}`)
      xhr.setRequestHeader('content-type', 'application/octet-stream')
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        let body: { detail?: string } & MediaAsset
        try {
          body = JSON.parse(xhr.responseText)
        } catch {
          return reject(new ApiError(xhr.statusText || 'Import failed', xhr.status))
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body)
        else reject(new ApiError(body.detail ?? 'Import failed', xhr.status))
      }
      xhr.onerror = () => reject(new ApiError('Cannot reach the CaptionForge local API. Is it running?', 0))
      xhr.send(file)
    })
  },
}
