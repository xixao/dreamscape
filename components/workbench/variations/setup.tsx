'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ExplorationSetup({ name, onClose, onCreate }: { name: string | null; onClose: () => void; onCreate: (prompt: string) => void }) {
  const [prompt,setPrompt]=useState('');
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent aria-describedby={undefined} className="gap-0 p-8 sm:max-w-[560px]">
      <DialogTitle className="text-xl">Explore variations</DialogTitle>
      {name&&<DialogDescription className="mt-3 leading-relaxed">Starting from {name}</DialogDescription>}
      <form className="mt-7 space-y-6" onSubmit={event=>{event.preventDefault();if(prompt.trim())onCreate(prompt.trim());}}>
        <label className="flex flex-col gap-4 text-sm font-medium">
          <span>What would you like to explore? <span className="font-normal text-muted-foreground">(optional)</span></span>
          <textarea autoFocus className="min-h-40 w-full resize-y rounded-lg border bg-input p-4 text-sm leading-relaxed font-normal placeholder:text-muted-foreground" value={prompt} onChange={event=>setPrompt(event.target.value)} maxLength={12000} placeholder="Describe specific goals and changes, or choose “I’m feeling lucky” below…"/>
        </label>
        <p className="text-sm leading-relaxed text-muted-foreground">{name ? 'Your original stays unchanged. ' : ''}Results open in the Variations workspace with explanations of the design decisions.</p>
        <div className="flex flex-wrap justify-end gap-3 border-t pt-5"><Button type="button" variant="ghost" className="mr-auto" onClick={onClose}>Cancel</Button><Button asChild variant="outline"><a href="/demos/variations">I’m feeling lucky</a></Button><Button type="submit" disabled={!prompt.trim()}>Generate variations</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
