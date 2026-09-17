'use client';
import { useSyncExternalStore } from 'react';
import { Lasso } from 'lucide-react';
const key = 'dreamscape:canvas-prompts';
const event = 'dreamscape:canvas-prompts-changed';
function subscribe(fn: () => void) { window.addEventListener(event, fn); window.addEventListener('storage', fn); return () => { window.removeEventListener(event, fn); window.removeEventListener('storage', fn); }; }
function read() { try { return localStorage.getItem(key) !== 'false'; } catch { return true; } }
export function useCanvasPrompts() { return useSyncExternalStore(subscribe, read, () => true); }
export function startAreaPrompt() { window.dispatchEvent(new Event('dreamscape:ask-area')); }
export function CanvasPromptControls() {
  const enabled = useCanvasPrompts();
  return <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2 text-xs">
    <button type="button" role="switch" aria-checked={enabled} onClick={() => { try { localStorage.setItem(key, String(!enabled)); } catch {} window.dispatchEvent(new Event(event)); }} className="flex items-center gap-2 text-muted-foreground"><span className={`flex h-4 w-7 items-center rounded-full px-0.5 ${enabled ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}><span className="size-3 rounded-full bg-white" /></span>Show canvas prompts</button>
    <button type="button" aria-label="Ask AI about an area" title="Ask AI about an area" onClick={startAreaPrompt} className="rounded p-1.5 hover:bg-accent"><Lasso className="size-4" /></button>
  </div>;
}
