'use client';

import { Eye, EyeOff, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { BorderSettings } from '@/components/blocks/design-controls';
import { Field } from './field';
import { SpacingInput } from './spacing-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LABEL } from '../chrome';

export function BorderControl({ value, onChange }: { value?: BorderSettings; onChange: (value: BorderSettings) => void }) {
  const b = value ?? { width: 0 };
  const update = (patch: Partial<BorderSettings>) => onChange({ ...b, ...patch });
  const enabled = b.width > 0 || (b.sides === 'custom' && [b.top, b.right, b.bottom, b.left].some(v => (v ?? 0) > 0));
  const icon = 'flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground';
  return <fieldset className="min-w-0 space-y-2" aria-label="Border">
    <div className="flex items-center justify-between"><span className={LABEL}>Border</span>{!enabled && <button type="button" aria-label="Add border" className={icon} onClick={() => update({ width: 1, visible: true, sides: 'all' })}><Plus className="size-4" /></button>}</div>
    {enabled && <>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 [&_label]:sr-only [&_[data-field]]:gap-0"><Field field={{ prop: 'borderColor', label: 'Border color', kind: 'color', section: 'Style' }} value={b.color} breakpoint="desktop" onChange={color => update({ color: String(color) })} /></div>
        <label className="flex h-8 w-16 shrink-0 items-center rounded-md border px-1 text-xs"><span className="sr-only">Border opacity</span><input aria-label="Border opacity" type="number" min={0} max={100} value={b.opacity ?? 100} className="w-full min-w-0 bg-transparent outline-none" onChange={e => { if (e.target.value !== '') update({ opacity: Math.max(0, Math.min(100, Number(e.target.value))) }); }} /><span>%</span></label>
        <button type="button" className={icon} aria-label={b.visible === false ? 'Show border' : 'Hide border'} onClick={() => update({ visible: b.visible === false })}>{b.visible === false ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
        <button type="button" className={icon} aria-label="Remove border" onClick={() => update({ width: 0, top: 0, right: 0, bottom: 0, left: 0 })}><Minus className="size-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0"><SpacingInput id="border-thickness" label="Border thickness" value={b.width} options={[0, 1, 2, 4, 8].map(value => ({ value, label: `${value}px` }))} onChange={width => update({ width })} /></div>
        <Select value={b.sides ?? 'all'} onValueChange={sides => update({ sides: sides as BorderSettings['sides'] })}><SelectTrigger aria-label="Border sides" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['all', 'top', 'right', 'bottom', 'left', 'custom'].map(side => <SelectItem key={side} value={side}>{side === 'all' ? 'All sides' : side[0].toUpperCase() + side.slice(1)}</SelectItem>)}</SelectContent></Select>
      </div>
      {b.sides === 'custom' && <div className="grid grid-cols-2 gap-2">{(['top', 'right', 'bottom', 'left'] as const).map(side => <label key={side} className="min-w-0 text-xs text-muted-foreground"><span className="mb-1 block capitalize">{side}</span><SpacingInput id={`border-${side}`} label={`Border ${side}`} value={b[side] ?? b.width} options={[0, 1, 2, 4, 8].map(value => ({ value, label: `${value}px` }))} onChange={width => update({ [side]: width })} /></label>)}</div>}
      <details><summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground"><SlidersHorizontal className="size-3" />Border style</summary><div className="mt-2"><Select value={b.style ?? 'solid'} onValueChange={style => update({ style: style as BorderSettings['style'] })}><SelectTrigger aria-label="Border style" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{['solid', 'dashed', 'dotted'].map(style => <SelectItem key={style} value={style}>{style[0].toUpperCase() + style.slice(1)}</SelectItem>)}</SelectContent></Select></div></details>
    </>}
  </fieldset>;
}
