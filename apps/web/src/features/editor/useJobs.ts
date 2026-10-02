import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Job } from '@/lib/api'

export type JobsByMedia = Record<string, Job[]>

const ACTIVE = new Set(['queued', 'running'])

/** Polls the local job queue while any job for the project is still active. */
export function useJobs(projectId: string) {
  const [jobs, setJobs] = useState<Job[]>([])
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const refresh = useCallback(async () => {
    clearTimeout(timer.current)
    try {
      const list = await api.listJobs(projectId)
      setJobs(list)
      if (list.some((j) => ACTIVE.has(j.status))) timer.current = setTimeout(refresh, 750)
    } catch {
      timer.current = setTimeout(refresh, 3000)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
    return () => clearTimeout(timer.current)
  }, [refresh])

  const byMedia = useMemo(() => {
    const map: JobsByMedia = {}
    for (const job of jobs) {
      const id = job.payload.mediaId
      if (typeof id === 'string') (map[id] ??= []).push(job)
    }
    return map
  }, [jobs])

  return { jobs, byMedia, refresh }
}
