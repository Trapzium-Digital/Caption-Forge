/** Parse "HH:MM:SS,mmm", "HH:MM:SS.mmm" or "MM:SS.mmm" into milliseconds. */
export function parseTimecode(value: string): number {
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/)
  if (!match) throw new Error(`Invalid timecode: "${value}"`)
  const [, h = '0', m, s, ms] = match
  return (
    Number(h) * 3_600_000 +
    Number(m) * 60_000 +
    Number(s) * 1000 +
    Number(ms.padEnd(3, '0'))
  )
}

export function formatTimecode(ms: number, separator: ',' | '.' = ','): string {
  const total = Math.max(0, Math.round(ms))
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const milli = total % 1000
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(milli, 3)}`
}

/** Short clock for UI display, e.g. "1:02.45". */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms)
  const m = Math.floor(total / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function snapToFrame(ms: number, fps: number): number {
  const frameMs = 1000 / fps
  return Math.round(Math.round(ms / frameMs) * frameMs)
}
