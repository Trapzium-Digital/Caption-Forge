import { ChevronLeft, ChevronRight, Diamond, Trash2 } from 'lucide-react'
import { createId, type Easing, type KeyframeProperty } from '@captionforge/project-format'
import { snapToFrame } from '@captionforge/captions'
import { KEYFRAME_PROPERTIES, evaluateLayer, keyframesFor } from '@captionforge/caption-styles'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useEditor } from '@/store/editor'
import { playback } from '@/store/playback'
import { Section } from './fields'

const PROPERTIES = Object.keys(KEYFRAME_PROPERTIES) as KeyframeProperty[]

function formatValue(property: KeyframeProperty, value: number): string {
  const info = KEYFRAME_PROPERTIES[property]
  if (info.unit === '%') return `${Math.round(value * 100)}%`
  if (info.unit === '×') return `${value.toFixed(2)}×`
  return `${Math.round(value * 10) / 10}${info.unit}`
}

/**
 * Keyframes on the caption layer. They transform the whole caption and never
 * touch the style, so the active-word pop keeps working underneath them.
 */
export function MotionTab() {
  const project = useEditor((s) => s.project)!
  const timeMs = useEditor((s) => s.currentTimeMs)
  const { update } = useEditor.getState()
  const fps = project.composition.fps
  const keyframes = project.captionLayer.keyframes
  const now = snapToFrame(timeMs, fps)
  const values = evaluateLayer(keyframes, now, project.captionStyle.config)
  const tolerance = 1000 / fps / 2

  /** Changing a value adds a keyframe at the playhead, or updates the one already there. */
  function setValue(property: KeyframeProperty, value: number) {
    update((p) => {
      const list = p.captionLayer.keyframes
      const existing = list.find((k) => k.property === property && Math.abs(k.timeMs - now) <= tolerance)
      if (existing) existing.value = value
      else list.push({ id: createId('kf'), property, timeMs: now, value, easing: 'ease-in-out' })
    }, `kf:${property}:${now}`)
  }

  function toggleKey(property: KeyframeProperty) {
    const existing = keyframes.find((k) => k.property === property && Math.abs(k.timeMs - now) <= tolerance)
    update((p) => {
      if (existing) p.captionLayer.keyframes = p.captionLayer.keyframes.filter((k) => k.id !== existing.id)
      else p.captionLayer.keyframes.push({ id: createId('kf'), property, timeMs: now, value: values[property], easing: 'ease-in-out' })
    })
  }

  return (
    <>
      <Section title="Caption layer keyframes">
        <p className="text-[11px] text-muted-foreground">
          Move the playhead, then change a value to set a keyframe. Keyframes animate the whole caption; the active-word effect still plays inside it.
        </p>
      </Section>
      {PROPERTIES.map((property) => {
        const info = KEYFRAME_PROPERTIES[property]
        const list = keyframesFor(keyframes, property)
        const here = list.find((k) => Math.abs(k.timeMs - now) <= tolerance)
        const prev = [...list].reverse().find((k) => k.timeMs < now - tolerance)
        const next = list.find((k) => k.timeMs > now + tolerance)
        return (
          <div key={property} className="space-y-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium">{info.label}</span>
              {list.length > 0 && <span className="text-[10px] text-muted-foreground">{list.length} key{list.length > 1 ? 's' : ''}</span>}
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{formatValue(property, values[property])}</span>
              <Button size="icon-xs" variant="ghost" disabled={!prev} aria-label={`Previous ${info.label} keyframe`} onClick={() => prev && playback.seek(prev.timeMs)}>
                <ChevronLeft />
              </Button>
              <Button
                size="icon-xs"
                variant={here ? 'secondary' : 'ghost'}
                aria-label={here ? `Remove ${info.label} keyframe at playhead` : `Add ${info.label} keyframe at playhead`}
                aria-pressed={Boolean(here)}
                onClick={() => toggleKey(property)}
              >
                <Diamond className={here ? 'fill-primary text-primary' : ''} />
              </Button>
              <Button size="icon-xs" variant="ghost" disabled={!next} aria-label={`Next ${info.label} keyframe`} onClick={() => next && playback.seek(next.timeMs)}>
                <ChevronRight />
              </Button>
            </div>
            <Slider
              aria-label={info.label}
              min={info.min}
              max={info.max}
              step={info.step}
              value={[values[property]]}
              onValueChange={([v]) => setValue(property, v)}
            />
            {(here || list.length > 0) && (
              <div className="flex items-center gap-2">
                {here && (
                  <Select value={here.easing} onValueChange={(v) => update((p) => void (p.captionLayer.keyframes.find((k) => k.id === here.id)!.easing = v as Easing))}>
                    <SelectTrigger size="sm" className="h-6 flex-1 text-xs" aria-label={`${info.label} easing to next keyframe`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ease-in-out">Ease in-out</SelectItem>
                      <SelectItem value="ease-out">Ease out</SelectItem>
                      <SelectItem value="linear">Linear</SelectItem>
                      <SelectItem value="hold">Hold</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {list.length > 0 && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => update((p) => void (p.captionLayer.keyframes = p.captionLayer.keyframes.filter((k) => k.property !== property)))}
                  >
                    <Trash2 /> Clear
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
