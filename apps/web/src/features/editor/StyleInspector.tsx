import { RotateCcw } from 'lucide-react'
import type {
  ActiveWordAnimation,
  BackgroundMode,
  CaptionStyleConfig,
  EmphasisAnimation,
  EmphasisStyle,
  EnterAnimation,
  ExitAnimation,
  SpeakerLabel,
  WordEnterAnimation,
} from '@captionforge/project-format'
import {
  EMPHASIS_ANIMATION_OPTIONS,
  EMPHASIS_STYLE_OPTIONS,
  FONT_OPTIONS,
  WORD_ENTER_OPTIONS,
  fontEntry,
  getCaptionStyle,
  speakerColor,
  speakersInTrack,
  styleConfigFor,
  type CaptionStyleDefinition,
  type InspectorSection,
} from '@captionforge/caption-styles'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useEditor } from '@/store/editor'
import { AnchorPicker, ColorField, Field, Section, SelectField, SliderField, SwitchField } from './fields'

type SetStyle = <K extends keyof CaptionStyleConfig>(key: K, value: CaptionStyleConfig[K]) => void
interface SectionProps {
  config: CaptionStyleConfig
  style: CaptionStyleDefinition
  set: SetStyle
}

const ACCENTS = ['#00E676', '#FFD60A', '#FF3B30', '#00B2FF', '#FF2D95', '#B388FF']
const pct = (v: number) => `${Math.round(v * 100)}%`
const ms = (v: number) => `${Math.round(v)}ms`
const times = (v: number) => `${v.toFixed(2)}×`
const WEIGHT_NAMES: Record<number, string> = { 400: 'Regular 400', 500: 'Medium 500', 600: 'Semibold 600', 700: 'Bold 700', 800: 'Extra bold 800', 900: 'Black 900' }

/** Keep a value that is not in this style's list selectable (e.g. from an older template). */
function withCurrent<T extends string>(options: { value: T; label: string }[], current: T) {
  return options.some((o) => o.value === current) ? options : [...options, { value: current, label: current }]
}

function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <Field label="">
      <div className="flex gap-1.5">
        {ACCENTS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            onClick={() => onChange(c)}
            className={`size-5 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring ${value.toUpperCase() === c ? 'ring-2 ring-foreground' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </Field>
  )
}

function FontField({ config }: { config: CaptionStyleConfig }) {
  const { setStyle } = useEditor.getState()
  return (
    <Field label="Font">
      <Select
        value={config.fontFamily}
        onValueChange={(v) => {
          const available = fontEntry(v)?.weights ?? [400]
          const weight = available.includes(config.fontWeight) ? config.fontWeight : available[available.length - 1]
          setStyle({ fontFamily: v, fontWeight: weight })
        }}
      >
        <SelectTrigger size="sm" className="w-full" aria-label="Font">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_OPTIONS.map((f) => (
            <SelectItem key={f.label} value={f.label} style={{ fontFamily: `"${f.family}"`, fontWeight: 700 }}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function WeightField({ config, set, label = 'Weight', value = config.fontWeight, onChange = (v: number) => set('fontWeight', v) }: {
  config: CaptionStyleConfig
  set: SetStyle
  label?: string
  value?: number
  onChange?: (v: number) => void
}) {
  const weights = fontEntry(config.fontFamily)?.weights ?? [400, 700, 800, 900]
  const options = [...new Set([...weights, value])].sort((a, b) => a - b)
  return (
    <SelectField label={label} value={String(value)} options={options.map((w) => ({ value: String(w), label: WEIGHT_NAMES[w] ?? String(w) }))} onChange={(v) => onChange(Number(v))} />
  )
}

function EffectSettings({ config, set }: { config: CaptionStyleConfig; set: SetStyle }) {
  if (config.activeAnimation === 'glow') {
    return <SliderField label="Glow" min={0.2} max={2} step={0.05} value={config.glowStrength} format={pct} onChange={(v) => set('glowStrength', v)} />
  }
  if (config.activeAnimation === 'underline') {
    return <SliderField label="Underline" min={0.03} max={0.2} step={0.005} value={config.underlineThickness} format={(v) => `${v.toFixed(3)}em`} onChange={(v) => set('underlineThickness', v)} />
  }
  if (config.activeAnimation === 'highlight' || config.activeAnimation === 'invert') {
    return (
      <>
        <SliderField label="Pill padding" min={0} max={0.4} step={0.01} value={config.pillPadding} format={(v) => `${v.toFixed(2)}em`} onChange={(v) => set('pillPadding', v)} />
        <SliderField label="Pill radius" min={0} max={0.5} step={0.01} value={config.pillRadius} format={(v) => `${v.toFixed(2)}em`} onChange={(v) => set('pillRadius', v)} />
      </>
    )
  }
  if (config.activeAnimation === 'shake') {
    return <SliderField label="Shake amount" min={0} max={1} step={0.05} value={config.shakeAmount} format={pct} onChange={(v) => set('shakeAmount', v)} />
  }
  return null
}

function ActiveModeField({ config, style, set }: SectionProps) {
  return (
    <SelectField<ActiveWordAnimation> label={style.activeLabel} value={config.activeAnimation} options={withCurrent(style.activeModes, config.activeAnimation)} onChange={(v) => set('activeAnimation', v)} />
  )
}

// ---------------------------------------------------------------------------
// Sections

function Typography({ config, set }: SectionProps) {
  return (
    <Section title="Typography">
      <FontField config={config} />
      <WeightField config={config} set={set} />
      <SliderField label="Font size" min={20} max={200} value={config.fontSize} unit="px" onChange={(v) => set('fontSize', v)} />
      <SliderField label="Tracking" min={-0.05} max={0.2} step={0.005} value={config.letterSpacing} format={(v) => `${v.toFixed(3)}em`} onChange={(v) => set('letterSpacing', v)} />
      <SliderField label="Line height" min={0.8} max={1.6} step={0.01} value={config.lineHeight} format={(v) => v.toFixed(2)} onChange={(v) => set('lineHeight', v)} />
      <Field label="Case">
        <ToggleGroup type="single" size="sm" variant="outline" aria-label="Case" value={config.textTransform} onValueChange={(v) => v && set('textTransform', v as CaptionStyleConfig['textTransform'])}>
          <ToggleGroupItem value="uppercase" aria-label="Uppercase" className="text-xs">AA</ToggleGroupItem>
          <ToggleGroupItem value="none" aria-label="As typed" className="text-xs">Aa</ToggleGroupItem>
          <ToggleGroupItem value="lowercase" aria-label="Lowercase" className="text-xs">aa</ToggleGroupItem>
        </ToggleGroup>
      </Field>
    </Section>
  )
}

function ColorSection({ config, set }: SectionProps) {
  return (
    <Section title="Color">
      <ColorField label="Normal" value={config.normalColor} onChange={(v) => set('normalColor', v)} />
      <ColorField label="Active word" value={config.activeColor} onChange={(v) => set('activeColor', v)} />
      <Swatches label="Active word color" value={config.activeColor} onChange={(c) => set('activeColor', c)} />
    </Section>
  )
}

function HighlightSection(props: SectionProps) {
  const { config, style, set } = props
  return (
    <Section title="Highlight">
      <ActiveModeField {...props} />
      <ColorField label="Normal" value={config.normalColor} onChange={(v) => set('normalColor', v)} />
      <ColorField label="Active color" value={config.activeColor} onChange={(v) => set('activeColor', v)} />
      <Swatches label="Active word color" value={config.activeColor} onChange={(c) => set('activeColor', c)} />
      <SliderField label={style.scaleLabel} min={style.scaleRange[0]} max={style.scaleRange[1]} step={0.01} value={config.popScale} format={times} onChange={(v) => set('popScale', v)} />
      <EffectSettings config={config} set={set} />
    </Section>
  )
}

function EmphasisSection(props: SectionProps) {
  const { config, style, set } = props
  const boxed = ['pill', 'block', 'marker'].includes(config.emphasisStyle)
  return (
    <Section title="Emphasis">
      <p className="text-[11px] text-muted-foreground">
        Mark words in the <strong>Caption</strong> tab as Important, Primary (strongest) or Secondary.
      </p>
      <ColorField label="Normal" value={config.normalColor} onChange={(v) => set('normalColor', v)} />
      <ColorField label="Accent color" value={config.activeColor} onChange={(v) => set('activeColor', v)} />
      <Swatches label="Accent color" value={config.activeColor} onChange={(c) => set('activeColor', c)} />
      <ColorField label="Secondary" value={config.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
      <SelectField<EmphasisStyle> label="Highlight type" value={config.emphasisStyle} options={EMPHASIS_STYLE_OPTIONS} onChange={(v) => set('emphasisStyle', v)} />
      {boxed && (
        <>
          <SliderField label="Highlight padding" min={0} max={0.4} step={0.01} value={config.pillPadding} format={(v) => `${v.toFixed(2)}em`} onChange={(v) => set('pillPadding', v)} />
          <SliderField label="Highlight radius" min={0} max={0.5} step={0.01} value={config.pillRadius} format={(v) => `${v.toFixed(2)}em`} onChange={(v) => set('pillRadius', v)} />
        </>
      )}
      {config.emphasisStyle === 'underline' && (
        <SliderField label="Underline" min={0.03} max={0.2} step={0.005} value={config.underlineThickness} format={(v) => `${v.toFixed(3)}em`} onChange={(v) => set('underlineThickness', v)} />
      )}
      <SliderField label="Primary size" min={1} max={1.6} step={0.01} value={config.emphasisScale} format={times} onChange={(v) => set('emphasisScale', v)} />
      <WeightField config={config} set={set} label="Primary weight" value={config.emphasisWeight} onChange={(v) => set('emphasisWeight', v)} />
      <SelectField<'static' | 'spoken'>
        label="Show emphasis"
        value={config.emphasisReveal}
        options={[
          { value: 'spoken', label: 'When the word is spoken' },
          { value: 'static', label: 'Whole time' },
        ]}
        onChange={(v) => set('emphasisReveal', v)}
      />
      {config.emphasisReveal === 'spoken' && (
        <SelectField<EmphasisAnimation> label="Animation" value={config.emphasisAnimation} options={EMPHASIS_ANIMATION_OPTIONS} onChange={(v) => set('emphasisAnimation', v)} />
      )}
      <ActiveModeField {...props} />
      {config.activeAnimation === 'pop' && (
        <SliderField label={style.scaleLabel} min={style.scaleRange[0]} max={style.scaleRange[1]} step={0.01} value={config.popScale} format={times} onChange={(v) => set('popScale', v)} />
      )}
    </Section>
  )
}

function PunchSection(props: SectionProps) {
  const { config, style, set } = props
  return (
    <Section title="Punch">
      <ColorField label="Primary color" value={config.normalColor} onChange={(v) => set('normalColor', v)} />
      <ColorField label="Accent color" value={config.activeColor} onChange={(v) => set('activeColor', v)} />
      <Swatches label="Accent color" value={config.activeColor} onChange={(c) => set('activeColor', c)} />
      <SelectField<WordEnterAnimation> label="Word entrance" value={config.wordEnterAnimation} options={WORD_ENTER_OPTIONS} onChange={(v) => set('wordEnterAnimation', v)} />
      <SliderField label="Entrance speed" min={80} max={500} step={10} value={config.wordEnterDurationMs} format={ms} onChange={(v) => set('wordEnterDurationMs', v)} />
      <SliderField label="Overshoot" min={1} max={1.3} step={0.01} value={config.overshoot} format={times} onChange={(v) => set('overshoot', v)} />
      <ActiveModeField {...props} />
      <SliderField label={style.scaleLabel} min={style.scaleRange[0]} max={style.scaleRange[1]} step={0.01} value={config.popScale} format={times} onChange={(v) => set('popScale', v)} />
      <EffectSettings config={config} set={set} />
      <SliderField label="Words per phrase" min={1} max={8} step={1} value={config.maxWords || 8} format={(v) => (v >= 8 ? 'Any' : String(v))} onChange={(v) => set('maxWords', v >= 8 ? 0 : v)} />
    </Section>
  )
}

function WordGroupSection(props: SectionProps) {
  const { config, set } = props
  return (
    <Section title="Word by word">
      <Field label="Group size">
        <ToggleGroup type="single" size="sm" variant="outline" aria-label="Word group size" value={String(config.wordGroupSize)} onValueChange={(v) => v && set('wordGroupSize', Number(v))}>
          {[
            ['1', '1'],
            ['2', '2'],
            ['3', '3'],
            ['0', 'Phrase'],
          ].map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} aria-label={value === '0' ? 'Phrase' : `${value} word${value === '1' ? '' : 's'}`} className="px-2 text-xs">
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <SelectField<WordEnterAnimation> label="Animation" value={config.wordEnterAnimation} options={WORD_ENTER_OPTIONS} onChange={(v) => set('wordEnterAnimation', v)} />
      <SliderField label="Speed" min={60} max={400} step={10} value={config.wordEnterDurationMs} format={ms} onChange={(v) => set('wordEnterDurationMs', v)} />
      <SliderField label="Overshoot" min={1} max={1.3} step={0.01} value={config.overshoot} format={times} onChange={(v) => set('overshoot', v)} />
      <ColorField label="Color" value={config.normalColor} onChange={(v) => set('normalColor', v)} />
      <ColorField label="Active color" value={config.activeColor} onChange={(v) => set('activeColor', v)} />
      <ActiveModeField {...props} />
      <SelectField<ExitAnimation> label="Exit" value={config.exitAnimation} options={withCurrent(props.style.exitOptions, config.exitAnimation)} onChange={(v) => set('exitAnimation', v)} />
      <p className="text-[11px] text-muted-foreground">With 1-word groups every word is on its own, so the active color applies to groups of 2+.</p>
    </Section>
  )
}

function SpeakerSection(props: SectionProps) {
  const { config, set } = props
  const project = useEditor((s) => s.project)!
  const { update } = useEditor.getState()
  const names = speakersInTrack(project)
  return (
    <Section title="Speakers">
      <SelectField<SpeakerLabel>
        label="Name label"
        value={config.speakerLabel}
        options={[
          { value: 'name', label: 'Name' },
          { value: 'name-icon', label: 'Name + icon' },
          { value: 'initials', label: 'Initials' },
          { value: 'none', label: 'None' },
        ]}
        onChange={(v) => set('speakerLabel', v)}
      />
      {config.speakerLabel !== 'none' && (
        <SliderField label="Label size" min={0.3} max={1} step={0.01} value={config.speakerLabelSize} format={(v) => `${v.toFixed(2)}em`} onChange={(v) => set('speakerLabelSize', v)} />
      )}
      <SwitchField label="Speaker colors" checked={config.useSpeakerColors} onChange={(v) => set('useSpeakerColors', v)} />
      {names.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No speakers yet. Set a speaker on each caption in the <strong>Caption</strong> tab (diarization will fill this in automatically later).
        </p>
      ) : (
        names.map((name) => (
          <ColorField
            key={name}
            label={name}
            value={speakerColor(project, name)}
            onChange={(color) =>
              update((p) => {
                const existing = p.speakers.find((s) => s.name === name)
                if (existing) existing.color = color
                else p.speakers.push({ name, color })
              }, `speaker-color:${name}`)
            }
          />
        ))
      )}
      <ActiveModeField {...props} />
    </Section>
  )
}

function LayoutSection({ config, set }: SectionProps) {
  return (
    <Section title="Layout">
      <AnchorPicker value={config.anchor} onChange={(v) => set('anchor', v)} />
      <SliderField label="X offset" min={-0.5} max={0.5} step={0.005} value={config.xOffset} format={pct} onChange={(v) => set('xOffset', v)} />
      <SliderField label="Y offset" min={-0.5} max={0.5} step={0.005} value={config.yOffset} format={pct} onChange={(v) => set('yOffset', v)} />
      <SliderField label="Max width" min={0.4} max={1} step={0.01} value={config.maxWidth} format={pct} onChange={(v) => set('maxWidth', v)} />
      <Field label="Max lines">
        <ToggleGroup type="single" size="sm" variant="outline" aria-label="Max lines" value={String(config.maxLines)} onValueChange={(v) => v && set('maxLines', Number(v))}>
          {[1, 2, 3].map((n) => (
            <ToggleGroupItem key={n} value={String(n)} aria-label={`${n} line${n > 1 ? 's' : ''}`} className="w-8 text-xs">
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <p className="text-[11px] text-muted-foreground">Y offset is measured upward. Captions always stay inside the safe area (Project tab).</p>
    </Section>
  )
}

function BackgroundFields({ config, style, set, simple = false }: SectionProps & { simple?: boolean }) {
  return (
    <>
      <SelectField<BackgroundMode> label="Background" value={config.background} options={withCurrent(style.backgroundOptions, config.background)} onChange={(v) => set('background', v)} />
      {config.background !== 'none' && (
        <>
          {!simple && <ColorField label="Background color" value={config.backgroundColor} onChange={(v) => set('backgroundColor', v)} />}
          <SliderField label="Background opacity" min={0} max={1} step={0.01} value={config.backgroundOpacity} format={pct} onChange={(v) => set('backgroundOpacity', v)} />
          {(config.background === 'soft' || config.background === 'bar') && !simple && (
            <SliderField label="Background radius" min={0} max={60} value={config.backgroundRadius} unit="px" onChange={(v) => set('backgroundRadius', v)} />
          )}
        </>
      )}
    </>
  )
}

function AppearanceSection(props: SectionProps) {
  const { config, set } = props
  return (
    <Section title="Appearance">
      <SwitchField label="Outline" checked={config.outline} onChange={(v) => set('outline', v)} />
      {config.outline && (
        <>
          <SliderField label="Outline width" min={0} max={10} step={0.5} value={config.outlineWidth} unit="px" onChange={(v) => set('outlineWidth', v)} />
          <ColorField label="Outline color" value={config.outlineColor} onChange={(v) => set('outlineColor', v)} />
        </>
      )}
      <SwitchField label="Shadow" checked={config.shadow} onChange={(v) => set('shadow', v)} />
      {config.shadow && (
        <>
          <SliderField label="Shadow blur" min={0} max={40} value={config.shadowBlur} unit="px" onChange={(v) => set('shadowBlur', v)} />
          <SliderField label="Shadow opacity" min={0} max={1} step={0.01} value={config.shadowOpacity} format={pct} onChange={(v) => set('shadowOpacity', v)} />
        </>
      )}
      <BackgroundFields {...props} />
    </Section>
  )
}

function AnimationSection(props: SectionProps) {
  const { config, style, set } = props
  const activeHere = style.sections.includes('color')
  return (
    <Section title="Animation">
      <SelectField<EnterAnimation> label="Enter" value={config.enterAnimation} options={withCurrent(style.enterOptions, config.enterAnimation)} onChange={(v) => set('enterAnimation', v)} />
      {activeHere && <ActiveModeField {...props} />}
      <SelectField<ExitAnimation> label="Exit" value={config.exitAnimation} options={withCurrent(style.exitOptions, config.exitAnimation)} onChange={(v) => set('exitAnimation', v)} />
      <SliderField label="Enter duration" min={0} max={600} step={10} value={config.enterDurationMs} format={ms} onChange={(v) => set('enterDurationMs', v)} />
      {config.activeAnimation !== 'off' && (
        <SliderField label="Active duration" min={80} max={500} step={10} value={config.activeDurationMs} format={ms} onChange={(v) => set('activeDurationMs', v)} />
      )}
      <SliderField label="Exit duration" min={0} max={600} step={10} value={config.exitDurationMs} format={ms} onChange={(v) => set('exitDurationMs', v)} />
      {activeHere && (config.activeAnimation === 'pop' || config.activeAnimation === 'bounce') && (
        <SliderField label={style.scaleLabel} min={style.scaleRange[0]} max={style.scaleRange[1]} step={0.01} value={config.popScale} format={times} onChange={(v) => set('popScale', v)} />
      )}
      {activeHere && <EffectSettings config={config} set={set} />}
    </Section>
  )
}

/** Minimal keeps a deliberately short control list. */
function SimpleSection(props: SectionProps) {
  const { config, set } = props
  const { setStyle } = useEditor.getState()
  return (
    <Section title="Minimal">
      <FontField config={config} />
      <WeightField config={config} set={set} />
      <SliderField label="Size" min={24} max={96} value={config.fontSize} unit="px" onChange={(v) => set('fontSize', v)} />
      <ColorField label="Color" value={config.normalColor} onChange={(v) => set('normalColor', v)} />
      <Field label="">
        <div className="flex gap-1.5">
          {[
            ['#FFFFFF', 'White'],
            ['#FFF4E0', 'Warm white'],
            ['#D9D9D9', 'Light gray'],
          ].map(([c, name]) => (
            <button
              key={c}
              type="button"
              aria-label={`Text color ${name}`}
              title={name}
              onClick={() => set('normalColor', c)}
              className={`size-5 rounded-full border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring ${config.normalColor.toUpperCase() === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>
      <SliderField label="Opacity" min={0.3} max={1} step={0.01} value={config.textOpacity} format={pct} onChange={(v) => set('textOpacity', v)} />
      <AnchorPicker value={config.anchor} onChange={(v) => set('anchor', v)} />
      <SliderField label="Max width" min={0.4} max={1} step={0.01} value={config.maxWidth} format={pct} onChange={(v) => set('maxWidth', v)} />
      <SwitchField label="Shadow" checked={config.shadow} onChange={(v) => set('shadow', v)} />
      <BackgroundFields {...props} simple />
      <SliderField
        label="Fade speed"
        min={150}
        max={500}
        step={10}
        value={config.enterDurationMs}
        format={ms}
        onChange={(v) => setStyle({ enterDurationMs: v, exitDurationMs: v }, 'style:fade')}
      />
      <SelectField<ActiveWordAnimation> label="Active word" value={config.activeAnimation} options={withCurrent(props.style.activeModes, config.activeAnimation)} onChange={(v) => set('activeAnimation', v)} />
      {config.activeAnimation === 'none' && <ColorField label="Active color" value={config.activeColor} onChange={(v) => set('activeColor', v)} />}
    </Section>
  )
}

const SECTIONS: Record<InspectorSection, (p: SectionProps) => React.ReactNode> = {
  typography: Typography,
  color: ColorSection,
  highlight: HighlightSection,
  emphasis: EmphasisSection,
  punch: PunchSection,
  wordGroup: WordGroupSection,
  speaker: SpeakerSection,
  layout: LayoutSection,
  appearance: AppearanceSection,
  animation: AnimationSection,
  simple: SimpleSection,
}

export function StyleInspector() {
  const config = useEditor((s) => s.project!.captionStyle.config)
  const styleId = useEditor((s) => s.project!.captionStyle.styleId)
  const { setStyle } = useEditor.getState()
  const set: SetStyle = (key, value) => setStyle({ [key]: value } as Partial<CaptionStyleConfig>, `style:${key}`)
  const style = getCaptionStyle(styleId)

  return (
    <>
      <Section
        title={style.name}
        action={
          <Button size="xs" variant="ghost" onClick={() => setStyle(styleConfigFor(styleId, config.fontFamily, styleId), 'style:reset')} aria-label={`Reset ${style.name} to defaults`}>
            <RotateCcw /> Reset
          </Button>
        }
      >
        <p className="text-xs text-muted-foreground">{style.description}</p>
      </Section>
      {style.sections.map((id) => {
        const Component = SECTIONS[id]
        return <Component key={id} config={config} style={style} set={set} />
      })}
    </>
  )
}
