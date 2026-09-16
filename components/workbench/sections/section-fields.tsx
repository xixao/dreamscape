'use client';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LABEL } from '../chrome';
import { Button } from '@/components/ui/button';
import { Field } from '../inspector/field';
import { SECTION_COLORS, type SectionColor, fitSectionObjects, type CanvasSection } from '@/lib/canvas/sections';
import { useSections } from './section-context';
export function SectionFields({section}:{section:CanvasSection}){
  const context=useSections()!;
  const [name,setName]=useState(section.name);
  const [previous,setPrevious]=useState(section.name);
  if(previous!==section.name){setPrevious(section.name);setName(section.name);}
  const fitBounds=fitSectionObjects(section,context.sections,context.screens,context.diagramNodes??[],context.heights);
  function update(patch:Partial<CanvasSection>){context.commit({sections:context.sections.map(s=>s.id===section.id?{...s,...patch}:s),positions:[]});}
  function rename(){const value=name.trim();if(value&&value!==section.name)update({name:value});else setName(section.name);}
  return <section className="space-y-4" aria-label="Section properties">
    <h3 className="text-[13px] font-semibold">Section</h3>
    <label className="flex flex-col gap-2 text-xs text-muted-foreground">Name<input aria-label="Section title" maxLength={80} value={name} onChange={e=>setName(e.target.value)} onBlur={rename} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')setName(section.name);}} className="rounded-md border border-line-soft bg-muted px-3 py-2 text-sm text-foreground"/></label>
    <div className="grid grid-cols-2 gap-3">{(['width','height'] as const).map(prop=><Field key={prop} field={{prop,label:prop==='width'?'Width':'Height',kind:'spacing',section:'Layout',integer:true,max:100000}} value={section[prop]} breakpoint="mobile" onChange={value=>update({[prop]:Math.max(prop==='width'?160:120,Number(value))})}/>)}</div>
    <div className="flex flex-col gap-1.5">
      <label htmlFor="section-highlight-color" className={LABEL}>Highlight color</label>
      <Select value={section.color ?? 'none'} onValueChange={value=>update({color:value==='none'?undefined:value as SectionColor})}>
        <SelectTrigger id="section-highlight-color" aria-label="Section highlight color" className="w-full"><SelectValue/></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {Object.entries(SECTION_COLORS).map(([key,color])=><SelectItem key={key} value={key}><span className="inline-flex items-center gap-2"><span aria-hidden className="size-4 rounded-sm border border-black/10" style={{backgroundColor:color.value}}/>{color.label}</span></SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <p className="text-xs text-muted-foreground">Canvas organization only.</p>
    <Button variant="outline" size="sm" disabled={!fitBounds} onClick={()=>{const bounds=fitBounds;if(bounds)update(bounds);}}>Resize to Fit</Button>
    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={()=>{context.remove(section);}}>Remove Section (keep objects)</Button>
    <Button variant="ghost" size="sm" className="text-destructive" onClick={()=>context.remove(section,true)}>Delete</Button>
  </section>;
}
