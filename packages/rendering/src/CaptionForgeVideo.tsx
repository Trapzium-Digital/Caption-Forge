import { AbsoluteFill, OffthreadVideo, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion'
import { useEffect, useMemo, useState } from 'react'
import { CaptionLayer, clearMeasureCache, loadCaptionFonts, type CaptionProject } from '@captionforge/caption-styles'
import { migrateProject } from '@captionforge/project-format'
import type { SpeechEnvelope } from '@captionforge/captions'

export interface RenderProps extends Record<string, unknown> {
  project: CaptionProject
  /** URL of the main video, or null for captions only. */
  videoUrl: string | null
  /** Captions-only render on a transparent background (WebM alpha). */
  transparent: boolean
  durationMs: number
  /** Audio envelope of the main video - same speech-aware word timing as the preview. */
  speech?: SpeechEnvelope | null
}

/**
 * Production render. The caption layer is the exact component the editor
 * preview uses; only the clock differs (frame number instead of the player).
 */
export function CaptionForgeVideo({ project: saved, videoUrl, transparent, speech = null }: RenderProps) {
  // Same canonical format as the editor: older saved documents are upgraded first.
  const project = useMemo(() => migrateProject(saved), [saved])
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const config = project.captionStyle.config
  const [fontEpoch, setFontEpoch] = useState(0)
  const [handle] = useState(() => delayRender('Loading caption font'))

  useEffect(() => {
    void loadCaptionFonts(config).then(() => {
      clearMeasureCache()
      setFontEpoch(1)
      continueRender(handle)
    })
  }, [config, handle])

  return (
    <AbsoluteFill style={{ backgroundColor: transparent ? 'transparent' : '#000' }}>
      {videoUrl && !transparent && (
        <OffthreadVideo src={videoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      )}
      {fontEpoch > 0 && <CaptionLayer project={project} timeMs={(frame / fps) * 1000} fontEpoch={fontEpoch} speech={speech} />}
    </AbsoluteFill>
  )
}
