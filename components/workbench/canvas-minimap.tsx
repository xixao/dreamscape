'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { capturePointer, releasePointer, isEditableTarget } from '@/lib/dom';
import { Map as MapIcon } from 'lucide-react';
import { useCanvasViewport } from './canvas';
import { useSections } from './sections/section-context';
import { frameRect, type FrameRect } from '@/lib/canvas/viewport';
import { SECTION_COLORS } from '@/lib/canvas/sections';

const KEY = 'dreamscape:minimap-visible';
const WIDTH = 240, HEIGHT = 150;

/** Fit the objects and visible canvas together, with a constant SVG aspect ratio. */
export function minimapBounds(objects: FrameRect[], visible: FrameRect): FrameRect {
  const boxes = [...objects, visible].filter(b => [b.x,b.y,b.width,b.height].every(Number.isFinite));
  const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x+b.width)), bottom = Math.max(...boxes.map(b => b.y+b.height));
  const width = Math.max(320, right-left, (bottom-top)*WIDTH/HEIGHT)*1.12;
  const height = width*HEIGHT/WIDTH;
  return { x:(left+right-width)/2, y:(top+bottom-height)/2, width, height };
}

export function CanvasMinimap({ children, floating, onDismiss }: { children?: ReactNode; floating?: {x:number;y:number}; onDismiss?: () => void }) {
  const { viewport, viewportSize, setViewport } = useCanvasViewport();
  const content = useSections();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY)==='true'; } catch { return false; } });
  const [frozen, setFrozen] = useState<FrameRect|null>(null);
  const drag = useRef<{ id:number; offsetX:number; offsetY:number; bounds:FrameRect; width:number; height:number }|null>(null);
  const visible = { x:-viewport.x/viewport.zoom, y:-viewport.y/viewport.zoom, width:viewportSize.width/viewport.zoom, height:viewportSize.height/viewport.zoom };
  const sections = content?.sections ?? [];
  const frames = (content?.screens ?? []).map(screen => ({ ...frameRect(screen, content?.heights), id:screen.id, name:screen.name }));
  const nodes = content?.diagramNodes ?? [];
  const bounds = frozen ?? minimapBounds([...sections,...frames,...nodes], visible);
  // End the gesture before releasing capture: lostpointercapture can fire
  // synchronously, and a floating map unmounts as soon as it is dismissed.
  const finishDrag = (element: SVGSVGElement, pointerId: number) => {
    if (drag.current?.id !== pointerId) return;
    drag.current = null;
    releasePointer(element, pointerId);
    setFrozen(null);
    onDismiss?.();
  };
  const panTo = (left: number, top: number) => {
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    setViewport(current => {
      const x = -left * current.zoom, y = -top * current.zoom;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return current;
      return current.x === x && current.y === y ? current : {...current, x, y};
    });
  };
  const toggle = () => setOpen(previous => { const next=!previous; try { localStorage.setItem(KEY,String(next)); } catch {} return next; });
  const map = <svg role="application" aria-label="Canvas minimap" tabIndex={0}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} className="block w-full touch-none select-none rounded-md border border-line-soft bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={{aspectRatio:`${WIDTH}/${HEIGHT}`,cursor:frozen?'grabbing':'crosshair'}}
      onPointerDown={event => {
        if(event.button!==0 || drag.current) return;
        event.preventDefault(); event.stopPropagation();
        const rect=event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const x=bounds.x+(event.clientX-rect.left)/rect.width*bounds.width, y=bounds.y+(event.clientY-rect.top)/rect.height*bounds.height;
        const inside=x>=visible.x&&x<=visible.x+visible.width&&y>=visible.y&&y<=visible.y+visible.height;
        const offsetX=inside?x-visible.x:visible.width/2, offsetY=inside?y-visible.y:visible.height/2;
        drag.current={id:event.pointerId,offsetX,offsetY,bounds,width:visible.width,height:visible.height};setFrozen(bounds);
        capturePointer(event.currentTarget, event.pointerId);
        panTo(x-offsetX,y-offsetY);
      }}
      onPointerMove={event=>{
        const session=drag.current;if(!session||session.id!==event.pointerId)return;
        event.stopPropagation();
        if (event.buttons === 0) { finishDrag(event.currentTarget,event.pointerId);return; }
        const rect=event.currentTarget.getBoundingClientRect(), box=session.bounds;
        if (rect.width <= 0 || rect.height <= 0) return;
        // Pointer capture deliberately continues outside the SVG. Never extrapolate
        // that pointer into unbounded canvas coordinates or grow the map on release.
        const x=box.x+Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*box.width;
        const y=box.y+Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))*box.height;
        const left=Math.max(box.x,Math.min(box.x+box.width-session.width,x-session.offsetX));
        const top=Math.max(box.y,Math.min(box.y+box.height-session.height,y-session.offsetY));
        panTo(left,top);
      }}
      onPointerUp={event=>{event.stopPropagation();finishDrag(event.currentTarget,event.pointerId);}}
      onPointerCancel={event=>{event.stopPropagation();finishDrag(event.currentTarget,event.pointerId);}}
      onLostPointerCapture={event=>{event.stopPropagation();finishDrag(event.currentTarget,event.pointerId);}}
      onKeyDown={event=>{const directions:Record<string,[number,number]>={ArrowLeft:[1,0],ArrowRight:[-1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};const direction=directions[event.key];if(!direction)return;event.preventDefault();event.stopPropagation();const amount=event.shiftKey?200:50;setViewport(current=>({...current,x:current.x+direction[0]*amount,y:current.y+direction[1]*amount}));}}>
      {sections.map(section=><g key={section.id}><rect {...{x:section.x,y:section.y,width:section.width,height:section.height}} fill={SECTION_COLORS[section.color??'violet'].value} fillOpacity="0.15" stroke={SECTION_COLORS[section.color??'violet'].value} vectorEffect="non-scaling-stroke"/><title>{section.name}</title></g>)}
      {frames.map(frame=><rect key={frame.id} x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="var(--muted-foreground)" fillOpacity="0.3" stroke="var(--muted-foreground)" vectorEffect="non-scaling-stroke"><title>{frame.name}</title></rect>)}
      {nodes.map(node=><rect key={node.id} x={node.x} y={node.y} width={node.width} height={node.height} rx={bounds.width/240*2} fill="var(--muted-foreground)" fillOpacity="0.55" />)}
      <rect data-minimap-viewport x={visible.x} y={visible.y} width={visible.width} height={visible.height} fill="var(--acc)" fillOpacity="0.1" stroke="var(--acc)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>;
  if (floating) return createPortal(<div data-cursor-minimap style={{position:'fixed',left:floating.x,top:floating.y,width:260,padding:8,zIndex:100}} className="rounded-xl border border-line-soft bg-card text-foreground shadow-xl" onPointerDown={event=>event.stopPropagation()}>{map}</div>,document.body);
  return <div className="shrink-0 border-b border-line-soft p-3">
    <div className="flex items-center gap-2"><div className="min-w-0 flex-1">{children}</div>
      <button type="button" aria-label={open?'Hide minimap':'Show minimap'} title={open?'Hide minimap':'Show minimap'} aria-pressed={open} onClick={toggle}
        className={`flex size-8 shrink-0 items-center justify-center rounded-md transition-colors ${open?'bg-accent text-foreground':'text-muted-foreground hover:bg-accent hover:text-foreground'}`}><MapIcon className="size-4" /></button>
    </div>
    {open && <div className="mt-3">{map}</div>}
  </div>;
}


/** Lives outside Layers so the shortcut also works when that panel is collapsed. */
export function CursorMinimap({ enabled = true }: { enabled?: boolean }) {
  const [point,setPoint]=useState<{x:number;y:number}|null>(null);
  const pointer=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>{
    if (!enabled) return;
    const cleanups=new Map<Document,()=>void>();
    const track=(doc:Document,frame?:HTMLIFrameElement)=>{
      if(cleanups.has(doc))return;
      const move=(event:PointerEvent)=>{
        const rect=frame?.getBoundingClientRect();
        pointer.current=rect&&frame?{x:rect.left+event.clientX*rect.width/(frame.clientWidth||rect.width),y:rect.top+event.clientY*rect.height/(frame.clientHeight||rect.height)}:{x:event.clientX,y:event.clientY};
      };
      const key=(event:KeyboardEvent)=>{
        if(event.key==='Escape'){setPoint(null);return;}
        if(!(event.metaKey||event.ctrlKey)||event.shiftKey||event.altKey||event.key.toLowerCase()!=='m'||event.repeat||isEditableTarget(event.target))return;
        event.preventDefault();event.stopPropagation();
        const cursor=pointer.current??{x:window.innerWidth/2,y:window.innerHeight/2};
        setPoint({x:Math.max(8,Math.min(window.innerWidth-268,cursor.x-130)),y:Math.max(8,Math.min(window.innerHeight-177,cursor.y-84))});
      };
      doc.addEventListener('pointermove',move,true);doc.addEventListener('keydown',key,true);
      cleanups.set(doc,()=>{doc.removeEventListener('pointermove',move,true);doc.removeEventListener('keydown',key,true);});
    };
    const scan=()=>{track(document);document.querySelectorAll('iframe').forEach(frame=>{try{if(frame.contentDocument)track(frame.contentDocument,frame);}catch{}});};
    scan();const timer=setInterval(scan,250);
    const blur=()=>setPoint(null);window.addEventListener('blur',blur);
    return ()=>{clearInterval(timer);cleanups.forEach(cleanup=>cleanup());window.removeEventListener('blur',blur);};
  },[enabled]);
  return enabled&&point?<CanvasMinimap floating={point} onDismiss={()=>setPoint(null)} />:null;
}
