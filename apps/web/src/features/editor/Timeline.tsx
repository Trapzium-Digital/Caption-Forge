import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Minus, Plus, Scissors } from 'lucide-react'
import type { Cue } from '@captionforge/project-format'
import { snapToFrame, MIN_CUE_MS } from '@captionforge/captions'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { activeTrack, primaryVideo, projectDurationMs, useEditor } from '@/store/editor'
import { playback } from '@/store/playback'
import type { JobsByMedia } from './useJobs'

/** Ruler with time labels on top and a keyframe lane underneath. */
const RULER_H = 32
const KF_Y = 23
const CUE_ROW_H = 52
const EDGE_PX = 6
const SNAP_PX = 8

const COLORS = {
  bg: '#0c0c0e',
  ruler: '#131316',
  rulerText: '#8b8b94',
  tick: '#2a2a31',
  cue: '#27272f',
  cueBorder: '#3f3f4a',
  cueSelected: '#3b3218',
  cueSelectedBorder: '#facc15',
  cueText: '#e4e4e7',
  wave: '#3f6e8c',
  waveBg: '#0f1418',
  playhead: '#f43f5e',
  keyframe: '#facc15',
}

type Drag =
  | { type: 'scrub' }
  | { type: 'move' | 'start' | 'end'; cue: Cue; originX: number; key: string; moved: boolean }

function niceStep(pxPerSecond: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  return steps.find((s) => s * pxPerSecond >= 70) ?? 600
}

function formatRuler(seconds: number, step: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const sec = step < 1 ? s.toFixed(step < 0.5 ? 2 : 1) : String(Math.round(s))
  return `${m}:${sec.padStart(step < 1 ? (step < 0.5 ? 5 : 4) : 2, '0')}`
}

export function Timeline({ jobsByMedia }: { jobsByMedia: JobsByMedia }) {
  const project = useEditor((s) => s.project)!
  const media = useEditor((s) => s.media)
  const timeMs = useEditor((s) => s.currentTimeMs)
  const playing = useEditor((s) => s.playing)
  const pxPerSecond = useEditor((s) => s.pxPerSecond)
  const selectedCueId = useEditor((s) => s.selectedCueId)
  const { setZoom, selectCue, updateCue, addCueAt, splitSelectedAt } = useEditor.getState()

  const video = primaryVideo({ project, media })
  const waveformJob = video ? jobsByMedia[video.id]?.find((j) => j.kind === 'waveform') : undefined
  const waveform = useEditor((s) => s.waveform)
  const cues = activeTrack(project).cues
  const keyframes = project.captionLayer.keyframes
  const durationMs = projectDurationMs({ project, media })
  const fps = project.composition.fps

  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewport, setViewport] = useState({ width: 800, height: 160, scrollLeft: 0 })
  const dragRef = useRef<Drag | null>(null)
  const [cursor, setCursor] = useState('default')

  const pxPerMs = pxPerSecond / 1000
  const xToMs = useCallback((x: number) => (x + viewport.scrollLeft) / pxPerMs, [viewport.scrollLeft, pxPerMs])
  const msToX = useCallback((ms: number) => ms * pxPerMs - viewport.scrollLeft, [viewport.scrollLeft, pxPerMs])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewport({ width: el.clientWidth, height: el.clientHeight, scrollLeft: el.scrollLeft })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  // Keep the playhead visible while playing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = timeMs * pxPerMs
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - 40
  }, [timeMs, playing, pxPerMs])

  // Ctrl/Cmd + wheel zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const { pxPerSecond: current } = useEditor.getState()
      const rect = el.getBoundingClientRect()
      const pointerX = e.clientX - rect.left
      const anchorMs = ((pointerX + el.scrollLeft) / current) * 1000
      const next = Math.min(1200, Math.max(10, current * Math.exp(-e.deltaY * 0.002)))
      setZoom(next)
      requestAnimationFrame(() => {
        el.scrollLeft = (anchorMs / 1000) * next - pointerX
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setZoom])

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = viewport
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, width, height)

    const startMs = xToMs(0)
    const endMs = xToMs(width)

    // Ruler
    ctx.fillStyle = COLORS.ruler
    ctx.fillRect(0, 0, width, RULER_H)
    const step = niceStep(pxPerSecond)
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'middle'
    for (let s = Math.floor(startMs / 1000 / step) * step; s * 1000 <= endMs; s += step) {
      const x = Math.round(msToX(s * 1000)) + 0.5
      ctx.fillStyle = COLORS.tick
      ctx.fillRect(x, RULER_H - 8, 1, 8)
      ctx.fillRect(x, RULER_H, 1, height - RULER_H)
      ctx.fillStyle = COLORS.rulerText
      ctx.fillText(formatRuler(s, step), x + 4, 9)
      for (let i = 1; i < 5; i++) {
        const sub = Math.round(msToX((s + (step * i) / 5) * 1000)) + 0.5
        ctx.fillStyle = COLORS.tick
        ctx.fillRect(sub, RULER_H - 4, 1, 4)
      }
    }

    // Caption-layer keyframes (all properties) as diamonds
    const keyTimes = [...new Set(keyframes.map((k) => k.timeMs))]
    ctx.fillStyle = COLORS.keyframe
    for (const t of keyTimes) {
      const x = msToX(t)
      if (x < -6 || x > width + 6) continue
      ctx.beginPath()
      ctx.moveTo(x, KF_Y - 4.5)
      ctx.lineTo(x + 4.5, KF_Y)
      ctx.lineTo(x, KF_Y + 4.5)
      ctx.lineTo(x - 4.5, KF_Y)
      ctx.fill()
    }

    // Past the end of the project
    const endX = msToX(durationMs)
    if (endX < width) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(Math.max(0, endX), RULER_H, width, height)
    }

    // Waveform
    const waveTop = RULER_H + CUE_ROW_H + 8
    const waveH = height - waveTop - 6
    if (waveH > 12) {
      ctx.fillStyle = COLORS.waveBg
      ctx.fillRect(0, waveTop, width, waveH)
      if (waveform) {
        const mid = waveTop + waveH / 2
        ctx.fillStyle = COLORS.wave
        const perPx = waveform.peaksPerSecond / pxPerSecond
        for (let x = 0; x < width; x++) {
          const i0 = Math.floor(((x + viewport.scrollLeft) / pxPerSecond) * waveform.peaksPerSecond)
          const i1 = Math.max(i0 + 1, Math.floor(i0 + perPx))
          let peak = 0
          for (let i = i0; i < i1 && i < waveform.peaks.length; i++) peak = Math.max(peak, waveform.peaks[i])
          const h = Math.max(1, peak * (waveH / 2 - 2))
          ctx.fillRect(x, mid - h, 1, h * 2)
        }
      } else {
        ctx.fillStyle = COLORS.rulerText
        ctx.fillText(!video?.hasAudio ? 'No audio' : waveformJob?.status === 'failed' ? 'Waveform unavailable' : 'Generating waveform…', 8, waveTop + 12)
      }
    }

    // Cues
    const cueTop = RULER_H + 6
    const cueH = CUE_ROW_H - 4
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
    for (const cue of cues) {
      if (cue.endMs < startMs || cue.startMs > endMs) continue
      const x0 = msToX(cue.startMs)
      const w = Math.max(2, (cue.endMs - cue.startMs) * pxPerMs)
      const selected = cue.id === selectedCueId
      ctx.fillStyle = selected ? COLORS.cueSelected : COLORS.cue
      ctx.strokeStyle = selected ? COLORS.cueSelectedBorder : COLORS.cueBorder
      ctx.lineWidth = selected ? 1.5 : 1
      ctx.beginPath()
      ctx.roundRect(x0 + 0.5, cueTop + 0.5, w - 1, cueH - 1, 5)
      ctx.fill()
      ctx.stroke()
      if (w > 16) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x0 + 6, cueTop, w - 12, cueH)
        ctx.clip()
        ctx.fillStyle = COLORS.cueText
        ctx.fillText(cue.text.replace(/\n/g, ' '), x0 + 7, cueTop + cueH / 2)
        ctx.restore()
      }
    }

    // Playhead
    const px = Math.round(msToX(timeMs)) + 0.5
    ctx.fillStyle = COLORS.playhead
    ctx.fillRect(px - 0.5, 0, 1.5, height)
    ctx.beginPath()
    ctx.moveTo(px - 6, 0)
    ctx.lineTo(px + 6, 0)
    ctx.lineTo(px, 8)
    ctx.fill()
  }, [viewport, cues, selectedCueId, timeMs, pxPerSecond, pxPerMs, waveform, waveformJob?.status, keyframes, durationMs, msToX, xToMs, video?.hasAudio])

  function hitTest(x: number, y: number): { cue: Cue; part: 'move' | 'start' | 'end' } | null {
    if (y < RULER_H + 6 || y > RULER_H + CUE_ROW_H) return null
    for (const cue of cues) {
      const x0 = msToX(cue.startMs)
      const x1 = msToX(cue.endMs)
      if (x < x0 - EDGE_PX || x > x1 + EDGE_PX) continue
      if (Math.abs(x - x0) <= EDGE_PX) return { cue, part: 'start' }
      if (Math.abs(x - x1) <= EDGE_PX) return { cue, part: 'end' }
      if (x > x0 && x < x1) return { cue, part: 'move' }
    }
    return null
  }

  /** Snap to the playhead when close, otherwise to the nearest frame. */
  function snap(ms: number): number {
    const playhead = useEditor.getState().currentTimeMs
    if (Math.abs(ms - playhead) * pxPerMs <= SNAP_PX) return Math.round(playhead)
    return snapToFrame(ms, fps)
  }

  function localPoint(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return
    const { x, y } = localPoint(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    const hit = hitTest(x, y)
    if (hit) {
      selectCue(hit.cue.id)
      dragRef.current = { type: hit.part, cue: hit.cue, originX: x, key: `drag:${hit.cue.id}:${Date.now()}`, moved: false }
      return
    }
    if (y > RULER_H + 6 && y < RULER_H + CUE_ROW_H) selectCue(null)
    dragRef.current = { type: 'scrub' }
    playback.seek(snapToFrame(xToMs(x), fps))
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { x, y } = localPoint(e)
    const drag = dragRef.current
    if (!drag) {
      const hit = hitTest(x, y)
      setCursor(hit ? (hit.part === 'move' ? 'grab' : 'ew-resize') : 'default')
      return
    }
    if (drag.type === 'scrub') {
      playback.seek(snapToFrame(xToMs(x), fps))
      return
    }
    const deltaMs = (x - drag.originX) / pxPerMs
    if (!drag.moved && Math.abs(x - drag.originX) < 3) return
    drag.moved = true
    const { cue } = drag
    const others = cues.filter((c) => c.id !== cue.id)
    const prevEnd = Math.max(0, ...others.filter((c) => c.endMs <= cue.startMs).map((c) => c.endMs))
    const nextStart = Math.min(Infinity, ...others.filter((c) => c.startMs >= cue.endMs).map((c) => c.startMs))

    if (drag.type === 'move') {
      const length = cue.endMs - cue.startMs
      let start = snap(cue.startMs + deltaMs)
      start = Math.min(Math.max(start, prevEnd), nextStart - length)
      const shift = start - cue.startMs
      updateCue(
        cue.id,
        {
          startMs: start,
          endMs: start + length,
          words: cue.words?.map((w) => ({ ...w, startMs: w.startMs + shift, endMs: w.endMs + shift })),
        },
        drag.key,
      )
      setCursor('grabbing')
    } else if (drag.type === 'start') {
      const start = Math.min(Math.max(snap(cue.startMs + deltaMs), prevEnd), cue.endMs - MIN_CUE_MS)
      updateCue(cue.id, { startMs: start, words: undefined }, drag.key)
    } else {
      const end = Math.max(Math.min(snap(cue.endMs + deltaMs), nextStart), cue.startMs + MIN_CUE_MS)
      updateCue(cue.id, { endMs: end, words: undefined }, drag.key)
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && drag.type !== 'scrub' && !drag.moved) {
      playback.seek(drag.cue.startMs)
    }
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (y < RULER_H + 6 || y > RULER_H + CUE_ROW_H || hitTest(x, y)) return
    addCueAt(snapToFrame(xToMs(x), fps))
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1">
        <span className="text-xs font-medium text-muted-foreground">Timeline</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="xs" variant="ghost" onClick={() => splitSelectedAt(timeMs)}>
              <Scissors /> Split
            </Button>
          </TooltipTrigger>
          <TooltipContent>Split the caption under the playhead (S)</TooltipContent>
        </Tooltip>
        <Button size="xs" variant="ghost" onClick={() => addCueAt(snapToFrame(timeMs, fps))}>
          <Plus /> Caption at playhead
        </Button>
        <span className="hidden text-[11px] text-muted-foreground lg:inline">
          Drag to move · drag edges to trim · double-click to add · ⌘/Ctrl + scroll to zoom
        </span>
        <div className="ml-auto flex w-48 items-center gap-2">
          <Button size="icon-xs" variant="ghost" aria-label="Zoom out" onClick={() => setZoom(pxPerSecond / 1.5)}>
            <Minus />
          </Button>
          <Slider
            aria-label="Timeline zoom"
            min={Math.log(10)}
            max={Math.log(1200)}
            step={0.01}
            value={[Math.log(pxPerSecond)]}
            onValueChange={([v]) => setZoom(Math.exp(v))}
          />
          <Button size="icon-xs" variant="ghost" aria-label="Zoom in" onClick={() => setZoom(pxPerSecond * 1.5)}>
            <Plus />
          </Button>
        </div>
      </div>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div style={{ width: Math.max(viewport.width, (durationMs / 1000) * pxPerSecond + 200), height: 1 }} />
        <canvas
          ref={canvasRef}
          className="sticky left-0 top-0 block"
          style={{ cursor, marginTop: -1, touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onPointerLeave={() => !dragRef.current && setCursor('default')}
        />
      </div>
    </div>
  )
}
