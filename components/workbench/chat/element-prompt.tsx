'use client';

import { useCanvasPrompts } from './canvas-prompt-controls';
import { useEditor } from '@craftjs/core';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';
import { createChatStore } from '@/lib/chat/store';
import { useChatTransport } from './chat-transport-context';
import { Input } from '@/components/ui/input';
import { PANEL, SEARCH, SEARCH_INPUT } from '../chrome';

/** UI-only element-scoped AI entry point. Never mutates the document. */
export function ElementPrompt({ fileId, onClose }: { fileId: string; onClose: () => void }) {
  const { id, node, dragging } = useEditor(state => {
    const id = Array.from(state.events.selected)[0];
    return { id, node: id ? state.nodes[id] : undefined, dragging: state.events.dragged.size > 0 };
  });
  const enabled = useCanvasPrompts();
  const transport = useChatTransport();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const promptRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => { setText(''); setSent(false); }, [id]);
  useEffect(() => {
    if (!id) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [id, onClose]);
  useEffect(() => {
    let raf: number;
    const update = () => {
      const dom = node?.dom;
      if (!dom?.isConnected) setPosition(null);
      else {
        const rect = dom.getBoundingClientRect();
        let left = rect.left; let bottom = rect.bottom; let top = rect.top;
        const frame = dom.ownerDocument.defaultView?.frameElement as HTMLElement | null;
        if (frame) {
          const bounds = frame.getBoundingClientRect();
          const scale = bounds.width / (frame.offsetWidth || bounds.width);
          left = bounds.left + left * scale; bottom = bounds.top + bottom * scale; top = bounds.top + top * scale;
        }
        // Chrome lives in the outer document; component asides inside the
        // artboard iframe are deliberately excluded from these obstacles.
        let safeLeft = 12;
        let safeRight = window.innerWidth - 12;
        for (const panel of document.querySelectorAll('aside')) {
          const bounds = panel.getBoundingClientRect();
          if (!bounds.width || !bounds.height || bounds.right <= 0 || bounds.left >= window.innerWidth) continue;
          const style = getComputedStyle(panel);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if ((bounds.left + bounds.right) / 2 < window.innerWidth / 2) safeLeft = Math.max(safeLeft, bounds.right + 12);
          else safeRight = Math.min(safeRight, bounds.left - 12);
        }
        const width = Math.min(320, safeRight - safeLeft);
        const height = promptRef.current?.getBoundingClientRect().height || 56;
        const next = width < 120 ? null : {
          left: Math.max(safeLeft, Math.min(left, safeRight - width)),
          top: Math.max(80, Math.min(bottom + 10 + height <= window.innerHeight - 12 ? bottom + 10 : top - height - 10, window.innerHeight - height - 12)),
          width,
        };
        setPosition(old => old?.left === next?.left && old?.top === next?.top && old?.width === next?.width ? old : next);
      }
      raf = requestAnimationFrame(update);
    };
    update(); return () => cancelAnimationFrame(raf);
  }, [node?.dom]);
  if (!enabled || dragging || !node || !position) return null;
  const name = node.data.custom?.layerName || node.data.displayName || node.data.name;
  function send() {
    const prompt = text.trim();
    if (!prompt || sent) return;
    const store = createChatStore(fileId, window.localStorage);
    const history = store.load();
    const request = `${name}: ${prompt}`;
    const append = (role: 'user' | 'assistant', text: string) => store.append({ id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString() });
    append('user', request);
    setText(''); setSent(true);
    // Uses the same transport and per-file conversation as the full Chat panel.
    // Finish the reply even if the user selects another component meanwhile.
    transport.send(history, request).then(reply => append('assistant', reply)).catch(() => append('assistant', 'Something went wrong. Try again.')).finally(() => setSent(false));
  }
  return <section ref={promptRef} aria-label={`AI edit ${name}`} style={position} className={`${PANEL} fixed z-50 w-80 max-w-[calc(100vw-24px)] p-1.5`} onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <form className={`${SEARCH} h-10 flex-nowrap gap-2 py-1 pr-1 pl-3`} onSubmit={event => { event.preventDefault(); send(); }}>
      <Input type="text" key={id} aria-label={`Ask AI about ${name}`} placeholder={`Ask AI to edit ${name}…`} value={text} onChange={event => setText(event.target.value)} className={`${SEARCH_INPUT.replace('placeholder:text-t4', 'placeholder:text-t2')} flex-1 text-[13px] placeholder:opacity-100`} />
      <button type="submit" title="Send to AI conversation" aria-label="Send request" disabled={!text.trim() || sent} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><ArrowUp aria-hidden className="size-4" /></button>
      <button type="button" title="Close prompt" aria-label="Close prompt" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden className="size-4" /></button>
    </form>
  </section>;
}
