import { projectDurationMs, useEditor } from './editor'

/**
 * Single playback clock. When a video is attached it is the source of truth;
 * otherwise (captions-only projects) a requestAnimationFrame clock is used.
 */
let video: HTMLVideoElement | null = null
let raf = 0
let clockOrigin = 0

function tick() {
  const { playing, setCurrentTime, setPlaying } = useEditor.getState()
  if (!playing) return
  const duration = projectDurationMs(useEditor.getState())
  const t = video ? video.currentTime * 1000 : performance.now() - clockOrigin
  if (!video && t >= duration) {
    setCurrentTime(duration)
    setPlaying(false)
    return
  }
  setCurrentTime(t)
  raf = requestAnimationFrame(tick)
}

export const playback = {
  attach(el: HTMLVideoElement | null) {
    if (video && video !== el) video.pause()
    video = el
    if (el) {
      el.currentTime = useEditor.getState().currentTimeMs / 1000
      el.onended = () => playback.pause()
    }
  },

  async play() {
    const state = useEditor.getState()
    if (state.playing) return
    const duration = projectDurationMs(state)
    let start = state.currentTimeMs
    if (start >= duration - 10) start = 0
    state.setCurrentTime(start)
    if (video) {
      video.currentTime = start / 1000
      try {
        await video.play()
      } catch {
        return
      }
    } else {
      clockOrigin = performance.now() - start
    }
    state.setPlaying(true)
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(tick)
  },

  pause() {
    cancelAnimationFrame(raf)
    video?.pause()
    const state = useEditor.getState()
    if (video) state.setCurrentTime(video.currentTime * 1000)
    state.setPlaying(false)
  },

  toggle() {
    if (useEditor.getState().playing) playback.pause()
    else void playback.play()
  },

  seek(ms: number) {
    const state = useEditor.getState()
    const t = Math.min(Math.max(0, ms), projectDurationMs(state))
    state.setCurrentTime(t)
    if (video) video.currentTime = t / 1000
    clockOrigin = performance.now() - t
  },

  stepFrames(frames: number) {
    const state = useEditor.getState()
    const fps = state.project?.composition.fps ?? 30
    playback.pause()
    const frame = Math.round((state.currentTimeMs * fps) / 1000) + frames
    playback.seek((frame * 1000) / fps)
  },
}
