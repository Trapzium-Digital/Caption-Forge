import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, ScanLine, SkipBack } from 'lucide-react'
import { formatClock } from '@captionforge/captions'
import { CaptionLayer, SafeAreaGuides, useCaptionFontEpoch } from '@captionforge/caption-styles'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { primaryVideo, projectDurationMs, useEditor } from '@/store/editor'
import { playback } from '@/store/playback'

function useFitScale(width: number, height: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.2)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      setScale(Math.max(0.05, Math.min((w - 32) / width, (h - 32) / height)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [width, height])
  return { ref, scale }
}

export function Preview() {
  const project = useEditor((s) => s.project)!
  const media = useEditor((s) => s.media)
  const timeMs = useEditor((s) => s.currentTimeMs)
  const playing = useEditor((s) => s.playing)
  const showSafeArea = useEditor((s) => s.showSafeArea)
  const waveform = useEditor((s) => s.waveform)
  const fontEpoch = useCaptionFontEpoch(project.captionStyle.config)
  const video = primaryVideo({ project, media })
  const duration = projectDurationMs({ project, media })
  const { width, height } = project.composition
  const { ref, scale } = useFitScale(width, height)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    playback.attach(videoRef.current)
    return () => playback.attach(null)
  }, [video?.id])

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div ref={ref} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          className="relative shrink-0 overflow-hidden bg-black shadow-2xl ring-1 ring-white/10"
          style={{ width: width * scale, height: height * scale }}
        >
          <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
            {video ? (
              <video
                ref={videoRef}
                key={video.id}
                src={api.mediaFileUrl(video.id)}
                className="absolute inset-0 h-full w-full object-contain"
                preload="auto"
                playsInline
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-[40px] text-zinc-700">No video — import one from the Media bin</div>
            )}
            {showSafeArea && <SafeAreaGuides project={project} scale={scale} />}
            {/* Same renderer as the Remotion export - not a separate preview implementation. */}
            <CaptionLayer project={project} timeMs={timeMs} fontEpoch={fontEpoch} speech={waveform} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-border px-3 py-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" onClick={() => playback.seek(0)} aria-label="Go to start">
              <SkipBack />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Go to start (Home)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" onClick={() => playback.stepFrames(-1)} aria-label="Previous frame">
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous frame (←)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" onClick={() => playback.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause /> : <Play />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Play / pause (Space)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" onClick={() => playback.stepFrames(1)} aria-label="Next frame">
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next frame (→)</TooltipContent>
        </Tooltip>
        <div className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{formatClock(timeMs)}</span> / {formatClock(duration)}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant={showSafeArea ? 'secondary' : 'ghost'}
              className="ml-auto"
              aria-label="Show safe area"
              aria-pressed={showSafeArea}
              onClick={() => useEditor.getState().setShowSafeArea(!showSafeArea)}
            >
              <ScanLine />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Safe-area guides (editor only)</TooltipContent>
        </Tooltip>
        <div className="text-xs text-muted-foreground">
          {width}×{height} · {project.composition.fps} fps · {Math.round(scale * 100)}%
        </div>
      </div>
    </div>
  )
}
