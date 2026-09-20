'use client';
import { sendDesignRequest } from '@/lib/chat/design-instructions';
import Link from 'next/link';
import { RoundsCanvas } from './rounds-canvas';
import { anotherRound } from '@/lib/variations/rounds';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

import { generationPrompt, parseGeneration, type Exploration, type Variation, type VariationSet } from '@/lib/variations/model';
import { placeholderTransport, type ChatTransport } from '@/lib/chat/transport';
import { createChatStore } from '@/lib/chat/store';
import type { Page } from '@/lib/files/repository';

export function VariationsWorkspace({ fileId, page, pages, transport, onUpdate, onSwitch, onPromote, saveState }: {
  fileId:string; page:Page; pages:Page[]; transport:ChatTransport; saveState:string;
  onUpdate:(data:Exploration)=>void; onSwitch:(id:string)=>void; onNew:()=>void;
  onPromote:(variation:Variation,destination:string)=>void;
}) {
  const data=page.exploration!;
  const latest=useRef(data);
  const updateRef=useRef(onUpdate);
  useLayoutEffect(()=>{latest.current=data;updateRef.current=onUpdate;},[data,onUpdate]);
  const jobs=useRef(new Map<string,AbortController>());
  const [active,setActive]=useState<string|null>(null);
  const [target,setTarget]=useState<{elementId:string;title:string;text:string}|null>(null);
  const [retryRound,setRetryRound]=useState<VariationSet|null>(null);
  const [prompt,setPrompt]=useState('');
  const variations=data.sets.flatMap(set=>set.variations);
  const chosen=variations.find(v=>v.id===active)??variations[0];
  function choose(id:string){setActive(id);setTarget(null);setRetryRound(null);}
  const request=target?`Regarding “${target.title}” (element ${target.elementId}): ${prompt}`:prompt;
  function patchSet(id:string, patch:Partial<VariationSet>) { const now=latest.current; const next={...now,sets:now.sets.map(set=>set.id===id?{...set,...patch}:set)}; latest.current=next; updateRef.current(next); }
  useEffect(()=>()=>{jobs.current.forEach(job=>job.abort());jobs.current.clear();},[]);
  useEffect(()=>{
    for(const set of data.sets) {
      if(set.status!=='pending'||jobs.current.has(set.id))continue;
      const controller=new AbortController();jobs.current.set(set.id,controller);
      const parent=data.sets.flatMap(item=>item.variations).find(v=>v.id===set.parentId);
      const source=parent?.screens??data.source;
      const store=createChatStore(fileId,window.localStorage);
      const text=generationPrompt(source,data.selectedIds,data.brief,set);
      const history=store.load();
      store.append({id:crypto.randomUUID(),role:'user',text:`Explore variations: ${set.prompt}`,createdAt:new Date().toISOString()});
      const run=async()=>{
        try {
          if(transport===placeholderTransport)throw new Error('Connect the working Cursor chat transport to generate designs. Your source and request are saved; retry after connecting.');
          const raw=await sendDesignRequest(transport,history,text,controller.signal);
          if(controller.signal.aborted)return;
          const results=parseGeneration(raw,set.countFromPrompt?undefined:set.count,source,data.selectedIds);
          patchSet(set.id,{status:'ready',variations:results,error:undefined});
          setActive(results[0].id);setTarget(null);
          store.append({id:crypto.randomUUID(),role:'assistant',text:`Created ${results.length} variations for “${set.prompt}”.`,createdAt:new Date().toISOString()});
        } catch(error) {
          if(!controller.signal.aborted)patchSet(set.id,{status:'error',error:error instanceof Error?error.message:'Generation failed. Try again.'});
        } finally {jobs.current.delete(set.id);}
      }; void run();
    }
  },[data.sets,data.brief,data.selectedIds,data.source,transport,fileId]);
  function generate() {
    if((!prompt.trim()&&!retryRound)||data.sets.length>=100)return;
    onUpdate({...data,sets:[...data.sets,retryRound?anotherRound(retryRound,prompt):{id:crypto.randomUUID(),parentId:chosen?.id??null,prompt:request.trim(),count:1,countFromPrompt:true,teach:true,status:'pending',variations:[]}]});
    setPrompt('');setRetryRound(null);
  }
  return <main className="fixed inset-0 flex flex-col bg-canvas text-foreground">
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b bg-card px-5 py-3">
      <div className="flex min-w-0 items-center gap-3"><Link className="shrink-0" href="/">← Files</Link><select aria-label="Pages" className="min-w-0 max-w-64 rounded border bg-input p-2" value={page.id} onChange={e=>onSwitch(e.target.value)}>{pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="text-xs text-muted-foreground">{saveState}</span></div>
      <h1 className="text-sm font-medium">Variations</h1><span/>
    </header>
    {data.sets.filter(s=>s.status!=='ready').map(set=><section key={set.id} aria-label={`Variation set: ${set.prompt}`} className="border-b p-3"><p role={set.status==='error'?'alert':'status'}>{set.status==='pending'?'Generating variations…':set.error}</p><Button variant="outline" onClick={()=>{if(set.status==='pending'){jobs.current.get(set.id)?.abort();patchSet(set.id,{status:'error',error:'Generation cancelled.'});}else patchSet(set.id,{status:'pending',error:undefined});}}>{set.status==='pending'?'Cancel':'Retry generation'}</Button></section>)}
    <>

    <div className="flex min-h-0 flex-1 gap-3 px-5 pb-3">
      <aside aria-label="Variation chat" className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Chat</h2><p className="mt-1 truncate text-xs text-muted-foreground">{retryRound?'Trying another round':chosen?.name??'New exploration'}</p></div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {data.brief.trim()&&<section aria-label="Design context"><h3 className="mb-2 text-xs font-medium text-muted-foreground">Design context</h3><p className="whitespace-pre-wrap text-sm">{data.brief}</p></section>}
          {data.sets.map(set=><div key={set.id} className="space-y-2 text-sm"><p className="rounded-xl bg-secondary p-3">{set.prompt}</p><p className="text-muted-foreground">{set.status==='ready'?`Created ${set.variations.length} design direction${set.variations.length===1?'':'s'}.`:set.status==='pending'?'Generating…':set.error}</p></div>)}
        </div>
        <div className="border-t p-3">
          {target&&<div className="mb-2 flex flex-wrap items-center gap-1 text-xs"><span className="w-full truncate">Annotation: {target.title}</span><Button size="sm" variant="ghost" onClick={()=>setTarget(null)}>Clear</Button><Button size="sm" variant="ghost" onClick={()=>setPrompt('Explain the reasoning for this choice.')}>Why?</Button><Button size="sm" variant="ghost" onClick={()=>setPrompt('Challenge this choice and suggest another approach.')}>Challenge this</Button></div>}
          <p className="mb-3 text-xs text-muted-foreground">{retryRound?`New alternatives to Round ${data.sets.findIndex(s=>s.id===retryRound.id)+1} · same starting point`:chosen?`Refining: ${chosen.name}`:'New exploration'}</p>
          <form className="space-y-2" onSubmit={e=>{e.preventDefault();generate();}}>
            <textarea aria-label="Follow-up prompt" placeholder={retryRound ? 'What should the next round do differently? Feedback is optional…' : chosen ? `Describe changes to ${chosen.name}, or ask for more variations…` : 'Describe what you want to explore. Include your goals, constraints, and how many variations…'} className="min-h-24 w-full resize-none rounded-lg border bg-input p-3 text-sm placeholder:text-muted-foreground" value={prompt} maxLength={12000} onChange={e=>setPrompt(e.target.value)}/>
            <Button className="w-full" type="submit" disabled={(!prompt.trim()&&!retryRound)||data.sets.length>=100}>{retryRound?'Generate another round':'Generate variations'}</Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
    <RoundsCanvas sets={data.sets} selected={chosen?.id} onSelect={choose} onPromote={v=>onPromote(v,'source')} onAnother={set=>{setRetryRound(set);setTarget(null);setPrompt('');}} onNote={(id,note)=>{choose(id);setTarget(note);setPrompt('');}}/>
    </div></div></>
  </main>;
}
