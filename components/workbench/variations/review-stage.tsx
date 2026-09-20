'use client';
import { panMomentum, type PanSample } from '@/lib/canvas/pan-momentum';
import { panBy, zoomAround, stepZoom, zoomTo, zoomToRect, type Viewport } from '@/lib/canvas/viewport';
import { Component, useEffect, useRef, useState } from 'react';
import { Editor, Frame, useNode } from '@craftjs/core';
import { resolver } from '@/components/blocks/registry';
import { StageProvider } from '../stage-context';
import { CanvasFrame } from '../canvas-frame';
import { AnnotationContent } from '../accessibility/annotation-content';
import { getBezierPath } from '@/lib/diagram/geometry';
import type { Snapshot, Variation } from '@/lib/variations/model';

class PreviewGuard extends Component<{children:React.ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<p role="alert" className="p-5 text-black">This generated design could not render. Choose another direction.</p>:this.props.children;}
}
type Rect = { x:number; y:number; width:number; height:number };
type Note = NonNullable<Variation['rationale']['annotations']>[number];
function ReviewNode({render}:{render:React.ReactElement}) {const {id}=useNode();return <div data-review-node={id} style={{display:'contents'}}>{render}</div>;}
export function InfiniteReviewCanvas({width,height,focus,children}:{width:number;height:number;focus?:{x:number;y:number;width:number;height:number;token:number};children:React.ReactNode}) {
 const ref=useRef<HTMLDivElement>(null);
 const drag=useRef<{id:number;x:number;y:number;samples:PanSample[]}|null>(null);
 const motion=useRef<number|null>(null);
 function stopMotion(){if(motion.current!==null)cancelAnimationFrame(motion.current);motion.current=null;}
 function release(releasedAt:number,coast=false){
   const d=drag.current;drag.current=null;setPanning(false);
   const m=coast&&d?panMomentum(d.samples,releasedAt):null;
   if(!m||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
   const start=releasedAt;let previous=0;
   const tick=(now:number)=>{const t=Math.min(1,(now-start)/m.duration),progress=1-Math.pow(1-t,3),delta=progress-previous;previous=progress;setViewport(v=>panBy(v,m.x*delta,m.y*delta));motion.current=t<1?requestAnimationFrame(tick):null;};
   motion.current=requestAnimationFrame(tick);
 }
 const space=useRef(false);
 const [panning,setPanning]=useState(false);
 const [spaceDown,setSpaceDown]=useState(false);
 const [viewport,setViewport]=useState<Viewport>({x:40,y:40,zoom:.5});
 const fitted=useRef(false);
 const bounds=useRef({width,height});
 useEffect(()=>{bounds.current={width,height};},[width,height]);
 useEffect(()=>{const root=ref.current;if(!root||!focus)return;stopMotion();const r=root.getBoundingClientRect();setViewport(zoomToRect(focus,{width:r.width,height:r.height},40));},[focus]);

 useEffect(()=>{
   const root=ref.current;if(!root)return;
   function fit(){const r=root!.getBoundingClientRect();setViewport(zoomToRect({x:0,y:0,...bounds.current},{width:r.width,height:r.height},40));}
   if(!fitted.current){fitted.current=true;fit();}
   function wheel(e:WheelEvent){stopMotion();e.preventDefault();const r=root!.getBoundingClientRect();setViewport(v=>e.ctrlKey||e.metaKey?zoomAround(v,{x:e.clientX-r.left,y:e.clientY-r.top},Math.exp(-e.deltaY*.01)):panBy(v,-e.deltaX,-e.deltaY));}
   function end(){drag.current=null;space.current=false;setSpaceDown(false);setPanning(false);}
   function key(e:KeyboardEvent){
     if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]'))return;
     if(e.key==='Escape'){stopMotion();end();return;}
     if(e.code==='Space'){e.preventDefault();space.current=true;setSpaceDown(true);return;}
     const r=root!.getBoundingClientRect(),point={x:r.width/2,y:r.height/2};
     if((e.metaKey||e.ctrlKey)&&['+','=','-','0'].includes(e.key)){e.preventDefault();stopMotion();setViewport(v=>e.key==='0'?zoomTo(v,point,1):stepZoom(v,point,e.key==='-'?'out':'in'));}
     if(e.shiftKey&&['Digit1','Digit2'].includes(e.code)){e.preventDefault();fit();}
   }
   function up(e:KeyboardEvent){if(e.code==='Space')end();}
   root.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',key);window.addEventListener('keyup',up);window.addEventListener('blur',end);
   return()=>{stopMotion();root.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key);window.removeEventListener('keyup',up);window.removeEventListener('blur',end);};
 },[]);
 return <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-canvas" aria-label="Variations canvas" style={{touchAction:'none',cursor:panning?'grabbing':spaceDown?'grab':undefined,backgroundImage:'radial-gradient(var(--text-faint, #45414f) 1px, transparent 1px)',backgroundSize:`${24*viewport.zoom}px ${24*viewport.zoom}px`,backgroundPosition:`${viewport.x}px ${viewport.y}px`}}
 onPointerDown={e=>{if(!(e.button===1||(e.button===0&&space.current)))return;e.preventDefault();stopMotion();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,samples:[{x:e.clientX,y:e.clientY,time:performance.now()}]};e.currentTarget.setPointerCapture(e.pointerId);setPanning(true);}}
 onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;const time=performance.now();d.samples=[...d.samples.filter(s=>time-s.time<=100),{x:e.clientX,y:e.clientY,time}];setViewport(v=>panBy(v,dx,dy));}}
 onPointerUp={()=>release(performance.now(),true)} onPointerCancel={()=>{drag.current=null;setPanning(false);}} onLostPointerCapture={()=>{drag.current=null;setPanning(false);}}>
 <div className="absolute left-0 top-0 origin-top-left" style={{width,height,transform:`translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`}}>
{children}</div></div>;
}
export function ReviewArtwork({snapshot,notes,onTarget,highlight}:{snapshot:Snapshot;notes:Note[];onTarget:(note:Note)=>void;highlight:string|null}) {
 const ref=useRef<HTMLDivElement>(null);
 const zoom=1;
 const [rects,setRects]=useState<Record<string,Rect>>({});
 const [hover,setHover]=useState<string|null>(null);
 const active=hover??highlight;
 const ordered=[...notes].sort((a,b)=>((rects[a.elementId]?.y??0)+(rects[a.elementId]?.height??0)/2)-((rects[b.elementId]?.y??0)+(rects[b.elementId]?.height??0)/2));
 const noteOffsets=ordered.map((_,i)=>ordered.slice(0,i).reduce((sum,n)=>sum+Math.max(150,100+Math.ceil(n.text.length/24)*20),0));
 const notesHeight=ordered.reduce((sum,n)=>sum+Math.max(150,100+Math.ceil(n.text.length/24)*20),0);
 const ids=notes.map(note=>note.elementId).join('|');
 useEffect(()=>{const measure=()=>{const doc=ref.current?.querySelector('iframe')?.contentDocument;if(!doc)return;const next:Record<string,Rect>={};for(const el of doc.querySelectorAll<HTMLElement>('[data-review-node]')){const id=el.dataset.reviewNode!;if(!ids.split('|').includes(id))continue;const dom=el.firstElementChild;if(dom){const r=dom.getBoundingClientRect();next[id]={x:r.x,y:r.y,width:r.width,height:r.height};}}setRects(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);};const timer=setInterval(measure,250);measure();return()=>clearInterval(timer);},[ids,snapshot.layout]);
 const w=snapshot.width*zoom;const h=Math.max((snapshot.height??1200)*zoom,notesHeight+40);
 return <div ref={ref} className="relative" aria-label={`Review ${snapshot.name}`} style={{width:w+(notes.length?300:0),height:h}}>
 <div className="pointer-events-none absolute left-0 top-0 bg-white shadow-lg" style={{width:w,height:(snapshot.height??1200)*zoom}}>
 <PreviewGuard key={snapshot.layout}><Editor resolver={resolver} enabled={false} onRender={ReviewNode}><StageProvider initialWidth={snapshot.width} initialHeight={snapshot.height}><CanvasFrame width={snapshot.width} height={snapshot.height} zoom={zoom} appearance={snapshot.appearance} title={snapshot.name}><Frame data={snapshot.layout}/></CanvasFrame></StageProvider></Editor></PreviewGuard>
 </div>
 <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden>{ordered.map((note,i)=>{const r=rects[note.elementId];if(!r)return null;const x=(r.x+r.width)*zoom,y=(r.y+r.height/2)*zoom;return <g key={i}><rect x={r.x*zoom} y={r.y*zoom} width={r.width*zoom} height={r.height*zoom} fill={active===note.elementId?'#8250df18':'transparent'} stroke="#8250df" strokeWidth={active===note.elementId?3:1} strokeDasharray={active===note.elementId?undefined:'4 4'}/><path d={getBezierPath({x,y},'right',{x:w+36,y:50+noteOffsets[i]},'left').path} fill="none" stroke="#a78bfa" strokeWidth="1.5"/><circle cx={x} cy={y} r="11" fill="#8250df"/><text x={x} y={y+4} textAnchor="middle" fill="white" fontSize="12">{i+1}</text></g>;})}</svg>
 {ordered.map((note,i)=><button key={i} type="button" aria-label={`Discuss annotation ${i+1}: ${note.title}`} onMouseEnter={()=>setHover(note.elementId)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(note.elementId)} onBlur={()=>setHover(null)} onClick={()=>onTarget(note)} className="absolute w-60 text-left rounded-lg focus-visible:ring-2 focus-visible:ring-ring" style={{left:w+36,top:16+noteOffsets[i]}}><AnnotationContent compact annotation={{library:'designer',template:'note',category:'other',format:'card',number:i+1,position:'left',audience:'Designer',resolved:false,showNumber:true,values:{title:note.title,description:note.text}}}/></button>)}
 </div>;
}
