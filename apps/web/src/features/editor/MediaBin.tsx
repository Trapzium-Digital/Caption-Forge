import { useRef, useState } from 'react'
import { Captions, Film, ImageIcon, Music, Star, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { formatClock, parseSubtitles } from '@captionforge/captions'
import type { MediaRef } from '@captionforge/project-format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, type MediaAsset } from '@/lib/api'
import { formatBytes } from '@/lib/download'
import { activeTrack, useEditor } from '@/store/editor'
import type { JobsByMedia } from './useJobs'

const MEDIA_ACCEPT = '.mp4,.mov,.m4v,.mkv,.webm,.avi,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.png,.jpg,.jpeg,.webp,.gif'

function toMediaRef(a: MediaAsset): MediaRef {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    durationMs: a.durationMs ?? undefined,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
    fps: a.fps ?? undefined,
    hasAudio: a.hasAudio,
  }
}

function KindIcon({ kind }: { kind: MediaAsset['kind'] }) {
  if (kind === 'audio') return <Music className="size-5 text-sky-400" />
  if (kind === 'image') return <ImageIcon className="size-5 text-emerald-400" />
  return <Film className="size-5 text-amber-400" />
}

export function MediaBin({ jobsByMedia, onImported }: { jobsByMedia: JobsByMedia; onImported: () => void }) {
  const project = useEditor((s) => s.project)!
  const media = useEditor((s) => s.media)
  const { update, setMedia } = useEditor.getState()
  const mediaInput = useRef<HTMLInputElement>(null)
  const subtitleInput = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<{ name: string; progress: number }[]>([])

  function setAsMain(asset: MediaAsset) {
    update((p) => {
      p.primaryVideoId = asset.id
      if (asset.width && asset.height) p.composition.width = asset.width
      if (asset.width && asset.height) p.composition.height = asset.height
      if (asset.fps) p.composition.fps = Math.round(asset.fps * 1000) / 1000
    })
  }

  async function importFiles(files: File[]) {
    for (const file of files) {
      setUploads((u) => [...u, { name: file.name, progress: 0 }])
      try {
        const asset = await api.importMedia(file, project.id, (progress) =>
          setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress } : x))),
        )
        const current = useEditor.getState()
        setMedia([...current.media, asset])
        const isFirstVideo = asset.kind === 'video' && !current.project?.primaryVideoId
        update((p) => {
          p.media.push(toMediaRef(asset))
        })
        if (isFirstVideo) setAsMain(asset)
        toast.success(`Imported ${asset.name}`)
        onImported()
      } catch (err) {
        toast.error(`${file.name}: ${(err as Error).message}`)
      } finally {
        setUploads((u) => u.filter((x) => x.name !== file.name))
      }
    }
  }

  async function importSubtitles(file: File | undefined) {
    if (!file) return
    try {
      const cues = parseSubtitles(file.name, await file.text())
      if (cues.length === 0) throw new Error('No captions found in file')
      const existing = activeTrack(project).cues.length
      update((p) => {
        activeTrack(p).cues = cues
      })
      toast.success(`Imported ${cues.length} captions${existing ? ` (replaced ${existing})` : ''}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function remove(asset: MediaAsset) {
    try {
      await api.deleteMedia(asset.id)
      setMedia(useEditor.getState().media.filter((m) => m.id !== asset.id))
      update((p) => {
        p.media = p.media.filter((m) => m.id !== asset.id)
        if (p.primaryVideoId === asset.id) p.primaryVideoId = null
      })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-2 p-3">
        <Button size="sm" onClick={() => mediaInput.current?.click()}>
          <Upload /> Import media
        </Button>
        <Button size="sm" variant="outline" onClick={() => subtitleInput.current?.click()}>
          <Captions /> SRT / VTT
        </Button>
        <input ref={mediaInput} type="file" multiple hidden accept={MEDIA_ACCEPT} onChange={(e) => (importFiles(Array.from(e.target.files ?? [])), (e.target.value = ''))} />
        <input ref={subtitleInput} type="file" hidden accept=".srt,.vtt" onChange={(e) => (importSubtitles(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 px-3 pb-3">
          {uploads.map((u) => (
            <div key={u.name} className="rounded-lg border border-dashed border-border p-2 text-xs">
              <div className="truncate">{u.name}</div>
              <div className="mt-1.5 h-1 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
              </div>
            </div>
          ))}
          {media.length === 0 && uploads.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              Import a video to get started. Files are copied into your local workspace — originals are never modified.
            </p>
          )}
          {media.map((asset) => {
            const primary = project.primaryVideoId === asset.id
            const jobs = jobsByMedia[asset.id] ?? []
            const busy = jobs.some((j) => j.status === 'queued' || j.status === 'running')
            return (
              <div
                key={asset.id}
                className={`group flex gap-2 rounded-lg border p-1.5 ${primary ? 'border-primary/60 bg-primary/5' : 'border-border'}`}
              >
                <div className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                  {jobs.some((j) => j.kind === 'thumbnail' && j.status === 'complete') ? (
                    <img src={api.thumbnailUrl(asset.id)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <KindIcon kind={asset.kind} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium" title={asset.name}>
                    {asset.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {[
                      asset.durationMs != null && formatClock(asset.durationMs),
                      asset.width && `${asset.width}×${asset.height}`,
                      asset.fps && `${asset.fps} fps`,
                      formatBytes(asset.sizeBytes),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    {primary && <Badge className="h-4 px-1.5 text-[10px]">Main video</Badge>}
                    {busy && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        Processing…
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
                  {asset.kind === 'video' && !primary && (
                    <Button size="icon-xs" variant="ghost" aria-label="Use as main video" title="Use as main video" onClick={() => setAsMain(asset)}>
                      <Star />
                    </Button>
                  )}
                  <Button size="icon-xs" variant="ghost" aria-label="Remove from project" title="Remove" onClick={() => remove(asset)}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
