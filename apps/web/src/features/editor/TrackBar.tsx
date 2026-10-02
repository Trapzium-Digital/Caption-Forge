import { useState } from 'react'
import { Languages, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEditor } from '@/store/editor'
import { TranslateDialog } from './TranslateDialog'

/**
 * Caption tracks (e.g. English + French). The active track is what the
 * preview shows, what SRT/VTT export writes and what the renderer burns in.
 */
export function TrackBar() {
  const project = useEditor((s) => s.project)!
  const { setActiveTrack, renameTrack, deleteTrack } = useEditor.getState()
  const [translateOpen, setTranslateOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const active = project.captionTracks.find((t) => t.id === project.activeCaptionTrackId) ?? project.captionTracks[0]

  return (
    <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
      {renaming ? (
        <Input
          autoFocus
          aria-label="Track name"
          defaultValue={active.name}
          className="h-7 flex-1 text-xs"
          onBlur={(e) => {
            renameTrack(active.id, e.target.value)
            setRenaming(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <Select value={active.id} onValueChange={setActiveTrack}>
          <SelectTrigger size="sm" className="h-7 flex-1 text-xs" aria-label="Caption track">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {project.captionTracks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                <span className="ml-1 text-[10px] text-muted-foreground uppercase">{t.language !== 'und' ? t.language : ''}</span>
                <span className="ml-1 text-[10px] text-muted-foreground">· {t.cues.length}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button size="xs" variant="outline" onClick={() => setTranslateOpen(true)} disabled={active.cues.length === 0}>
        <Languages /> Translate
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xs" variant="ghost" aria-label="Track actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> Rename track
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={project.captionTracks.length < 2} onSelect={() => deleteTrack(active.id)}>
            <Trash2 /> Delete track
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TranslateDialog open={translateOpen} onOpenChange={setTranslateOpen} />
    </div>
  )
}
