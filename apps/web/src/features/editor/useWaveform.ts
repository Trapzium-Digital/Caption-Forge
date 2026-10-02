import { useEffect, useState } from 'react'
import { api, type Waveform } from '@/lib/api'

/** Loads a media waveform once its background job has completed. */
export function useWaveform(mediaId: string | undefined, ready: boolean): Waveform | null {
  const [waveform, setWaveform] = useState<Waveform | null>(null)

  useEffect(() => {
    setWaveform(null)
    if (!mediaId || !ready) return
    let cancelled = false
    api
      .waveform(mediaId)
      .then((data) => !cancelled && setWaveform(data))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [mediaId, ready])

  return waveform
}
