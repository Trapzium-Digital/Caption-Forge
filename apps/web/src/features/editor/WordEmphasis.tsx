import type { Cue, EmphasisLevel } from '@captionforge/project-format'
import { cueWords } from '@captionforge/captions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useEditor } from '@/store/editor'
import { Field } from './fields'

const LEVELS: { value: EmphasisLevel | 'normal'; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: '' },
  { value: 'important', label: 'Important', hint: 'Highlight type in the accent color' },
  { value: 'primary', label: 'Primary', hint: 'Strongest: larger, heavier and highlighted' },
  { value: 'secondary', label: 'Secondary', hint: 'Subtle secondary color' },
]

const CHIP: Record<EmphasisLevel | 'normal', string> = {
  normal: 'border-border text-foreground/80',
  important: 'border-primary/70 bg-primary/15 text-primary',
  primary: 'border-primary bg-primary text-primary-foreground font-semibold',
  secondary: 'border-sky-400/60 bg-sky-400/10 text-sky-300',
}

/** Mark individual words of a caption as Important / Primary / Secondary. */
export function WordEmphasis({ cue }: { cue: Cue }) {
  const { update } = useEditor.getState()
  const words = cueWords(cue)

  function setLevel(index: number, level: EmphasisLevel | 'normal') {
    update((p) => {
      for (const track of p.captionTracks) {
        const target = track.cues.find((c) => c.id === cue.id)
        if (!target) continue
        const next = { ...(target.emphasis ?? {}) }
        if (level === 'normal') delete next[String(index)]
        else next[String(index)] = level
        target.emphasis = Object.keys(next).length ? next : undefined
      }
    })
  }

  return (
    <Field label="Emphasis">
      <ul className="flex flex-wrap gap-1" aria-label="Words in this caption">
        {words.map((w, i) => {
          const level = cue.emphasis?.[String(i)] ?? 'normal'
          return (
            <li key={i}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`${w.text}: ${level}. Change emphasis`}
                  className={`rounded-md border px-1.5 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${CHIP[level]}`}
                >
                  {w.text}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>“{w.text}”</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={level} onValueChange={(v) => setLevel(i, v as EmphasisLevel | 'normal')}>
                  {LEVELS.map((l) => (
                    <DropdownMenuRadioItem key={l.value} value={l.value}>
                      <span>{l.label}</span>
                      {l.hint && <span className="ml-auto text-[10px] text-muted-foreground">{l.hint}</span>}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            </li>
          )
        })}
      </ul>
    </Field>
  )
}
