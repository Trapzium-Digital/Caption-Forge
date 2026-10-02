import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Cpu, Download, KeyRound, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { FORMATTING_PRESETS, wordsToCues, type CaptionFormatting, type FormattingPreset } from '@captionforge/captions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { api, type AiStatus, type Job, type MediaAsset, type Transcript } from '@/lib/api'
import { activeTrack, useEditor } from '@/store/editor'

const LANGUAGES: [string, string][] = [
  ['auto', 'Detect automatically'],
  ['en', 'English'],
  ['fr', 'French'],
  ['es', 'Spanish'],
  ['pt', 'Portuguese'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['nl', 'Dutch'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['zh', 'Chinese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['ru', 'Russian'],
  ['tr', 'Turkish'],
  ['pl', 'Polish'],
  ['uk', 'Ukrainian'],
  ['sw', 'Swahili'],
  ['yo', 'Yoruba'],
  ['ha', 'Hausa'],
]

const STAGES: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Starting',
  'loading-model': 'Loading model (first use downloads it)',
  'loading-audio': 'Reading audio',
  transcribing: 'Transcribing speech',
  aligning: 'Aligning every word',
  diarizing: 'Detecting speakers',
  complete: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

type Preset = FormattingPreset | 'custom'

/** WhisperX speaker ids (SPEAKER_00) -> friendly names (Speaker 1). */
function speakerName(id: string | undefined): string | undefined {
  const m = id?.match(/(\d+)$/)
  return m ? `Speaker ${Number(m[1]) + 1}` : id
}

export function AiCaptionsDialog({
  open,
  onOpenChange,
  video,
  onJobsChanged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  video: MediaAsset
  onJobsChanged: () => void
}) {
  const project = useEditor((s) => s.project)!
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [model, setModel] = useState('small')
  const [language, setLanguage] = useState('auto')
  const [diarize, setDiarize] = useState(false)
  const [token, setToken] = useState('')
  const [preset, setPreset] = useState<Preset>('social')
  const [custom, setCustom] = useState<CaptionFormatting>({ ...FORMATTING_PRESETS.social })
  const [job, setJob] = useState<Job | null>(null)
  const [previous, setPrevious] = useState<Job | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const existing = activeTrack(project).cues.length
  const formatting = preset === 'custom' ? custom : FORMATTING_PRESETS[preset]

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.aiStatus())
      setStatusError(null)
    } catch (err) {
      setStatusError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadStatus()
    api
      .listJobs(project.id)
      .then((jobs) =>
        setPrevious(jobs.find((j) => j.kind === 'transcription' && j.status === 'complete' && j.payload.mediaId === video.id && j.result) ?? null),
      )
      .catch(() => undefined)
  }, [open, project.id, video.id, loadStatus])

  useEffect(() => () => clearTimeout(timer.current), [])

  function apply(transcript: Transcript, label: string) {
    const cues = wordsToCues(
      transcript.words.map((w) => ({ ...w, speaker: speakerName(w.speaker) })),
      formatting,
    )
    if (cues.length === 0) {
      toast.error('No speech was found in this video')
      return
    }
    useEditor.getState().update((p) => {
      const track = activeTrack(p)
      track.cues = cues
      track.language = transcript.language
    })
    useEditor.getState().selectCue(null)
    toast.success(`${label}: ${cues.length} captions with exact word timing (${transcript.language.toUpperCase()})`)
    onOpenChange(false)
  }

  function poll(id: string) {
    clearTimeout(timer.current)
    api
      .getJob(id)
      .then((j) => {
        setJob(j)
        if (j.status === 'queued' || j.status === 'running') timer.current = setTimeout(() => poll(id), 600)
        else {
          onJobsChanged()
          void loadStatus() // model is now installed
          if (j.status === 'complete' && j.result) {
            setPrevious(j)
            apply(j.result as unknown as Transcript, 'Generated')
          }
        }
      })
      .catch(() => (timer.current = setTimeout(() => poll(id), 1500)))
  }

  async function start() {
    try {
      if (diarize && token.trim()) {
        await api.saveAiSettings(token.trim())
        setToken('')
      }
      const created = await api.startTranscription(project.id, {
        mediaId: video.id,
        model,
        language: language === 'auto' ? null : language,
        diarize,
      })
      setJob(created)
      onJobsChanged()
      poll(created.id)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const running = job && (job.status === 'queued' || job.status === 'running')
  const selected = status?.models.find((m) => m.name === model)
  const needsToken = diarize && !status?.hfTokenSet && !token.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI captions
          </DialogTitle>
          <DialogDescription>
            Transcribes “{video.name}” on this computer with WhisperX - every word gets an exact timestamp. Nothing is uploaded.
          </DialogDescription>
        </DialogHeader>

        {statusError && <p className="text-sm text-destructive">{statusError}</p>}

        {status && !status.available && (
          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">The local AI runtime is not installed yet.</p>
            <p className="text-muted-foreground">
              In the CaptionForge folder run <code className="rounded bg-muted px-1">npm run setup:ai</code> (one-time, about 1-2 GB), then check again.
            </p>
            <Button size="sm" variant="outline" onClick={loadStatus}>
              <RefreshCw /> Check again
            </Button>
          </div>
        )}

        {status?.available && (
          <div className="space-y-5">
            <section className="space-y-2">
              <Label>Model</Label>
              <div role="radiogroup" aria-label="Model" className="grid grid-cols-2 gap-2">
                {status.models.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    role="radio"
                    aria-checked={model === m.name}
                    disabled={Boolean(running)}
                    onClick={() => setModel(m.name)}
                    className={`rounded-lg border p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      model === m.name ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {m.label}
                      {m.installed ? (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          Installed
                        </Badge>
                      ) : (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          <Download className="mr-0.5 inline size-3" />
                          {m.sizeMb >= 1000 ? `${(m.sizeMb / 1000).toFixed(1)} GB` : `${m.sizeMb} MB`}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{m.note}</div>
                  </button>
                ))}
              </div>
              {selected && !selected.installed && <p className="text-[11px] text-muted-foreground">Downloads once on first use, then works offline.</p>}
            </section>

            <div className="grid grid-cols-2 gap-3">
              <section className="space-y-1.5">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage} disabled={Boolean(running)}>
                  <SelectTrigger size="sm" className="w-full" aria-label="Language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(([code, name]) => (
                      <SelectItem key={code} value={code}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>
              <section className="space-y-1.5">
                <Label>Device</Label>
                <div className="flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs text-muted-foreground">
                  <Cpu className="size-3.5" /> {status.device ?? 'CPU'}
                </div>
              </section>
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="diarize">Speaker detection</Label>
                <Switch id="diarize" checked={diarize} onCheckedChange={setDiarize} disabled={Boolean(running)} />
              </div>
              <p className="text-[11px] text-muted-foreground">Labels who is speaking (for Podcast and News styles). Slower.</p>
              {diarize && !status.hfTokenSet && (
                <div className="space-y-1.5 rounded-lg border border-border p-2.5">
                  <Label htmlFor="hf-token" className="flex items-center gap-1.5 text-xs">
                    <KeyRound className="size-3.5" /> Hugging Face token (one-time model download)
                  </Label>
                  <Input id="hf-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="hf_…" className="h-8 text-xs" />
                  <p className="text-[11px] text-muted-foreground">
                    Create a free token at huggingface.co/settings/tokens and accept the terms of pyannote/speaker-diarization-community-1. Stored only on this
                    computer.
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <Label>Formatting</Label>
              <div role="radiogroup" aria-label="Formatting" className="grid grid-cols-4 gap-1.5">
                {(['social', 'podcast', 'cinematic', 'custom'] as Preset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={preset === p}
                    onClick={() => setPreset(p)}
                    className={`rounded-md border px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      preset === p ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    {p === 'custom' ? 'Custom' : FORMATTING_PRESETS[p].label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {preset === 'custom' ? 'Set your own limits per caption.' : FORMATTING_PRESETS[preset].description}
              </p>
              {preset === 'custom' && (
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ['maxWords', 'Max words', 1, 30, 1],
                      ['maxChars', 'Max characters', 10, 120, 1],
                      ['maxDurationMs', 'Max seconds', 1, 10, 1000],
                      ['pauseMs', 'Split at pause (s)', 0.2, 2, 1000],
                    ] as const
                  ).map(([key, label, min, max, scale]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`fmt-${key}`} className="text-[11px] font-normal text-muted-foreground">
                        {label}
                      </Label>
                      <Input
                        id={`fmt-${key}`}
                        type="number"
                        min={min}
                        max={max}
                        step={scale === 1 ? 1 : 0.1}
                        value={custom[key] / scale}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          if (Number.isFinite(v)) setCustom((c) => ({ ...c, [key]: Math.round(Math.min(max, Math.max(min, v)) * scale) }))
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {existing > 0 && !running && (
              <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                This replaces your {existing} current caption{existing === 1 ? '' : 's'}. You can undo it (⌘Z).
              </p>
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
                <div className="h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-label="Transcription progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.progress * 100)}>
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${job.progress * 100}%` }} />
                </div>
                {job.status === 'failed' && <p className="text-xs text-destructive">{job.error}</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {previous && !running && status?.available && (
              <Button variant="ghost" size="sm" onClick={() => apply(previous.result as unknown as Transcript, 'Re-formatted')}>
                <RefreshCw /> Re-format last transcription
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {running ? (
              <Button variant="outline" onClick={() => job && api.cancelJob(job.id).then(() => poll(job.id))}>
                Cancel
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
            <Button onClick={start} disabled={!status?.available || Boolean(running) || needsToken}>
              <Sparkles /> Generate captions
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
