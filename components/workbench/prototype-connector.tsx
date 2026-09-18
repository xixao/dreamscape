'use client';
import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { getInteraction, setInteraction } from '@/lib/interactions';
import { usePrototypeContext } from './prototype-context';

export function PrototypeConnector({id, dom, selected}: {id:string;dom:HTMLElement;selected:boolean}) {
 const {actions, query} = useEditor();
 const {screens, showAllConnections} = usePrototypeContext();
 const marker = useId().replace(/:/g,'');
 const [geometry,setGeometry]=useState<{x:number;y:number;tx:number;ty:number;linked:boolean;label:string}|null>(null);
 const [drag,setDrag]=useState<{x:number;y:number}|null>(null);
 const outer=dom.ownerDocument.defaultView?.frameElement?.ownerDocument ?? dom.ownerDocument;
 useEffect(()=>{
  let raf:number;
  const update=()=>{
   const node=query.getState().nodes[id];
   const link=getInteraction(node);
   const frame=dom.ownerDocument.defaultView?.frameElement as HTMLElement|null;
   const r=dom.getBoundingClientRect(), f=frame?.getBoundingClientRect();
   const scale=f && frame ? f.width/(frame.offsetWidth || f.width):1;
   const x=(f?.left ?? 0)+r.right*scale,y=(f?.top ?? 0)+(r.top+r.height/2)*scale;
   let dest:DOMRect|undefined;
   if(link && 'targetScreenId' in link) dest=Array.from(outer.querySelectorAll<HTMLElement>('[data-frame-id]')).find(el=>el.dataset.frameId===link.targetScreenId)?.getBoundingClientRect();
   else if(link?.action==='openDialog') {const target=query.getState().nodes[link.targetNodeId]?.dom?.getBoundingClientRect();if(target)dest={left:(f?.left??0)+target.left*scale,top:(f?.top??0)+target.top*scale,height:target.height*scale} as DOMRect;}
   const label=link?.action==='back'?'Back':link?.action==='closeOverlay'?'Close overlay':link && 'targetScreenId' in link ? screens.find(s=>s.id===link.targetScreenId)?.name ?? 'Destination unavailable':link?.action==='openDialog'?'Open dialog':'Drag to connect';
   const next={x,y,tx:dest?.left??x,ty:dest?dest.top+dest.height/2:y,linked:!!dest,label};
   setGeometry(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
   raf=requestAnimationFrame(update);
  };update();return()=>cancelAnimationFrame(raf);
 },[dom,id,query,outer,screens]);
 if(!geometry || (!selected && !showAllConnections))return null;
 const {x,y,tx,ty,linked,label}=geometry;
 const end=drag??{x:tx,y:ty};const bend=Math.max(48,Math.abs(end.x-x)/2);
 const choose=()=>actions.selectNode(id);
 return createPortal(<svg className="pointer-events-none fixed inset-0 z-[5] h-full w-full overflow-visible" aria-label="Prototype connection">
  <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#9694ed" /></marker></defs>
  {(linked || drag) && <g>
   <path d={`M${x},${y} C${x+bend},${y} ${end.x-bend},${end.y} ${end.x},${end.y}`} fill="none" stroke="#9694ed" strokeWidth="2" markerEnd={`url(#${marker})`} />
   <path role="button" aria-label={`Edit connection to ${label}`} tabIndex={0} className="pointer-events-auto cursor-pointer" d={`M${x},${y} C${x+bend},${y} ${end.x-bend},${end.y} ${end.x},${end.y}`} fill="none" stroke="transparent" strokeWidth="14" onClick={choose} onKeyDown={e=>{if(e.key==='Enter')choose();}}><title>{label}</title></path>
  </g>}
  {selected && <g><circle role="button" aria-label={label} tabIndex={0} cx={x} cy={y} r="7" fill="#9694ed" stroke="white" strokeWidth="2" className="pointer-events-auto cursor-crosshair" onClick={choose}
   onPointerDown={e=>{e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);setDrag({x:e.clientX,y:e.clientY});}}
   onPointerMove={e=>{if(drag)setDrag({x:e.clientX,y:e.clientY});}}
   onPointerCancel={()=>setDrag(null)}
   onPointerUp={e=>{if(!drag)return;setDrag(null);const target=Array.from(outer.querySelectorAll<HTMLElement>('[data-frame-id]')).find(el=>{const r=el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});const screen=screens.find(s=>s.id===target?.dataset.frameId);if(screen){const old=getInteraction(query.getState().nodes[id]);setInteraction(actions,id,{id:old?.id??nanoid(10),trigger:'click',action:screen.kind==='overlay'?'openOverlay':'navigate',targetScreenId:screen.id,...(old?.intendedCondition?{intendedCondition:old.intendedCondition}:{})});}}}><title>{linked?'Drag to reconnect':label}</title></circle>
   {!linked && !drag && label!=='Drag to connect' && <text x={x-12} y={y+4} textAnchor="end" fill="#9694ed" fontSize="12">{label==='Back'?'↩':label==='Close overlay'?'×':'?'}</text>}
  </g>}
 </svg>,outer.body);
}
