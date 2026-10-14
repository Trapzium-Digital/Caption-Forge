import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, Film, Layers, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, type Job, type RenderFormat, type RenderQuality } from '@/lib/api'
import { formatBytes } from '@/lib/download'
import { useEditor } from '@/store/editor'

const STAGES: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing renderer',
  bundling: 'Bundling composition',
  rendering: 'Rendering frames',
  encoding: 'Encoding',
  verifying: 'Verifying with FFprobe',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const FORMATS: { value: RenderFormat; title: string; detail: string; icon: typeof Film }[] = [
  { value: 'mp4', title: 'MP4 video', detail: 'Video + captions + audio (H.264)', icon: Film },
  {
    value: 'mov-alpha',
    title: 'Transparent ProRes 4444 (.mov)',
    detail: 'Captions only, with alpha. For Premiere Pro, Final Cut, DaVinci Resolve and After Effects. Large files.',
    icon: Layers,
  },
  {
    value: 'mov-png',
    title: 'Transparent QuickTime PNG (.mov) - smaller',
    detail: 'Captions only, with alpha, lossless. About 3x smaller than ProRes; plays back slightly less smoothly in Premiere.',
    icon: Layers,
  },
  { value: 'webm-alpha', title: 'Transparent WebM', detail: 'Captions only, with alpha (VP9). Small files for web tools and CapCut - not Premiere.', icon: Layers },
]

const QUALITIES: { value: RenderQuality; title: string; detail: string }[] = [
  { value: 'high', title: 'High quality', detail: 'Keeps the detail and colour of your original. Bigger file, slower render.' },
  { value: 'standard', title: 'Standard', detail: 'Smaller file, faster render. Slightly softer than the original.' },
]

const QUALITY_KEY = 'captionforge.renderQuality'

function savedQuality(): RenderQuality {
  try {
    return localStorage.getItem(QUALITY_KEY) === 'standard' ? 'standard' : 'high'
  } catch {
    return 'high'
  }
}

const FORMAT_LABEL: Record<string, string> = { mp4: 'MP4', 'mov-alpha': 'ProRes 4444 (alpha)', 'mov-png': 'QuickTime PNG (alpha)', 'webm-alpha': 'WebM (alpha)' }

export function RenderDialog({ open, onOpenChange, save }: { open: boolean; onOpenChange: (o: boolean) => void; save: (reason: 'manual') => Promise<void> }) {
  const project = useEditor((s) => s.project)!
  const [format, setFormat] = useState<RenderFormat>('mp4')
  const [quality, setQuality] = useState<RenderQuality>(savedQuality)
  const [job, setJob] = useState<Job | null>(null)
  const [history, setHistory] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!open) return
    api
      .listJobs(project.id)
      .then((jobs) => setHistory(jobs.filter((j) => j.kind === 'render')))
      .catch(() => undefined)
  }, [open, project.id, job?.status])

  useEffect(() => () => clearTimeout(timer.current), [])

  function poll(id: string) {
    clearTimeout(timer.current)
    api
      .getJob(id)
      .then((j) => {
        setJob(j)
        if (j.status === 'queued' || j.status === 'running') timer.current = setTimeout(() => poll(id), 500)
      })
      .catch(() => (timer.current = setTimeout(() => poll(id), 1500)))
  }

  async function start() {
    setError(null)
    try {
      await save('manual') // the renderer reads the saved project
      const created = await api.startRender(project.id, format, format === 'mp4' ? quality : 'standard')
      setJob(created)
      poll(created.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const running = job && (job.status === 'queued' || job.status === 'running')
  const result = job?.result as { sizeBytes?: number; durationMs?: number; width?: number; height?: number } | null | undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Render video</DialogTitle>
          <DialogDescription>
            Rendered on this computer with Remotion, using the same caption engine as the preview. {project.composition.width}×{project.composition.height} ·{' '}
            {project.composition.fps} fps
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Render format" className="grid gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={format === f.value}
              disabled={Boolean(running)}
              onClick={() => setFormat(f.value)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                format === f.value ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/30'
              }`}
            >
              <f.icon className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.detail}</div>
              </div>
            </button>
          ))}
        </div>

        {format === 'mp4' && (
          <div role="radiogroup" aria-label="MP4 quality" className="grid grid-cols-2 gap-2">
            {QUALITIES.map((q) => (
              <button
                key={q.value}
                type="button"
                role="radio"
                aria-checked={quality === q.value}
                disabled={Boolean(running)}
                onClick={() => {
                  setQuality(q.value)
                  try {
                    localStorage.setItem(QUALITY_KEY, q.value)
                  } catch {
                    // remembering the choice is only a convenience
                  }
                }}
                className={`rounded-lg border p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  quality === q.value ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/30'
                }`}
              >
                <div className="text-sm font-medium">{q.title}</div>
                <div className="text-xs text-muted-foreground">{q.detail}</div>
              </button>
            ))}
          </div>
        )}

        {job && (
          <div className="space-y-2 rounded-lg border border-border p-3" aria-live="polite">
            <div className="flex items-center gap-2 text-sm">
              {running && <Loader2 className="size-4 animate-spin" />}
              {job.status === 'complete' && <CheckCircle2 className="size-4 text-emerald-400" />}
              {(job.status === 'failed' || job.status === 'cancelled') && <XCircle className="size-4 text-destructive" />}
              <span>{STAGES[job.stage ?? job.status] ?? job.stage}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{Math.round(job.progress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${job.progress * 100}%` }} />
            </div>
            {job.status === 'failed' && <p className="text-xs text-destructive">{job.error}</p>}
            {job.status === 'complete' && result && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Verified · {result.width}×{result.height} · {((result.durationMs ?? 0) / 1000).toFixed(2)} s · {formatBytes(result.sizeBytes ?? 0)}
                </span>
                <Button size="xs" className="ml-auto" asChild>
                  <a href={api.renderFileUrl(job.id)} download>
                    <Download /> Download
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        {history.filter((h) => h.status === 'complete' && h.id !== job?.id).length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Previous renders</div>
            {history
              .filter((h) => h.status === 'complete' && h.id !== job?.id)
              .slice(0, 4)
              .map((h) => (
                <div key={h.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                  <span>
                    {FORMAT_LABEL[String(h.payload.format)] ?? 'MP4'}
                    {(h.payload.format ?? 'mp4') === 'mp4' && (h.payload.quality === 'high' ? ' · High quality' : ' · Standard')}
                  </span>
                  <a className="ml-auto text-primary underline-offset-4 hover:underline" href={api.renderFileUrl(h.id)} download>
                    Download
                  </a>
                </div>
              ))}
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={() => job && api.cancelJob(job.id).then(() => poll(job.id))}>
              Cancel render
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          <Button onClick={start} disabled={Boolean(running)}>
            {job?.status === 'complete' ? 'Render again' : 'Start render'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
