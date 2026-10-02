import { Composition } from 'remotion'
import { CaptionForgeVideo, type RenderProps } from './CaptionForgeVideo.tsx'

const defaultProps = { project: null, videoUrl: null, transparent: false, durationMs: 1000 } as unknown as RenderProps

export function Root() {
  return (
    <Composition
      id="CaptionForge"
      component={CaptionForgeVideo}
      defaultProps={defaultProps}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      calculateMetadata={({ props }) => {
        const { width, height, fps } = props.project.composition
        return {
          width,
          height,
          fps,
          durationInFrames: Math.max(1, Math.ceil((props.durationMs / 1000) * fps)),
        }
      }}
    />
  )
}
