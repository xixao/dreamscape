 'use client';
import { useState } from 'react';
import { InfiniteReviewCanvas, ReviewArtwork } from '@/components/workbench/variations/review-stage';
import type { Variation } from '@/lib/variations/model';
import prepared from './data.json';
const options = prepared as Variation[];
export default function VariationsDemo() {
 const [index,setIndex]=useState(0);
 const option=options[index];
 const snapshot=option.screens[0];
 const width=snapshot.width+360, height=(snapshot.height??1000)+100;
 return <main className="fixed inset-0 flex flex-col bg-canvas text-foreground">
  <header className="flex h-16 shrink-0 items-center gap-5 border-b bg-card px-6">
   <button className="rounded-lg px-3 py-2 hover:bg-accent" onClick={()=>window.history.back()}>← Back to design</button>
   <h1 className="text-lg font-semibold">Variations</h1><span className="ml-auto rounded-full border px-3 py-1 text-xs text-muted-foreground">Prepared demo</span>
  </header>
  <div className="flex min-h-0 flex-1 gap-3 p-3">
   <aside className="flex w-64 shrink-0 flex-col rounded-xl border bg-card p-4">
    <h2 className="mb-2 font-semibold">Round 1</h2><p className="mb-6 text-sm text-muted-foreground">Three ways to organize the same loan pipeline content.</p>
    <div className="space-y-2">{options.map((item,i)=><button key={item.id} onClick={()=>setIndex(i)} aria-pressed={index===i} className={`w-full rounded-lg border px-4 py-3 text-left text-sm ${index===i?'bg-accent text-accent-foreground':'border-transparent hover:bg-accent/50'}`}><span className="mb-1 block text-xs text-muted-foreground">Option {String.fromCharCode(65+i)}</span>{item.name}</button>)}</div>
    <p className="mt-auto pt-6 text-sm leading-relaxed text-muted-foreground">Select a direction to inspect it. Scroll to pan, pinch to zoom, or hold Space and drag.</p>
   </aside>
   <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
    <div className="flex items-center justify-between border-b bg-card px-5 py-3"><h2 className="font-medium">{option.name}</h2><span className="text-sm text-muted-foreground">{index+1} of {options.length}</span></div>
    <InfiniteReviewCanvas key={option.id} width={width} height={height} focus={{x:0,y:0,width,height,token:1}}>
     <ReviewArtwork snapshot={snapshot} notes={option.rationale.annotations??[]} highlight={null} onTarget={()=>{}}/>
    </InfiniteReviewCanvas>
   </section>
  </div>
 </main>;
}
