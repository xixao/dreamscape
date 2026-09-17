'use client';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { nanoid } from 'nanoid';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { capturePointer } from '@/lib/dom';
import { toCanvasPoint, type Viewport } from '@/lib/canvas/viewport';
import { containsRect, SECTION_COLORS, fitSectionObjects, sectionFrames, translateSection, type CanvasSection, type FramePosition } from '@/lib/canvas/sections';
import { useSections } from './section-context';

export function SectionLayer({zoom,onPreview,onDiagramPreview,panActive,interactive=true}:{interactive?:boolean;zoom:number;onPreview:(positions:FramePosition[])=>void;onDiagramPreview?:(positions:FramePosition[])=>void;panActive:boolean}){
  const context=useSections();
  const [draft,setDraft]=useState<CanvasSection|null>(null);
  const [nestedPreview,setNestedPreview]=useState<CanvasSection[]>([]);
  const [renaming,setRenaming]=useState<string|null>(null);
  const [name,setName]=useState('');
  const gesture=useRef<{id:number;x:number;y:number;section:CanvasSection;resize:boolean;corner:string;members:ReturnType<typeof sectionFrames>;next:CanvasSection;positions:FramePosition[];diagramPositions:FramePosition[];nodes:NonNullable<typeof context>["diagramNodes"];nested:CanvasSection[]}|null>(null);
  const cancel=useCallback(()=>{gesture.current=null;setDraft(null);setNestedPreview([]);onPreview([]);onDiagramPreview?.([]);},[onPreview,onDiagramPreview]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};window.addEventListener('blur',cancel);window.addEventListener('keydown',key);return()=>{window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);};},[cancel]);
  if(!context)return null;
  function begin(e:PointerEvent,section:CanvasSection,corner=''){
    if(e.button!==0||panActive)return;
    e.preventDefault();e.stopPropagation();capturePointer(e.currentTarget,e.pointerId);context!.select(section.id);
    gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,section,resize:!!corner,corner,members:sectionFrames(section,[section],context!.screens,context!.heights),next:section,positions:[],diagramPositions:[],nodes:context!.diagramNodes?.filter(node=>containsRect(section,node)),nested:context!.sections.filter(s=>s.id!==section.id&&containsRect(section,s))};
  }
  function move(e:PointerEvent){
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;e.stopPropagation();
    const dx=Math.round((e.clientX-g.x)/zoom),dy=Math.round((e.clientY-g.y)/zoom);
    if(g.resize){
      const left=g.corner.includes('w'),top=g.corner.includes('n');
      const width=Math.min(100000,Math.max(160,g.section.width+(left?-dx:g.corner.includes('e')?dx:0))),height=Math.min(100000,Math.max(120,g.section.height+(top?-dy:g.corner.includes('s')?dy:0)));
      g.next={...g.section,width,height,x:g.section.x+(left?g.section.width-width:0),y:g.section.y+(top?g.section.height-height:0)};
    }else{const moved=translateSection(g.section,g.members,dx,dy);g.next=moved.section;g.positions=moved.positions;onPreview(g.positions);g.diagramPositions=(g.nodes??[]).map(n=>({id:n.id,x:n.x+dx,y:n.y+dy}));onDiagramPreview?.(g.diagramPositions);setNestedPreview(g.nested.map(s=>({...s,x:s.x+dx,y:s.y+dy})));}
    setDraft({...g.next});
  }
  function end(e:PointerEvent){const g=gesture.current;if(!g||g.id!==e.pointerId)return;e.stopPropagation();if(JSON.stringify(g.next)!==JSON.stringify(g.section))context!.commit({sections:context!.sections.map(s=>s.id===g.next.id?g.next:!g.resize&&g.nested.some(n=>n.id===s.id)?{...s,x:s.x+g.next.x-g.section.x,y:s.y+g.next.y-g.section.y}:s),positions:g.positions,diagramPositions:g.diagramPositions});cancel();}
  function rename(section:CanvasSection){const trimmed=name.trim();if(trimmed&&trimmed!==section.name)context!.commit({sections:context!.sections.map(s=>s.id===section.id?{...s,name:trimmed}:s),positions:[]});setRenaming(null);}
  // The gesture ref is only read by pointer handlers; this map only creates JSX.
  // eslint-disable-next-line react-hooks/refs
  return <>{context.sections.map(original=>{
    const section=draft?.id===original.id?draft:nestedPreview.find(s=>s.id===original.id)??original;const selected=context.selected===section.id;
    const color=section.color?SECTION_COLORS[section.color]:undefined;
    const fitBounds=fitSectionObjects(original,context.sections,context.screens,context.diagramNodes??[],context.heights);
    return <div data-section data-testid={`section-${section.id}`} key={section.id} className={`absolute rounded-xl border ${selected?'border-acc bg-acc/10':'border-white/15 bg-white/[0.035]'}`} style={{left:section.x,top:section.y,width:section.width,height:section.height,backgroundColor:color?`${color.value}1a`:undefined,borderColor:!selected?color?.value:undefined,borderWidth:1/zoom,pointerEvents:interactive?'auto':'none'}} onPointerDown={e=>{if(e.target===e.currentTarget&&e.button===0&&!panActive){begin(e,original);}}} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}>
      <div data-testid={`section-label-${section.id}`} className="absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-md border border-line-soft bg-card p-1 text-foreground shadow-sm" style={{backgroundColor:color?.value,color:color?.foreground,borderColor:color?.value,transform:`scale(${1/zoom})`,transformOrigin:'bottom left'}}>
        {renaming===section.id?<input autoFocus aria-label="Section name" maxLength={80} value={name} onChange={e=>setName(e.target.value)} onBlur={()=>rename(original)} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')rename(original);if(e.key==='Escape')setRenaming(null);}} className="w-48 rounded bg-muted px-2 py-1 text-xs outline-none"/>:<button aria-label={`Select section ${section.name}`} className="flex max-w-64 cursor-grab touch-none items-center gap-2 px-2 py-1 text-xs font-medium active:cursor-grabbing" onPointerDown={e=>begin(e,original)} onPointerMove={e=>move(e)} onPointerUp={e=>end(e)} onPointerCancel={()=>cancel()} onDoubleClick={()=>{setName(section.name);setRenaming(section.id);}}><span className="truncate">{section.name}</span></button>}
        <DropdownMenu><DropdownMenuTrigger asChild><button aria-label={`Section options for ${section.name}`} className="rounded p-1 hover:bg-black/10" onPointerDown={e=>e.stopPropagation()}><MoreHorizontal className="size-3.5"/></button></DropdownMenuTrigger><DropdownMenuContent className="w-64" align="start">
          <DropdownMenuItem onSelect={()=>{setName(section.name);setRenaming(section.id);}}>Rename</DropdownMenuItem>
          <DropdownMenuItem disabled={!fitBounds} onSelect={()=>{const bounds=fitBounds;if(bounds)context.commit({sections:context.sections.map(s=>s.id===section.id?{...s,...bounds}:s),positions:[]});}}>Resize to Fit</DropdownMenuItem>
          {context.moveToPage && <DropdownMenuSub><DropdownMenuSubTrigger>Move to page</DropdownMenuSubTrigger><DropdownMenuSubContent>
            {context.pages?.filter(page => page.id !== context.pageId).map(page => <DropdownMenuItem key={page.id} onSelect={() => context.moveToPage?.(original, page.id)}>{page.name}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={(context.pages?.length ?? 0) >= 50} onSelect={() => context.moveToPage?.(original, '__new__')}>New Page</DropdownMenuItem>
          </DropdownMenuSubContent></DropdownMenuSub>}
          <DropdownMenuItem onSelect={()=>{context.remove(original);}}>Remove Section (keep objects)</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={()=>context.remove(original,true)}>Delete</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </div>
      {selected&&(['n','e','s','w'] as const).map(side=>{
        const horizontal=side==='n'||side==='s';
        const label={n:'top',e:'right',s:'bottom',w:'left'}[side];
        return <div key={side} role="separator" tabIndex={0} aria-label={`Resize section ${label}`} aria-orientation={horizontal?'horizontal':'vertical'} aria-valuetext={`${section.width} × ${section.height}`} className="absolute touch-none" style={{
          left:horizontal?5/zoom:side==='w'?-5/zoom:undefined,
          right:horizontal?5/zoom:side==='e'?-5/zoom:undefined,
          top:horizontal?(side==='n'?-5/zoom:undefined):5/zoom,
          bottom:horizontal?(side==='s'?-5/zoom:undefined):5/zoom,
          width:horizontal?undefined:10/zoom,height:horizontal?10/zoom:undefined,
          cursor:horizontal?'ns-resize':'ew-resize',
        }} onPointerDown={e=>begin(e,original,side)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onKeyDown={e=>{
          const direction=horizontal?(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0):(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0);
          if(!direction)return;e.preventDefault();e.stopPropagation();
          const delta=direction*(e.shiftKey?10:1),leading=side==='n'||side==='w';
          const dimension=horizontal?'height':'width',position=horizontal?'y':'x';
          const size=Math.min(100000,Math.max(horizontal?120:160,original[dimension]+(leading?-delta:delta)));
          const next={...original,[dimension]:size,[position]:original[position]+(leading?original[dimension]-size:0)};
          context.commit({sections:context.sections.map(s=>s.id===section.id?next:s),positions:[]});
        }}/>;
      })}
      {selected&&['nw','ne','sw','se'].map(corner=><div key={corner} role="separator" tabIndex={0} aria-label={`Resize section ${corner}`} aria-valuetext={`${section.width} × ${section.height}`} className="absolute border border-acc bg-card" style={{width:10/zoom,height:10/zoom,left:corner.includes('w')?-5/zoom:undefined,right:corner.includes('e')?-5/zoom:undefined,top:corner.includes('n')?-5/zoom:undefined,bottom:corner.includes('s')?-5/zoom:undefined,cursor:corner==='nw'||corner==='se'?'nwse-resize':'nesw-resize'}} onPointerDown={e=>begin(e,original,corner)} onPointerMove={e=>move(e)} onPointerUp={e=>end(e)} onPointerCancel={()=>cancel()} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?10:1;const next={...original,width:Math.max(160,original.width+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)),height:Math.max(120,original.height+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0))};context.commit({sections:context.sections.map(s=>s.id===section.id?next:s),positions:[]});}}/>)}
    </div>;
  })}</>;
}
export function SectionDrawSurface({viewport,panActive}:{viewport:Viewport;panActive:boolean}){
  const context=useSections();const [box,setBox]=useState<{x:number;y:number;width:number;height:number}|null>(null);
  const start=useRef<{id:number;x:number;y:number}|null>(null);
  if(!context?.drawing)return null;
  const point=(e:PointerEvent)=>{const r=e.currentTarget.getBoundingClientRect();return toCanvasPoint({x:e.clientX-r.left,y:e.clientY-r.top},viewport);};
  return <div data-testid="section-draw-surface" className="absolute inset-0 z-20 cursor-crosshair" style={{pointerEvents:panActive?'none':undefined}} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();capturePointer(e.currentTarget,e.pointerId);start.current={id:e.pointerId,...point(e)};setBox(null);}} onPointerMove={e=>{if(!start.current||start.current.id!==e.pointerId)return;const p=point(e);setBox({x:Math.round(Math.min(start.current.x,p.x)),y:Math.round(Math.min(start.current.y,p.y)),width:Math.round(Math.abs(p.x-start.current.x)),height:Math.round(Math.abs(p.y-start.current.y))});}} onPointerUp={e=>{
    if(start.current?.id!==e.pointerId)return;e.stopPropagation();
    const p=point(e),b=box??{x:Math.round(p.x),y:Math.round(p.y),width:800,height:600};
    const section={id:nanoid(10),name:`Section ${context.sections.length+1}`,...b,width:Math.max(160,b.width),height:Math.max(120,b.height)};
    context.commit({sections:[...context.sections,section],positions:[]});context.select(section.id);context.setDrawing(false);start.current=null;setBox(null);
  }} onPointerCancel={()=>{start.current=null;setBox(null);}}>
    <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-md border border-line-soft bg-card px-3 py-2 text-xs shadow-panel-lg">Drag around frames to create a section · Esc to cancel</div>
    {box&&<div className="pointer-events-none absolute rounded-lg border border-acc bg-acc/10" style={{left:viewport.x+box.x*viewport.zoom,top:viewport.y+box.y*viewport.zoom,width:box.width*viewport.zoom,height:box.height*viewport.zoom}}/>}
  </div>;
}
