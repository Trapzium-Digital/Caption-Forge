import { useEffect, useRef } from 'react'
import { Merge, Plus, Trash2 } from 'lucide-react'
import { formatClock } from '@captionforge/captions'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { activeTrack, useEditor } from '@/store/editor'
import { playback } from '@/store/playback'
import { TrackBar } from './TrackBar'

export function CaptionList() {
  const project = useEditor((s) => s.project)!
  const selectedCueId = useEditor((s) => s.selectedCueId)
  const timeMs = useEditor((s) => s.currentTimeMs)
  const { selectCue, updateCue, deleteCue, addCueAt, mergeSelectedWithNext } = useEditor.getState()
  const cues = activeTrack(project).cues
  const itemRefs = useRef(new Map<string, HTMLDivElement>())

  const playingCueId = cues.find((c) => timeMs >= c.startMs && timeMs < c.endMs)?.id

  useEffect(() => {
    if (selectedCueId) itemRefs.current.get(selectedCueId)?.scrollIntoView({ block: 'nearest' })
  }, [selectedCueId])

  return (
    <div className="flex h-full flex-col">
      <TrackBar />
      <div className="flex items-center gap-1 px-3 py-2">
        <span className="text-xs text-muted-foreground">{cues.length} captions</span>
        <Button className="ml-auto" size="xs" variant="ghost" onClick={() => addCueAt(timeMs)}>
          <Plus /> Add
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 px-3 pb-3">
          {cues.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No captions yet. Import an SRT/VTT file, or double-click the caption row in the timeline.
            </p>
          )}
          {cues.map((cue, index) => {
            const selected = cue.id === selectedCueId
            return (
              <div
                key={cue.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(cue.id, el)
                  else itemRefs.current.delete(cue.id)
                }}
                className={`rounded-lg border p-2 transition-colors ${
                  selected ? 'border-primary/70 bg-primary/5' : 'border-border hover:border-foreground/20'
                } ${playingCueId === cue.id ? 'ring-1 ring-rose-500/50' : ''}`}
                onClick={() => {
                  selectCue(cue.id)
                  if (!selected) playback.seek(cue.startMs)
                }}
              >
                <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span className="text-foreground/60">#{index + 1}</span>
                  <span>
                    {formatClock(cue.startMs)} → {formatClock(cue.endMs)}
                  </span>
                  {selected && (
                    <div className="ml-auto flex">
                      <Button size="icon-xs" variant="ghost" aria-label="Merge with next" title="Merge with next (M)" onClick={(e) => (e.stopPropagation(), mergeSelectedWithNext())}>
                        <Merge />
                      </Button>
                      <Button size="icon-xs" variant="ghost" aria-label="Delete caption" title="Delete (⌫)" onClick={(e) => (e.stopPropagation(), deleteCue(cue.id))}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                <Textarea
                  value={cue.text}
                  rows={1}
                  className="min-h-0 resize-none border-none bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                  onFocus={() => selectCue(cue.id)}
                  onChange={(e) => {
                    // Word timings no longer match edited text; emphasis marks past the last word are dropped.
                    const count = e.target.value.split(/\s+/).filter(Boolean).length
                    const emphasis = cue.emphasis ? Object.fromEntries(Object.entries(cue.emphasis).filter(([i]) => Number(i) < count)) : undefined
                    updateCue(cue.id, { text: e.target.value, words: undefined, emphasis: emphasis && Object.keys(emphasis).length ? emphasis : undefined }, `text:${cue.id}`)
                  }}
                />
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
