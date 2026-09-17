'use client';
import { useMemo, useState } from 'react';
import { useEditor } from '@craftjs/core';
import type { Page, Screen } from '@/lib/files/repository';
import type { CommentThread } from '@/lib/comments/store';
import type { DiagramData } from '@/lib/diagram/store';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppearance } from '../appearance-context';
import { useComponentLibrary } from '../component-builder/library-context';
import { SegmentedControl, SegmentedItem } from '../segmented-control';
import { buildPackage, connectedScope, changesSince, type Snapshot } from './model';
import { packageZip } from './zip';
const STEPS=['Scope','Package','Review','Deliver'] as const;
const field='w-full rounded-md border bg-muted px-3 py-2 text-sm';
export function HandoffWorkspace({fileId,fileName,pages,screens,currentScreenId,notes,onClose,onAddDiagram}:{fileId:string;fileName:string;pages:Page[];screens:Screen[];currentScreenId:string;notes:CommentThread[];onClose:()=>void;onAddDiagram:(diagram:DiagramData)=>void}) {
  const {query}=useEditor(); const {appearance}=useAppearance();const library=useComponentLibrary();
  // Freeze all inputs when Handoff opens. Editing the live file cannot change this package.
  const [snapshot]=useState<Snapshot>(()=>structuredClone({id:crypto.randomUUID(),createdAt:new Date().toISOString(),fileId,fileName,appearance,pages,screens:screens.map(s=>s.id===currentScreenId?{...s,layout:query.serialize()}:s),components:library?.components || [],notes}));
  const storageKey=`dreamscape:handoff:last:${fileId}`;
  const [previous]=useState<Snapshot|undefined>(()=>{try{return JSON.parse(localStorage.getItem(storageKey)||'null')?.snapshot;}catch{return undefined;}});
  const [step,setStep]=useState(0);const [start,setStart]=useState(currentScreenId);
  const [mode,setMode]=useState('connected');const [manual,setManual]=useState<string[]>([currentScreenId]);
  const ids=useMemo(()=>mode==='all'?snapshot.screens.map(s=>s.id):mode==='manual'?manual:connectedScope(snapshot.screens,start),[mode,manual,snapshot,start]);
  const bundle=useMemo(()=>buildPackage(snapshot,ids,start),[snapshot,ids,start]);
  const [editedSpec,setEditedSpec]=useState<string|null>(null);const [reviewed,setReviewed]=useState(false);
  const [decisions,setDecisions]=useState('');const [repo,setRepo]=useState('');const [branch,setBranch]=useState('');
  const [artifact,setArtifact]=useState('spec.md');const [notice,setNotice]=useState('');const [added,setAdded]=useState(false);
  const scopedSnapshot={...snapshot,screens:bundle.screens};
  const changes=changesSince(previous,scopedSnapshot);
  function resetReview(){setEditedSpec(null);setReviewed(false);setAdded(false);}
  const spec=(editedSpec ?? bundle.spec)+(decisions.trim()?`\n## Designer decisions and implementation notes\n${decisions}\n`:'');
  const files:Record<string,string>={...bundle.files,'spec.md':spec,'changes.md':`# Changes since last local handoff\n${changes.map(c=>`- ${c}`).join('\n')}`,'handoff.json':JSON.stringify({snapshotId:snapshot.id,createdAt:snapshot.createdAt,startScreenId:start,screenIds:ids,reviewed,openFindings:bundle.issues,openQuestions:bundle.questions,destination:{repository:repo,branch},delivery:'local-download',aiGenerated:false},null,2)};
  function download(){
    const url=URL.createObjectURL(packageZip(files));const a=document.createElement('a');a.href=url;a.download=`dreamscape-handoff-${snapshot.id.slice(0,8)}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    try{localStorage.setItem(storageKey,JSON.stringify({snapshot:scopedSnapshot,files}));setNotice('Package downloaded. Snapshot saved in this browser. Nothing was pushed to GitHub.');}catch{setNotice('Package downloaded. Browser storage is full; the snapshot could not be saved locally.');}
  }
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="flex h-[min(850px,92dvh)] w-[min(1120px,94vw)] max-w-none flex-col gap-4 bg-card p-6 sm:max-w-none">
    <div className="pr-8"><DialogTitle>Handoff · {fileName}</DialogTitle><DialogDescription>Prepare a versioned implementation package for your developer.</DialogDescription><p className="mt-1 text-xs text-muted-foreground">Snapshot {snapshot.id.slice(0,8)} · {new Date(snapshot.createdAt).toLocaleString()} · Close and reopen to capture newer design changes.</p></div>
    <SegmentedControl aria-label="Handoff steps" value={String(step)} onValueChange={value=>{if(value)setStep(Number(value));}}>{STEPS.map((label,i)=><SegmentedItem key={label} value={String(i)} disabled={i>0&&!ids.length} className="py-2">{i+1}. {label}</SegmentedItem>)}</SegmentedControl>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {step===0&&<div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="space-y-4"><h3 className="font-semibold">Choose what to hand off</h3><label className="block space-y-2 text-sm">Starting frame<select aria-label="Handoff starting frame" className={field} value={start} onChange={e=>{setStart(e.target.value);resetReview();}}>{snapshot.screens.map(s=><option key={s.id} value={s.id}>{snapshot.pages.find(p=>p.id===s.pageId)?.name} / {s.name}</option>)}</select></label>
          <label className="block space-y-2 text-sm">Scope<select aria-label="Handoff scope" className={field} value={mode} onChange={e=>{setMode(e.target.value);resetReview();}}><option value="connected">Connected flow across Pages</option><option value="all">Entire file</option><option value="manual">Choose frames</option></select></label>
          <p className="text-xs text-muted-foreground">Connected flow follows configured navigation and overlay links from the starting frame. Back and close actions are included as behavior, not guessed destinations.</p>
        </div><div className="space-y-3">{snapshot.pages.map(page=><section key={page.id} className="rounded-lg border p-3"><h4 className="mb-2 text-sm font-semibold">{page.name}</h4>{snapshot.screens.filter(s=>s.pageId===page.id).map(s=><label key={s.id} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={ids.includes(s.id)} disabled={mode!=='manual'} onChange={e=>{setManual(old=>e.target.checked?[...old,s.id]:old.filter(id=>id!==s.id));resetReview();}} />{s.name}<span className="ml-auto text-xs text-muted-foreground">{s.kind==='overlay'?'Overlay':`${s.stageWidth}px`}{s.id===start?' · Start':''}</span></label>)}</section>)}</div>
      </div>}
      {step===1&&<div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Your implementation package</h3><p className="text-sm text-muted-foreground">{ids.length} {ids.length===1?'frame':'frames'} · {bundle.diagram.edges.length} flow connections · {Object.keys(files).length} files</p></div><Button variant="outline" disabled={added} onClick={()=>{onAddDiagram(bundle.diagram);setAdded(true);}}>{added?'Flow added to canvas':'Add editable flow to canvas'}</Button></div>
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">AI spec drafting is not connected yet. This working preview generates a factual draft from prototype connections and saved notes. You can edit it during Review.</div>
        <div className="grid min-h-[350px] gap-4 md:grid-cols-[210px_1fr]"><div className="space-y-1">{Object.keys(files).map(path=><button key={path} onClick={()=>setArtifact(path)} className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${artifact===path?'bg-accent':'hover:bg-muted'}`}>{path}</button>)}</div><div className="min-w-0 rounded-lg border bg-background p-3">{artifact==='flow.svg'?<img alt="Generated prototype flow diagram" className="mx-auto max-h-[420px] max-w-full object-contain" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(files['flow.svg'])}`} />:<pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-xs">{files[artifact as keyof typeof files] || ''}</pre>}</div></div>
      </div>}
      {step===2&&<div className="grid gap-5 md:grid-cols-[1fr_290px]"><div><h3 className="mb-2 font-semibold">Review and edit the specification</h3><textarea aria-label="Handoff specification" className={`${field} min-h-[400px] font-mono text-xs`} value={editedSpec ?? bundle.spec} onChange={e=>{setEditedSpec(e.target.value);setReviewed(false);}} /><label className="mt-3 block text-sm">Decisions and implementation notes<textarea aria-label="Handoff decisions" className={`${field} mt-2 min-h-24`} placeholder="Clarify behavior, or explain questions intentionally left open for your developer." value={decisions} onChange={e=>{setDecisions(e.target.value);setReviewed(false);}} /></label></div>
        <div className="space-y-5"><section><h4 className="font-semibold">Needs review · {bundle.issues.length}</h4><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{bundle.issues.length?bundle.issues.map((issue,i)=><li key={i}>{issue}</li>):<li>No broken or excluded destinations found.</li>}</ul></section><section><h4 className="font-semibold">Still needs a decision</h4><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{bundle.questions.map(q=><li key={q}>{q}</li>)}</ul></section><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} />I reviewed this package. Remaining questions are intentionally included for the developer.</label></div>
      </div>}
      {step===3&&<div className="grid gap-6 md:grid-cols-2"><div className="space-y-4"><h3 className="font-semibold">Deliver the package</h3><p className="text-sm text-muted-foreground">Download the reviewed files together. GitHub delivery is a preview and cannot create a pull request yet.</p><label className="block text-sm">Repository<Input aria-label="Handoff repository" value={repo} onChange={e=>setRepo(e.target.value)} placeholder="owner/repository" className="mt-2" /></label><label className="block text-sm">Target branch<Input aria-label="Handoff branch" value={branch} onChange={e=>setBranch(e.target.value)} placeholder="Choose when GitHub is connected" className="mt-2" /></label><Button disabled variant="outline">Create GitHub pull request — not connected</Button><div><Button disabled={!reviewed || !ids.length} onClick={download}>Download handoff ZIP</Button>{!reviewed&&<p className="mt-2 text-xs text-muted-foreground">Review and acknowledge the package before downloading.</p>}</div><p role="status" className="text-sm text-muted-foreground">{notice}</p></div><div><h3 className="font-semibold">Changes since last local handoff</h3><ul className="my-3 space-y-2 text-sm">{changes.map((c,i)=><li key={i}>{c}</li>)}</ul><p className="text-xs text-muted-foreground">Local handoff history is stored in this browser. The ZIP preserves this snapshot independently of later design edits.</p></div></div>}
    </div>
    <div className="flex items-center justify-between border-t pt-4"><Button variant="ghost" onClick={()=>step?setStep(step-1):onClose()}>{step?'Back':'Cancel'}</Button><span className="text-xs text-muted-foreground">{ids.length} {ids.length===1?'frame':'frames'} included</span>{step<3?<Button disabled={!ids.length} onClick={()=>setStep(step+1)}>{step===0?'Prepare package':step===1?'Review package':'Delivery options'}</Button>:<Button variant="ghost" onClick={onClose}>Done</Button>}</div>
  </DialogContent></Dialog>;
}
