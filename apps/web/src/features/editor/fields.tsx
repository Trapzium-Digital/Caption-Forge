import type { ReactNode } from 'react'
import type { Anchor } from '@captionforge/project-format'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-border px-4 py-4 last:border-none">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <Label htmlFor={htmlFor} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Slider aria-label={label} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
        <span className="w-12 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {format ? format(value) : `${Math.round(value * 100) / 100}${unit}`}
        </span>
      </div>
    </Field>
  )
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input
          value={value}
          onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && onChange(e.target.value)}
          className="h-7 font-mono text-xs"
        />
      </div>
    </Field>
  )
}

export function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label}>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger size="sm" className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

const ANCHORS: Anchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

/** 9-point anchor grid. Arrow keys move the selection. */
export function AnchorPicker({ value, onChange }: { value: Anchor; onChange: (a: Anchor) => void }) {
  const index = ANCHORS.indexOf(value)
  const move = (e: React.KeyboardEvent) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key]
    if (delta === undefined) return
    e.preventDefault()
    const next = index + delta
    if (next < 0 || next > 8) return
    if (Math.abs(delta) === 1 && Math.floor(next / 3) !== Math.floor(index / 3)) return
    onChange(ANCHORS[next])
    ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
  }
  return (
    <Field label="Anchor">
      <div role="radiogroup" aria-label="Anchor" className="grid w-[84px] grid-cols-3 gap-1 rounded-md border border-input p-1">
        {ANCHORS.map((anchor, i) => (
          <button
            key={anchor}
            type="button"
            role="radio"
            aria-checked={value === anchor}
            aria-label={anchor.replace('-', ' ')}
            tabIndex={value === anchor ? 0 : -1}
            onKeyDown={move}
            onClick={() => onChange(anchor)}
            className="grid size-6 place-items-center rounded-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={`block rounded-full transition-all ${i === index ? 'size-2.5 bg-primary' : 'size-1.5 bg-muted-foreground/50'}`} />
          </button>
        ))}
      </div>
    </Field>
  )
}
