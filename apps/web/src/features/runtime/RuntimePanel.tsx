import { useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, RefreshCw, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, type RuntimeStatus } from '@/lib/api'

export function RuntimePanel() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setStatus(await api.runtime())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Local runtime</h2>
        {status && (
          <Badge variant={status.ready ? 'secondary' : 'destructive'} className="text-[10px]">
            {status.ready ? 'Ready' : 'Needs attention'}
          </Badge>
        )}
        <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Re-check runtime" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>
      {error && (
        <div className="space-y-1 px-4 py-4 text-xs">
          <p className="flex items-center gap-1.5 text-destructive">
            <XCircle className="size-3.5" /> {error}
          </p>
          <p className="text-muted-foreground">
            Start it with <code className="rounded bg-muted px-1">npm run dev</code> from the CaptionForge folder.
          </p>
        </div>
      )}
      {status && (
        <ul className="divide-y divide-border">
          {status.components.map((c) => (
            <li key={c.name} className="flex items-start gap-2.5 px-4 py-2">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
              ) : c.required ? (
                <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              ) : (
                <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{c.name}</span>
                  {!c.ok && c.milestone && <span className="text-[10px] text-muted-foreground">coming in {c.milestone}</span>}
                </div>
                {c.ok && c.version && <div className="truncate text-[11px] text-muted-foreground">{c.version}</div>}
                {!c.ok && c.fix && !c.milestone && <div className="text-[11px] text-muted-foreground">{c.fix}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {status && (
        <div className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <div className="truncate" title={status.workspace}>
            Workspace: {status.workspace}
          </div>
          <div>{status.platform}</div>
        </div>
      )}
    </div>
  )
}
