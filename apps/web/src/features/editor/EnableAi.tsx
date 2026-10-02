import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, Loader2, Sparkles, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, type Job } from '@/lib/api'

const STAGES: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  'installing-python': 'Installing a private Python',
  'creating-environment': 'Creating the AI environment',
  'installing-packages': 'Downloading AI components (about 1.1 GB)',
  complete: 'AI captions are ready',
  failed: 'Install failed',
  cancelled: 'Cancelled',
}

/**
 * "Enable AI captions": installs the optional AI runtime from inside the app,
 * like CapCut / DaVinci Resolve download their AI features on demand.
 */
export function EnableAi({ onReady }: { onReady: () => void }) {
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  function poll(id: string) {
    clearTimeout(timer.current)
    api
      .getJob(id)
      .then((j) => {
        setJob(j)
        if (j.status === 'queued' || j.status === 'running') timer.current = setTimeout(() => poll(id), 1000)
        else if (j.status === 'complete') onReady()
      })
      .catch(() => (timer.current = setTimeout(() => poll(id), 2000)))
  }

  async function start() {
    setError(null)
    try {
      const created = await api.installAi()
      setJob(created)
      poll(created.id)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const running = job && (job.status === 'queued' || job.status === 'running')
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Enable AI captions</p>
          <p className="text-muted-foreground">
            Adds automatic transcription with exact word timing (WhisperX) and offline translation. One-time download of about 1.1 GB, installed only for
            CaptionForge. Speech models (from 465 MB) download the first time you use them. Everything then runs offline on this computer.
          </p>
        </div>
      </div>
      {job && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex items-center gap-2 text-xs">
            {running && <Loader2 className="size-3.5 animate-spin" />}
            {job.status === 'complete' && <CheckCircle2 className="size-3.5 text-emerald-400" />}
            {(job.status === 'failed' || job.status === 'cancelled') && <XCircle className="size-3.5 text-destructive" />}
            <span>{STAGES[job.stage ?? job.status] ?? job.stage}</span>
            <span className="ml-auto font-mono text-muted-foreground">{Math.round(job.progress * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-label="AI install progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${job.progress * 100}%` }} />
          </div>
          {job.status === 'failed' && <p className="text-xs text-destructive">{job.error} - check your internet connection and try again; downloads resume.</p>}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        {running ? (
          <Button size="sm" variant="outline" onClick={() => job && api.cancelJob(job.id).then(() => poll(job.id))}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" onClick={start}>
            <Download /> {job?.status === 'failed' ? 'Try again' : 'Enable AI captions'}
          </Button>
        )}
      </div>
    </div>
  )
}
