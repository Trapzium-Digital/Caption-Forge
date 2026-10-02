import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, Clapperboard, Download, Film, Loader2, Redo2, Sparkles, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { toSrt, toVtt } from '@captionforge/captions'
import { migrateProject } from '@captionforge/project-format'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { downloadText, safeBaseName } from '@/lib/download'
import { activeTrack, primaryVideo, useEditor } from '@/store/editor'
import { playback } from '@/store/playback'
import { AiCaptionsDialog } from './AiCaptionsDialog'
import { CaptionList } from './CaptionList'
import { Inspector } from './Inspector'
import { MediaBin } from './MediaBin'
import { Preview } from './Preview'
import { RenderDialog } from './RenderDialog'
import { StylesPanel } from './StylesPanel'
import { Timeline } from './Timeline'
import { useAutosave } from './useAutosave'
import { useJobs } from './useJobs'
import { useShortcuts } from './useShortcuts'
import { useWaveform } from './useWaveform'

function SaveIndicator() {
  const saveState = useEditor((s) => s.saveState)
  const map = {
    saved: { icon: <Check className="size-3.5" />, text: 'Saved locally', cls: 'text-muted-foreground' },
    dirty: { icon: <span className="size-1.5 rounded-full bg-amber-400" />, text: 'Unsaved changes', cls: 'text-muted-foreground' },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: 'Saving…', cls: 'text-muted-foreground' },
    error: { icon: <AlertCircle className="size-3.5" />, text: 'Save failed — retrying on next edit', cls: 'text-destructive' },
  }[saveState]
  return (
    <span className={`flex items-center gap-1.5 text-xs ${map.cls}`}>
      {map.icon}
      {map.text}
    </span>
  )
}

function Editor({ onExit }: { onExit: () => void }) {
  const project = useEditor((s) => s.project)!
  const media = useEditor((s) => s.media)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const { undo, redo } = useEditor.getState()
  const save = useAutosave()
  const jobs = useJobs(project.id)
  const [renderOpen, setRenderOpen] = useState(false)
  useShortcuts(save)

  // One waveform for the main video, shared by the timeline and speech-aware word timing.
  const mainVideo = primaryVideo({ project, media })
  const waveformJob = mainVideo ? jobs.byMedia[mainVideo.id]?.find((j) => j.kind === 'waveform') : undefined
  const waveform = useWaveform(mainVideo?.hasAudio ? mainVideo.id : undefined, waveformJob?.status === 'complete')
  useEffect(() => useEditor.getState().setWaveform(waveform), [waveform])

  const cues = activeTrack(project).cues
  const video = primaryVideo({ project, media })
  const base = safeBaseName(project.name)

  function exportSubtitles(kind: 'srt' | 'vtt') {
    if (cues.length === 0) return toast.error('There are no captions to export yet')
    downloadText(`${base}.${kind}`, kind === 'srt' ? toSrt(cues) : toVtt(cues), kind === 'srt' ? 'application/x-subrip' : 'text/vtt')
  }

  const [aiOpen, setAiOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button size="icon-sm" variant="ghost" aria-label="Back to projects" onClick={onExit}>
          <ArrowLeft />
        </Button>
        <div className="flex items-center gap-2">
          <Clapperboard className="size-4 text-primary" />
          <span className="max-w-64 truncate text-sm font-medium">{project.name}</span>
        </div>
        <div className="ml-3">
          <SaveIndicator />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" disabled={!canUndo} onClick={undo} aria-label="Undo">
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (⌘Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" disabled={!canRedo} onClick={redo} aria-label="Redo">
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (⇧⌘Z)</TooltipContent>
          </Tooltip>

          <Button size="sm" variant="outline" className="ml-2" onClick={() => (video ? setAiOpen(true) : toast.error('Import a video first'))}>
            <Sparkles /> AI captions
          </Button>
          {video && <AiCaptionsDialog open={aiOpen} onOpenChange={setAiOpen} video={video} onJobsChanged={() => void jobs.refresh()} />}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Download /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => exportSubtitles('srt')}>SubRip (.srt)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportSubtitles('vtt')}>WebVTT (.vtt)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Project</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => downloadText(`${base}.cfproject.json`, JSON.stringify(migrateProject(project), null, 2), 'application/json')}
              >
                Portable project (.cfproject.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setRenderOpen(true)}>
            <Film /> Render
          </Button>
          <RenderDialog open={renderOpen} onOpenChange={setRenderOpen} save={save} />
        </div>
      </header>

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="68%" minSize="30%">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="22%" minSize="240px" maxSize="40%">
              <Tabs defaultValue="media" className="flex h-full flex-col gap-0">
                <div className="border-b border-border px-3 py-2">
                  <TabsList className="w-full">
                    <TabsTrigger value="media">Media</TabsTrigger>
                    <TabsTrigger value="styles">Styles</TabsTrigger>
                    <TabsTrigger value="captions">Captions</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="media" className="min-h-0 flex-1">
                  <MediaBin jobsByMedia={jobs.byMedia} onImported={() => void jobs.refresh()} />
                </TabsContent>
                <TabsContent value="styles" className="min-h-0 flex-1">
                  <StylesPanel />
                </TabsContent>
                <TabsContent value="captions" className="min-h-0 flex-1">
                  <CaptionList />
                </TabsContent>
              </Tabs>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="54%" minSize="30%">
              <Preview />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="24%" minSize="260px" maxSize="40%">
              <Inspector />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize="32%" minSize="140px">
          <Timeline jobsByMedia={jobs.byMedia} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

export function EditorPage({ projectId, onExit }: { projectId: string; onExit: () => void }) {
  const loaded = useEditor((s) => s.project?.id === projectId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([api.getProject(projectId), api.listMedia(projectId)])
      .then(([doc, media]) => {
        if (!cancelled) useEditor.getState().load(migrateProject(doc), media)
      })
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      playback.pause()
      // Flush unsaved edits before leaving the editor.
      const { project, saveState, unload } = useEditor.getState()
      if (project && saveState !== 'saved') void api.saveProject(project).catch(() => undefined)
      unload()
    }
  }, [projectId])

  if (error) {
    return (
      <div className="grid h-screen place-items-center">
        <div className="space-y-3 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={onExit}>
            Back to projects
          </Button>
        </div>
      </div>
    )
  }
  if (!loaded) {
    return (
      <div className="grid h-screen place-items-center text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    )
  }
  return <Editor onExit={onExit} />
}
