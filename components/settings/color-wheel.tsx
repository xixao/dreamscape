'use client';
import { useState, type PointerEvent } from 'react';
export function hsvToHex(h:number,s:number,v:number) {
 const f=(n:number)=>{const k=(n+h/60)%6;return Math.round((v-v*s*Math.max(0,Math.min(k,4-k,1)))*255).toString(16).padStart(2,'0');};
 return '#'+f(5)+f(3)+f(1);
}
function toHSV(hex:string) {
 const [r,g,b]=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255), max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 const h=d===0?0:max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
 return {h:h*60,s:max===0?0:d/max,v:max};
}
export function ColorWheel({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
 const hsv=toHSV(value), [hexDraft,setHexDraft]=useState({base:value,text:value}), [dragging,setDragging]=useState(false);
 const hex=hexDraft.base===value?hexDraft.text:value;
 function change(h:number,s:number,v:number){const next=hsvToHex(h,s,v).toUpperCase();setHexDraft({base:next,text:next});onChange(next);}
 function point(event:PointerEvent<HTMLDivElement>){const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*2-1,y=(event.clientY-rect.top)/rect.height*2-1;change((Math.atan2(y,x)*180/Math.PI+450)%360,Math.min(1,Math.hypot(x,y)),hsv.v||1);}
 return <details className="group relative">
  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Edit ${label} color`}>
   <span className="size-5 rounded border border-border" style={{background:value}}/><span className="font-mono text-xs">{value.toUpperCase()}</span>
  </summary>
  <div className="mt-3 rounded-xl border border-border bg-popover p-4 shadow-panel" aria-label={`${label} color picker`}>
   <div className="relative mx-auto size-40 touch-none rounded-full" role="img" aria-label="Color wheel. Use the sliders below for keyboard adjustments."
    style={{background:'radial-gradient(circle, white 0%, transparent 70.7%), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'}}
    onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);point(e);}}
    onPointerMove={e=>{if(dragging)point(e);}} onPointerUp={e=>{setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onLostPointerCapture={()=>setDragging(false)}>
    <div className="pointer-events-none absolute inset-0 rounded-full bg-black" style={{opacity:1-hsv.v}}/>
    <span className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_black]" style={{left:`${50+Math.sin(hsv.h*Math.PI/180)*hsv.s*50}%`,top:`${50-Math.cos(hsv.h*Math.PI/180)*hsv.s*50}%`}}/>
   </div>
   {(['Hue','Saturation','Brightness'] as const).map((name,i)=><label key={name} className="mt-3 block text-xs text-t2">{name}<input className="mt-1 block w-full accent-primary" type="range" step="any" aria-label={`${label} ${name.toLowerCase()}`} min="0" max={i===0?360:100} value={i===0?hsv.h:i===1?hsv.s*100:hsv.v*100} onChange={e=>change(i===0?+e.target.value:hsv.h,i===1?+e.target.value/100:hsv.s,i===2?+e.target.value/100:hsv.v)}/></label>)}
   <label className="mt-3 block text-xs">Hex color<input aria-label={`${label} hex color`} className="mt-1 w-full rounded-md border border-border bg-muted px-2 py-2 font-mono" value={hex} maxLength={7} onChange={e=>{setHexDraft({base:/^#[0-9a-f]{6}$/i.test(e.target.value)?e.target.value.toUpperCase():value,text:e.target.value});if(/^#[0-9a-f]{6}$/i.test(e.target.value))onChange(e.target.value.toUpperCase());}} onBlur={()=>setHexDraft({base:value,text:value})} /></label>
  </div>
 </details>;
}
