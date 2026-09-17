'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useSections } from './section-context';
import { sectionFrames } from '@/lib/canvas/sections';
export function SectionsList() {
  const context=useSections();
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  if(!context?.sections.length)return null;
  return <div aria-label="Page sections" className="max-h-56 shrink-0 overflow-y-auto border-b border-line-soft px-2 py-2">
    <h3 className="px-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Sections</h3>
    {context.sections.map(section=><div key={section.id}>
      <div className={`flex items-center rounded hover:bg-muted ${context.selected===section.id?'bg-accent':''}`}>
        <button aria-label={`${collapsed.has(section.id)?'Expand':'Collapse'} section ${section.name}`} aria-expanded={!collapsed.has(section.id)} className="p-1" onClick={()=>setCollapsed(current=>{const next=new Set(current);if(next.has(section.id))next.delete(section.id);else next.add(section.id);return next;})}>{collapsed.has(section.id)?<ChevronRight className="size-3"/>:<ChevronDown className="size-3"/>}</button>
        <button aria-pressed={context.selected===section.id} onClick={()=>{context.select(section.id);context.zoomTo(section);}} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1.5 text-xs"><span className="truncate">{section.name}</span></button>
      </div>
      {!collapsed.has(section.id)&&sectionFrames(section,context.sections,context.screens,context.heights).map(frame=><button key={frame.id} className="block w-full truncate rounded py-1 pr-2 pl-8 text-left text-xs text-muted-foreground hover:bg-muted" onClick={()=>{context.select(null);context.focusFrame(frame.id);}}>{frame.name}</button>)}
    </div>)}
  </div>;
}
