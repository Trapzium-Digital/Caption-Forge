import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Languages, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createId, type CaptionTrack } from '@captionforge/project-format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, type Job, type TranslateLanguages } from '@/lib/api'
import { activeTrack, useEditor } from '@/store/editor'

const STAGES: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  downloading: 'Downloading language pack (one time)',
  retrying: 'Connection dropped - retrying',
  translating: 'Translating captions',
  complete: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/**
 * Translate the active caption track into a new track (offline, Argos Translate).
 * Timing is kept per caption; word timing for the new language follows the speech.
 */
export function TranslateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const project = useEditor((s) => s.project)!
  const source = activeTrack(project)
  const [langs, setLangs] = useState<TranslateLanguages | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(source.language && source.language !== 'und' ? source.language : 'en')
  const [to, setTo] = useState('fr')
  const [job, setJob] = useState<Job | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!open) return
    setJob(null)
    setFrom(source.language && source.language !== 'und' ? source.language : 'en')
    api
      .translateLanguages()
      .then((l) => {
        setLangs(l)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [open, source.language])

  useEffect(() => () => clearTimeout(timer.current), [])

  const name = (code: string) => langs?.languages.find((l) => l.code === code)?.name ?? code.toUpperCase()
  const has = (a: string, b: string) => langs?.pairs.some(([x, y]) => x === a && y === b) ?? false
  const installed = (a: string, b: string) => langs?.installed.some(([x, y]) => x === a && y === b) ?? false
  /** Targets reachable from `from`: direct, or through English. */
  const targets = useMemo(() => {
    if (!langs) return []
    return langs.languages.filter((l) => l.code !== from && (has(from, l.code) || (has(from, 'en') && has('en', l.code)) || (from === 'en' && has('en', l.code))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langs, from])
  const ready = installed(from, to) || (installed(from, 'en') && installed('en', to))

  function poll(id: string) {
    clearTimeout(timer.current)
    api
      .getJob(id)
      .then((j) => {
        setJob(j)
        if (j.status === 'queued' || j.status === 'running') timer.current = setTimeout(() => poll(id), 500)
        else if (j.status === 'complete' && j.result) createTrack((j.result as { translations: string[] }).translations)
      })
      .catch(() => (timer.current = setTimeout(() => poll(id), 1500)))
  }

  function createTrack(translations: string[]) {
    const existing = project.captionTracks.filter((t) => t.language === to).length
    const track: CaptionTrack = {
      id: createId('track'),
      name: existing ? `${name(to)} ${existing + 1}` : name(to),
      language: to,
      sourceTrackId: source.id,
      // Same timing per caption. Word timings are dropped: the speaker says the
      // original words, so the new words follow the speech in the audio instead.
      cues: source.cues.map((cue, i) => ({
        id: createId('cue'),
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: translations[i] || cue.text,
        ...(cue.speaker ? { speaker: cue.speaker } : {}),
      })),
    }
    useEditor.getState().addTrack(track)
    toast.success(`Created the ${track.name} track (${track.cues.length} captions). Switch tracks above the caption list.`)
    onOpenChange(false)
  }

  async function start() {
    try {
      const created = await api.startTranslation({
        projectId: project.id,
        sourceLanguage: from,
        targetLanguage: to,
        texts: source.cues.map((c) => c.text),
      })
      setJob(created)
      poll(created.id)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const running = job && (job.status === 'queued' || job.status === 'running')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="size-4 text-primary" /> Translate captions
          </DialogTitle>
          <DialogDescription>
            Creates a new caption track from “{source.name}” ({source.cues.length} captions), translated on this computer. The original stays untouched.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!langs && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading languages…
          </p>
        )}

        {langs && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Select value={from} onValueChange={setFrom} disabled={Boolean(running)}>
                <SelectTrigger size="sm" className="w-full" aria-label="Translate from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {langs.languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Select value={to} onValueChange={setTo} disabled={Boolean(running)}>
                <SelectTrigger size="sm" className="w-full" aria-label="Translate to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="col-span-2 text-[11px] text-muted-foreground">
              {ready ? 'Language pack installed - works offline.' : 'Downloads the language pack once (about 100 MB), then works offline.'} Proofread names
              and slang; any line can be edited in the caption list.
            </p>
            <p className="col-span-2 text-[11px] text-muted-foreground">
              The speaker still says the original words, so word-by-word highlighting in the translated track follows the speech rhythm rather than exact words.
            </p>
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
            <div className="h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-label="Translation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${job.progress * 100}%` }} />
            </div>
            {job.status === 'failed' && <p className="text-xs text-destructive">{job.error}</p>}
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button variant="outline" onClick={() => job && api.cancelJob(job.id).then(() => poll(job.id))}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          <Button onClick={start} disabled={!langs || Boolean(running) || !targets.some((t) => t.code === to)}>
            <Languages /> Translate to {name(to)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
