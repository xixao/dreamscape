'use client';
import {Check, MousePointer2} from 'lucide-react';
import {CURSORS,CURSOR_SIZES,cursorValue,parseCursorSize} from '@/lib/ui-cursor';
import {useUICursor} from './cursor-provider';
import {PANEL} from '@/components/workbench/chrome';
import {SegmentedControl,SegmentedItem} from '@/components/workbench/segmented-control';
import {cn} from '@/lib/utils';
export function CursorSettings(){
 const {selected,size,ready,error,select,setSize}=useUICursor();
 return <section aria-labelledby="cursor-heading" className="mt-10 border-t border-border pt-8">
  <h2 id="cursor-heading" className="text-lg font-semibold">Cursors</h2>
  <p className="mt-2 text-sm text-t2">Choose a little personality for your pointer. Hover over a preview to try it, then select to apply.</p>
  <p className="mt-1 text-xs text-muted-foreground">Saved in this browser. Text editing, resizing, and canvas tools keep their familiar cursors.</p>
  {error&&<p role="alert" className="mt-3 text-bad">{error}</p>}
  <div className="mt-5 flex flex-wrap items-center gap-3 text-sm"><span id="cursor-size-label" className="font-medium">Cursor size</span><SegmentedControl aria-labelledby="cursor-size-label" value={String(size)} onValueChange={value=>{if(value)setSize(parseCursorSize(value));}} disabled={!ready}>{CURSOR_SIZES.map(option=><SegmentedItem key={option.size} value={String(option.size)}>{option.name}</SegmentedItem>)}</SegmentedControl><span className="text-xs text-muted-foreground">{size} px</span></div>
  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{CURSORS.map(item=><button key={item.id} type="button" disabled={!ready} aria-label={`Use ${item.name} cursor`} aria-pressed={selected===item.id} onClick={()=>select(item.id)} className={cn(PANEL,'overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-ring',selected===item.id&&'ring-2 ring-ring')} style={{cursor:cursorValue(item.id,size)}}>
   <div className="grid h-28 grid-cols-2" aria-hidden="true">{['#f5f4f8','#191720'].map(background=><div key={background} className="flex items-center justify-center" style={{background}}>{item.id==='default'?<MousePointer2 size={32} fill="white" stroke="#191720"/>:<img src={`/cursors/${item.id}-${size}.png`} width={size} height={size} alt=""/>}</div>)}</div>
   <span className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm font-medium">{item.name}{selected===item.id&&<Check size={16} aria-label="Active"/>}</span>
  </button>)}</div>
 </section>;
}
