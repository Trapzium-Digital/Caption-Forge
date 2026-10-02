import { SAFE_AREA_PRESETS, safeAreaFromPreset, type Cue, type SafeAreaPreset } from '@captionforge/project-format'
import { formatTimecode, parseTimecode, snapToFrame } from '@captionforge/captions'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { activeTrack, useEditor } from '@/store/editor'
import { Field, Section, SelectField, SliderField } from './fields'
import { MotionTab } from './MotionTab'
import { StyleInspector } from './StyleInspector'
import { WordEmphasis } from './WordEmphasis'

export const ASPECT_PRESETS = [
  { label: 'Vertical 9:16', width: 1080, height: 1920 },
  { label: 'Landscape 16:9', width: 1920, height: 1080 },
  { label: 'Square 1:1', width: 1080, height: 1080 },
  { label: 'Portrait 4:5', width: 1080, height: 1350 },
  { label: '4K 16:9', width: 3840, height: 2160 },
]

const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]
const pct = (v: number) => `${Math.round(v * 100)}%`

function TimeInput({ label, value, fps, onCommit }: { label: string; value: number; fps: number; onCommit: (ms: number) => void }) {
  return (
    <Field label={label}>
      <Input
        key={value}
        aria-label={label}
        defaultValue={formatTimecode(value, '.')}
        className="h-7 font-mono text-xs"
        onBlur={(e) => {
          try {
            onCommit(snapToFrame(parseTimecode(e.target.value), fps))
          } catch {
            e.target.value = formatTimecode(value, '.')
          }
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </Field>
  )
}

function CueTab() {
  const project = useEditor((s) => s.project)!
  const selectedCueId = useEditor((s) => s.selectedCueId)
  const { updateCue } = useEditor.getState()
  const cue: Cue | undefined = activeTrack(project).cues.find((c) => c.id === selectedCueId)
  const hasSpeech = useEditor((s) => s.waveform !== null)
  const fps = project.composition.fps

  if (!cue) {
    return <p className="px-4 py-8 text-center text-xs text-muted-foreground">Select a caption in the timeline or list to edit its timing.</p>
  }
  return (
    <Section title="Selected caption">
      <TimeInput label="Start" value={cue.startMs} fps={fps} onCommit={(t) => t < cue.endMs && updateCue(cue.id, { startMs: t, words: undefined })} />
      <TimeInput label="End" value={cue.endMs} fps={fps} onCommit={(t) => t > cue.startMs && updateCue(cue.id, { endMs: t, words: undefined })} />
      <Field label="Duration">
        <span className="font-mono text-xs text-muted-foreground">{((cue.endMs - cue.startMs) / 1000).toFixed(2)} s</span>
      </Field>
      <Field label="Speaker">
        <Input
          value={cue.speaker ?? ''}
          placeholder="Optional"
          aria-label="Speaker"
          className="h-7 text-xs"
          onChange={(e) => updateCue(cue.id, { speaker: e.target.value || undefined }, `speaker:${cue.id}`)}
        />
      </Field>
      <WordEmphasis cue={cue} />
      <p className="text-[11px] text-muted-foreground">
        {cue.words?.length
          ? `${cue.words.length} words with exact timings.`
          : hasSpeech
            ? 'Word timing follows the speech in the audio (pauses and phrasing). WhisperX (v34) will make it exact.'
            : 'Word timing is estimated from word length until the audio waveform is ready.'}
      </p>
    </Section>
  )
}

function ProjectTab() {
  const project = useEditor((s) => s.project)!
  const { update } = useEditor.getState()
  const { width, height, fps } = project.composition
  const preset = ASPECT_PRESETS.find((p) => p.width === width && p.height === height)
  const safe = project.safeArea

  const setInset = (key: 'top' | 'bottom' | 'left' | 'right', value: number) =>
    update((p) => {
      p.safeArea = { ...p.safeArea, preset: 'custom', [key]: value }
    }, `safe:${key}`)

  return (
    <>
      <Section title="Composition">
        <Field label="Name">
          <Input value={project.name} aria-label="Project name" className="h-7 text-xs" onChange={(e) => update((p) => void (p.name = e.target.value || 'Untitled'), 'name')} />
        </Field>
        <Field label="Format">
          <Select
            value={preset ? `${width}x${height}` : 'custom'}
            onValueChange={(v) => {
              const [w, h] = v.split('x').map(Number)
              if (w && h) update((p) => void (p.composition = { ...p.composition, width: w, height: h }))
            }}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_PRESETS.map((p) => (
                <SelectItem key={p.label} value={`${p.width}x${p.height}`}>
                  {p.label} · {p.width}×{p.height}
                </SelectItem>
              ))}
              {!preset && <SelectItem value="custom">Custom · {width}×{height}</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
        <SelectField
          label="Frame rate"
          value={String(fps)}
          options={[...new Set([...FPS_OPTIONS, fps])].sort((a, b) => a - b).map((f) => ({ value: String(f), label: `${f} fps` }))}
          onChange={(v) => update((p) => void (p.composition.fps = Number(v)))}
        />
      </Section>
      <Section title="Safe area">
        <SelectField<SafeAreaPreset>
          label="Platform"
          value={safe.preset}
          options={[
            ...(Object.keys(SAFE_AREA_PRESETS) as Exclude<SafeAreaPreset, 'custom'>[]).map((k) => ({ value: k, label: SAFE_AREA_PRESETS[k].label })),
            { value: 'custom', label: 'Custom' },
          ]}
          onChange={(v) => v !== 'custom' && update((p) => void (p.safeArea = safeAreaFromPreset(v)))}
        />
        <SliderField label="Top" min={0} max={0.4} step={0.005} value={safe.top} format={pct} onChange={(v) => setInset('top', v)} />
        <SliderField label="Bottom" min={0} max={0.4} step={0.005} value={safe.bottom} format={pct} onChange={(v) => setInset('bottom', v)} />
        <SliderField label="Left" min={0} max={0.4} step={0.005} value={safe.left} format={pct} onChange={(v) => setInset('left', v)} />
        <SliderField label="Right" min={0} max={0.4} step={0.005} value={safe.right} format={pct} onChange={(v) => setInset('right', v)} />
        <p className="text-[11px] text-muted-foreground">Regions covered by platform buttons and captions. The dashed guide in the preview is not exported.</p>
      </Section>
    </>
  )
}

export function Inspector() {
  return (
    <Tabs defaultValue="style" className="flex h-full flex-col gap-0">
      <div className="border-b border-border px-3 py-2">
        <TabsList className="w-full">
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="motion">Motion</TabsTrigger>
          <TabsTrigger value="caption">Caption</TabsTrigger>
          <TabsTrigger value="project">Project</TabsTrigger>
        </TabsList>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <TabsContent value="style"><StyleInspector /></TabsContent>
        <TabsContent value="motion"><MotionTab /></TabsContent>
        <TabsContent value="caption"><CueTab /></TabsContent>
        <TabsContent value="project"><ProjectTab /></TabsContent>
      </ScrollArea>
    </Tabs>
  )
}
