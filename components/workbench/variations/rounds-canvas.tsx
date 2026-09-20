'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { InfiniteReviewCanvas, ReviewArtwork } from './review-stage';
import { layoutRounds } from '@/lib/variations/rounds';
import type { Variation, VariationSet } from '@/lib/variations/model';
export function RoundsCanvas({sets,selected,onSelect,onPromote,onAnother,onNote}:{sets:VariationSet[];selected?:string;onSelect:(id:string)=>void;onPromote:(v:Variation)=>void;onAnother:(set:VariationSet)=>void;onNote:(id:string,note:NonNullable<Variation['rationale']['annotations']>[number])=>void}) {
 const rounds=useMemo(()=>layoutRounds(sets),[sets]);
 const [focus,setFocus]=useState<{x:number;y:number;width:number;height:number;token:number}>();
 const seen=useRef('');const sequence=useRef(0);
 const completed=rounds.filter(r=>r.set.status==='ready').at(-1);
 useEffect(()=>{if(completed&&seen.current!==completed.set.id){seen.current=completed.set.id;setFocus({x:completed.x,y:completed.y,width:completed.width,height:completed.height,token:++sequence.current});}},[completed]);
 function fit(box:{x:number;y:number;width:number;height:number}){setFocus({...box,token:++sequence.current});}
 const last=rounds.at(-1);
 return <div className="relative flex min-h-0 flex-1">
 <div className="absolute right-3 top-3 z-10"><select aria-label="Jump to round" className="rounded-lg border bg-card p-2 text-sm" value="" onChange={e=>{const r=rounds.find(r=>r.set.id===e.target.value);if(r)fit(r);}}><option value="">Jump to round…</option>{rounds.map(r=><option key={r.set.id} value={r.set.id}>Round {r.index+1}</option>)}</select></div>
 <InfiniteReviewCanvas width={Math.max(1000,...rounds.map(r=>r.width))} height={last?last.y+last.height:800} focus={focus}>
 <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden>{rounds.map(r=>{const parent=rounds.flatMap(p=>p.options.map(o=>({...o,round:p}))).find(o=>o.variation.id===r.set.parentId);if(!parent)return null;const x=parent.x+parent.width/2,y=parent.round.y+parent.y+parent.height;return <path key={r.set.id} d={`M ${x} ${y} C ${x} ${y+100}, 80 ${r.y-100}, 80 ${r.y}`} stroke="var(--accent-primary,#a78bfa)" strokeWidth="3" fill="none"/>;})}</svg>
 {rounds.map(r=><section key={r.set.id} aria-label={`Round ${r.index+1}`} className="absolute rounded-2xl border-2 border-violet-400/40 bg-violet-400/5" style={{left:r.x,top:r.y,width:r.width,height:r.height}}>
 <div className="flex items-center gap-6 rounded-t-xl bg-card p-5"><button className="text-2xl font-semibold" onClick={()=>fit(r)}>Round {r.index+1}</button><p className="max-w-2xl truncate text-lg" title={r.set.prompt}>{r.set.prompt}</p><button className="ml-auto rounded-lg border px-4 py-2 text-lg" onClick={()=>onAnother(r.set)}>Try another round</button></div>
 <p className="px-5 pt-2 text-sm text-muted-foreground">{r.set.parentId?`Based on: ${sets.flatMap(s=>s.variations).find(v=>v.id===r.set.parentId)?.name??'Earlier option'}`:'Based on the original starting point'}</p>
 {r.set.status!=='ready'&&<p className="p-10 text-xl">{r.set.status==='pending'?'Generating variations…':r.set.error}</p>}
 {r.options.map((o,i)=><div key={o.variation.id} className="absolute rounded-lg" style={{left:o.x,top:o.y,width:o.width,height:o.height,outline:selected===o.variation.id?'3px solid var(--accent-primary,#a78bfa)':undefined,outlineOffset:12}} onClick={e=>{if(!(e.target as HTMLElement).closest('button'))onSelect(o.variation.id);}}>
 <div className="absolute -top-11 flex w-full items-center gap-4"><button className="text-xl font-medium" onClick={()=>{onSelect(o.variation.id);fit({x:o.x,y:r.y+o.y-50,width:o.width,height:o.height+60});}}>Option {String.fromCharCode(65+i)} · {o.variation.name}{o.variation.rationale.recommendation&&<span title={o.variation.rationale.recommendation.reason}> ★</span>}</button><button className="ml-auto rounded border bg-card px-3 py-1" onClick={e=>{e.stopPropagation();onPromote(o.variation);}}>{o.variation.promoted?'View on canvas':'Add to canvas'}</button></div>
 {o.variation.screens.map((snapshot,i)=><div key={i} className="mb-20"><ReviewArtwork snapshot={snapshot} notes={i===0?o.variation.rationale.annotations??[]:[]} highlight={null} onTarget={note=>onNote(o.variation.id,note)}/></div>)}
 </div>)}
 </section>)}
 </InfiniteReviewCanvas></div>;
}
