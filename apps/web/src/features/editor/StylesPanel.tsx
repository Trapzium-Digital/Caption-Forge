import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, GitBranch, MoreHorizontal, Pencil, Save, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { CaptionStyleConfig, Cue } from '@captionforge/project-format'
import { CAPTION_STYLES, CaptionLayer, getCaptionStyle, styleConfigFor, useCaptionFontEpoch, type CaptionProject } from '@captionforge/caption-styles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, type CaptionTemplate } from '@/lib/api'
import { useEditor } from '@/store/editor'

const SAMPLE_WORDS = ['This', 'is', 'the', 'best', 'way']
const SAMPLE_CUE: Cue = {
  id: 'sample',
  startMs: 0,
  endMs: 3000,
  text: SAMPLE_WORDS.join(' '),
  speaker: 'Alex',
  emphasis: { '3': 'primary' },
  words: SAMPLE_WORDS.map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 400 })),
}
const SAMPLE_TIME = 1450 // "best" is being spoken, all entrances have finished

/**
 * A real render of the style: the same CaptionLayer as the preview and export,
 * on a small sample caption, scaled into the card.
 */
function StyleSample({ config, styleId }: { config: CaptionStyleConfig; styleId: string }) {
  const project = useMemo<CaptionProject>(
    () => ({
      composition: { width: 1080, height: 460, fps: 30 },
      safeArea: { preset: 'none', top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 },
      captionTracks: [{ id: 't', name: 'sample', language: 'en', cues: [SAMPLE_CUE] }],
      activeCaptionTrackId: 't',
      captionLayer: { keyframes: [] },
      speakers: [],
      captionStyle: {
        styleId,
        templateId: null,
        config: {
          ...config,
          anchor: config.anchor.endsWith('left') ? 'middle-left' : 'middle-center',
          xOffset: 0,
          yOffset: 0,
          maxWidth: 0.92,
          maxLines: 2,
          fontSize: Math.min(config.fontSize, 96),
        },
      },
    }),
    [config, styleId],
  )
  const fontEpoch = useCaptionFontEpoch(config)
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.25)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1080))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className="relative h-[72px] overflow-hidden rounded-md bg-[linear-gradient(135deg,#475569,#0f172a)]" aria-hidden>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: 1080, height: 460, transform: `scale(${scale}) translateY(${(72 / scale - 460) / 2}px)` }}>
        <CaptionLayer project={project} timeMs={SAMPLE_TIME} fontEpoch={fontEpoch} />
      </div>
    </div>
  )
}

function NameDialog({
  open,
  title,
  description,
  initial,
  confirm,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  description: string
  initial: string
  confirm: string
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => setName(initial), [initial, open])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            setBusy(true)
            try {
              await onSubmit(name.trim())
              onClose()
            } catch (err) {
              toast.error((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input id="template-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type Pending =
  | { kind: 'save' }
  | { kind: 'variant'; from: CaptionTemplate | null }
  | { kind: 'rename'; template: CaptionTemplate }
  | null

export function StylesPanel() {
  const captionStyle = useEditor((s) => s.project!.captionStyle)
  const { update } = useEditor.getState()
  const [templates, setTemplates] = useState<CaptionTemplate[]>([])
  const [pending, setPending] = useState<Pending>(null)

  const load = useCallback(async () => {
    try {
      setTemplates(await api.listTemplates())
    } catch (err) {
      toast.error((err as Error).message)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const current = templates.find((t) => t.id === captionStyle.templateId) ?? null
  const style = getCaptionStyle(captionStyle.styleId)

  function applyBuiltIn(styleId: string) {
    const def = CAPTION_STYLES[styleId]
    update((p) => {
      // Keep the user's font; everything else comes from the style.
      p.captionStyle = { styleId, templateId: null, config: styleConfigFor(styleId, p.captionStyle.config.fontFamily, p.captionStyle.styleId) }
    })
    toast.success(`Applied ${def.name}`)
  }

  function applyTemplate(t: CaptionTemplate) {
    update((p) => {
      p.captionStyle = { styleId: t.styleId, templateId: t.id, config: { ...getCaptionStyle(t.styleId).defaults, ...structuredClone(t.config) } }
    })
    toast.success(`Applied "${t.name}"`)
  }

  async function saveCurrentTo(t: CaptionTemplate) {
    try {
      await api.updateTemplate(t.id, { config: captionStyle.config })
      toast.success(`Updated "${t.name}"`)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function duplicate(t: CaptionTemplate) {
    try {
      const copy = await api.duplicateTemplate(t.id, false)
      toast.success(`Created "${copy.name}"`)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function remove(t: CaptionTemplate) {
    try {
      await api.deleteTemplate(t.id)
      if (captionStyle.templateId === t.id) update((p) => void (p.captionStyle.templateId = null))
      toast.success(`Deleted "${t.name}"`)
      void load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <section className="space-y-2">
            <h3 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Caption style</h3>
            {Object.values(CAPTION_STYLES).map((def) => {
              const applied = captionStyle.styleId === def.id && !captionStyle.templateId
              return (
                <div key={def.id} className={`space-y-2 rounded-lg border p-2 ${captionStyle.styleId === def.id ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
                  <StyleSample config={def.defaults} styleId={def.id} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{def.name}</span>
                    {applied && <Badge className="h-4 px-1.5 text-[10px]">In use</Badge>}
                    <Button size="xs" variant={applied ? 'ghost' : 'outline'} className="ml-auto" onClick={() => applyBuiltIn(def.id)}>
                      {applied ? 'Re-apply' : 'Apply'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{def.description}</p>
                </div>
              )
            })}
            <p className="px-1 text-[11px] text-muted-foreground">Highlight, Creator and News use words you mark in the Caption tab. Podcast and News use the speaker set on each caption.</p>
          </section>

          <section className="space-y-2">
            <h3 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Current look</h3>
            <div className="rounded-lg border border-border p-2">
              <StyleSample config={captionStyle.config} styleId={captionStyle.styleId} />
              <p className="mt-2 text-xs">
                {style.name}
                {current ? <span className="text-muted-foreground"> · from “{current.name}”</span> : null}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Button size="xs" variant="outline" onClick={() => setPending({ kind: 'save' })}>
                  <Save /> Save as template
                </Button>
                <Button size="xs" variant="outline" onClick={() => setPending({ kind: 'variant', from: current })}>
                  <GitBranch /> Create variant
                </Button>
                {current && (
                  <Button size="xs" variant="ghost" className="col-span-2" onClick={() => saveCurrentTo(current)}>
                    <Upload /> Update “{current.name}” with these settings
                  </Button>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">My templates</h3>
            {templates.length === 0 && <p className="px-1 text-xs text-muted-foreground">Save the current look to reuse it in other projects.</p>}
            {templates.map((t) => {
              const parent = t.parentId ? templates.find((x) => x.id === t.parentId) : null
              const applied = captionStyle.templateId === t.id
              return (
                <div key={t.id} className={`rounded-lg border p-2 ${applied ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
                  <StyleSample config={{ ...getCaptionStyle(t.styleId).defaults, ...t.config }} styleId={t.styleId} />
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium" title={t.name}>
                        {t.name}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {getCaptionStyle(t.styleId).name}
                        {parent ? ` · variant of ${parent.name}` : ''}
                      </div>
                    </div>
                    {applied ? (
                      <Badge className="h-4 px-1.5 text-[10px]">
                        <Check className="size-2.5" /> In use
                      </Badge>
                    ) : (
                      <Button size="xs" variant="outline" onClick={() => applyTemplate(t)}>
                        Apply
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon-xs" variant="ghost" aria-label={`Actions for ${t.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onSelect={() => applyTemplate(t)}>Apply</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => saveCurrentTo(t)}>
                          <Upload /> Update with current settings
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => duplicate(t)}>
                          <Copy /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPending({ kind: 'variant', from: t })}>
                          <GitBranch /> Create variant
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPending({ kind: 'rename', template: t })}>
                          <Pencil /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => remove(t)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </section>
        </div>
      </ScrollArea>

      <NameDialog
        open={pending?.kind === 'save'}
        title="Save as template"
        description="Stores the current caption settings on this computer so you can apply them to any project."
        initial={`My ${style.name}`}
        confirm="Save template"
        onClose={() => setPending(null)}
        onSubmit={async (name) => {
          const tpl = await api.createTemplate({ name, styleId: captionStyle.styleId, config: captionStyle.config })
          update((p) => void (p.captionStyle.templateId = tpl.id))
          toast.success(`Saved "${tpl.name}"`)
          await load()
        }}
      />
      <NameDialog
        open={pending?.kind === 'variant'}
        title="Create variant"
        description={
          pending?.kind === 'variant' && pending.from
            ? pending.from.id === captionStyle.templateId
              ? `A new template based on “${pending.from.name}”, using the current settings.`
              : `A copy of “${pending.from.name}” that remembers where it came from.`
            : `A new ${style.name} variant using the current settings.`
        }
        initial={pending?.kind === 'variant' && pending.from ? `${pending.from.name} variant` : `${style.name} variant`}
        confirm="Create variant"
        onClose={() => setPending(null)}
        onSubmit={async (name) => {
          const from = pending?.kind === 'variant' ? pending.from : null
          const tpl =
            from && from.id !== captionStyle.templateId
              ? await api.duplicateTemplate(from.id, true, name)
              : await api.createTemplate({ name, styleId: captionStyle.styleId, config: captionStyle.config, parentId: from?.id ?? null })
          if (!from || from.id === captionStyle.templateId) update((p) => void (p.captionStyle.templateId = tpl.id))
          toast.success(`Created "${tpl.name}"`)
          await load()
        }}
      />
      <NameDialog
        open={pending?.kind === 'rename'}
        title="Rename template"
        description="Projects using this template keep their settings."
        initial={pending?.kind === 'rename' ? pending.template.name : ''}
        confirm="Rename"
        onClose={() => setPending(null)}
        onSubmit={async (name) => {
          if (pending?.kind !== 'rename') return
          await api.updateTemplate(pending.template.id, { name })
          await load()
        }}
      />
    </div>
  )
}
