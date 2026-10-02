import { useCallback, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import { useEditor } from '@/store/editor'

const DEBOUNCE_MS = 800

/**
 * Debounced autosave to the local API (SQLite). The API keeps checkpoints in
 * project_versions, so every save is also crash-recovery material.
 *
 * `save('manual')` waits for any save in flight, always writes, and throws on
 * failure - callers such as rendering rely on the saved document.
 */
export function useAutosave() {
  const revision = useEditor((s) => s.revision)
  const inflight = useRef<Promise<void> | null>(null)
  const savedRevision = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const save = useCallback(async (reason: 'autosave' | 'manual' = 'autosave'): Promise<void> => {
    while (inflight.current) await inflight.current.catch(() => undefined)
    const { project, revision: rev, setSaveState } = useEditor.getState()
    if (!project) return
    if (rev === savedRevision.current && reason === 'autosave') return

    setSaveState('saving')
    const attempt = api.saveProject(project, reason).then(() => {
      savedRevision.current = rev
    })
    inflight.current = attempt
    try {
      await attempt
      setSaveState(useEditor.getState().revision === rev ? 'saved' : 'dirty')
    } catch (err) {
      setSaveState('error')
      if (reason === 'manual') throw err
    } finally {
      inflight.current = null
    }
    if (useEditor.getState().revision !== savedRevision.current) {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(), DEBOUNCE_MS)
    }
  }, [])

  useEffect(() => {
    if (revision === 0) {
      savedRevision.current = 0
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS)
    return () => clearTimeout(timer.current)
  }, [revision, save])

  // Best-effort flush when the tab closes.
  useEffect(() => {
    const onUnload = () => {
      const { project, revision: rev } = useEditor.getState()
      if (!project || rev === savedRevision.current) return
      void fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: project, reason: 'autosave' }),
      })
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  return save
}
