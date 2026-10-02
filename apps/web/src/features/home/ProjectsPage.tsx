import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Copy, FileUp, Film, MoreHorizontal, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createId, createProject, migrateProject } from '@captionforge/project-format'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type ProjectSummary } from '@/lib/api'
import { ASPECT_PRESETS } from '../editor/Inspector'
import { RuntimePanel } from '../runtime/RuntimePanel'

function timeAgo(iso: string): string {
  const seconds = (Date.now() - Date.parse(iso)) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}

function NewProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [preset, setPreset] = useState(0)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const project = createProject(name.trim() || 'Untitled project')
      const p = ASPECT_PRESETS[preset]
      project.composition = { ...project.composition, width: p.width, height: p.height }
      await api.createProject(project)
      onCreated(project.id)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Stored on this computer. You can change the format later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" autoFocus placeholder="My video" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_PRESETS.slice(0, 3).map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPreset(i)}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-colors ${
                    preset === i ? 'border-primary bg-primary/10' : 'border-border hover:border-foreground/30'
                  }`}
                >
                  <div className="grid h-12 place-items-center">
                    <div
                      className="rounded-sm border-2 border-current opacity-70"
                      style={{ width: (p.width / Math.max(p.width, p.height)) * 44, height: (p.height / Math.max(p.width, p.height)) * 44 }}
                    />
                  </div>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Importing a video sets the format to match it automatically.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      setProjects(await api.listProjects())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function importProject(file: File | undefined) {
    if (!file) return
    try {
      const project = migrateProject(JSON.parse(await file.text()))
      // Imported copies get a fresh id so they never overwrite an existing project.
      const copy = { ...project, id: createId('proj'), primaryVideoId: null, media: [] }
      await api.createProject(copy, 'import')
      toast.success(`Imported "${copy.name}". Re-import its media files to relink them.`)
      onOpen(copy.id)
    } catch (err) {
      toast.error(err instanceof SyntaxError ? 'File is not valid JSON' : (err as Error).message)
    }
  }

  async function duplicate(p: ProjectSummary) {
    try {
      const copy = await api.duplicateProject(p.id)
      toast.success(`Created "${copy.name}" - same video and captions, edit it independently`)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await api.deleteProject(toDelete.id)
      toast.success(`Deleted "${toDelete.name}"`)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setToDelete(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">CaptionForge</h1>
            <p className="text-xs text-muted-foreground">Local caption studio</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-400" /> Everything stays on this computer
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-lg font-semibold">Projects</h2>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => importInput.current?.click()}>
                <FileUp /> Import project
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> New project
              </Button>
              <input
                ref={importInput}
                type="file"
                hidden
                accept=".json,.cfproject"
                onChange={(e) => (importProject(e.target.files?.[0]), (e.target.value = ''))}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          )}

          {projects && projects.length === 0 && (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Film className="size-8" />
              <span className="text-sm">Create your first project</span>
            </button>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects?.map((p) => (
              <div key={p.id} className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/25">
                <button className="block w-full text-left" onClick={() => onOpen(p.id)}>
                  <div className="grid aspect-video place-items-center overflow-hidden bg-muted">
                    {p.primaryVideoId ? (
                      <img src={api.thumbnailUrl(p.primaryVideoId)} alt="" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    ) : (
                      <Film className="size-6 text-muted-foreground" />
                    )}
                  </div>
                </button>
                <div className="flex items-start gap-2 p-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(p.id)}>
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.cueCount} captions · edited {timeAgo(p.updatedAt)}
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-xs" variant="ghost" aria-label="Project actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => duplicate(p)}>
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setToDelete(p)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <RuntimePanel />
        </aside>
      </main>

      <NewProjectDialog open={creating} onOpenChange={setCreating} onCreated={onOpen} />

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project and the media copies stored in your CaptionForge workspace. Your original files are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
