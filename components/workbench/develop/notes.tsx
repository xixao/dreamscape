'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '@craftjs/core';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { createCommentStore, type NoteKind } from '@/lib/comments/store';
import { annotationMeta } from '@/lib/accessibility/kit';
import { AnnotationContent } from '../accessibility/annotation-content';
import { NOTE_META, NOTE_KINDS } from '../comments/note-meta';
import { PANEL } from '../chrome';
import { useSettledEditorState } from '../use-settled-editor-state';

/** Existing design notes, presented without design-editing or resolution actions. */
export function DevelopNotes({ file, screen, inspecting, onInspect }: {
  file: FileRecord; screen: Screen; inspecting: boolean; onInspect: (id: string) => void;
}) {
  const { query } = useEditor();
  const snapshot = useSettledEditorState();
  const [revision, setRevision] = useState(0);
  const store = useMemo(() => {
    // A new store reads the latest snapshot after a storage event from Design's tab.
    void revision; return createCommentStore(file.id);
  }, [file.id, revision]);
  const threads = useSyncExternalStore(store.subscribe, store.list, store.list);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [filter, setFilter] = useState<'all' | NoteKind>('all');
  const [status, setStatus] = useState('all');
  const [active, setActive] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === null || event.key === `assembly-workbench:comments:${file.id}`) setRevision(value => value + 1); };
    window.addEventListener('storage', refresh); return () => window.removeEventListener('storage', refresh);
  }, [file.id]);
  const relevant = threads.filter(t => t.canvas ? t.pageId === screen.pageId : (t.screenId ?? file.screens?.[0]?.id) === screen.id);
  const annotations = file.pages?.find(page => page.id === screen.pageId)?.diagram?.nodes.filter(node => node.annotation) ?? [];
  const matches = (kind: NoteKind, resolved: boolean) => (filter === 'all' || filter === kind) && (status === 'all' || resolved === (status === 'resolved'));
  const notes = relevant.filter(t => matches(t.kind ?? 'comment', !!t.resolvedAt));
  const kits = annotations.filter(node => matches(node.annotation!.library === 'designer' ? 'annotation' : 'accessibility', !!node.annotation!.resolved));
  useEffect(() => {
    const frame = query.getNodes().ROOT?.dom?.closest('[data-testid="artboard"]');
    if (!frame || !inspecting || !visible) return;
    const update = () => {
      const rect = frame.getBoundingClientRect();
      setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      setAnchors(Object.fromEntries(threads.flatMap(thread => {
        const dom = thread.anchorNodeId && query.getNodes()[thread.anchorNodeId]?.dom;
        if (!dom || !thread.anchorOffset) return [];
        const box = dom.getBoundingClientRect();
        return [[thread.id, { x: box.left + box.width * thread.anchorOffset.x, y: box.top + box.height * thread.anchorOffset.y }]];
      })));
    };
    update(); const observer = new ResizeObserver(update); observer.observe(frame);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [query, threads, snapshot, inspecting, visible]);
  useEffect(() => {
    if (open && active) document.getElementById(`dev-note-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, filter, status]);
  const originKnown = screen.x != null && screen.y != null;
  const pointInside = (x: number, y: number) => bounds && x >= bounds.left && y >= bounds.top && x <= bounds.left + bounds.width && y <= bounds.top + bounds.height;
  function reveal(id: string) { setOpen(true); setActive(id); }
  const surfaces = <div data-develop-ui className="text-foreground">
    {inspecting && visible && bounds && <>
      {notes.map(thread => {
        if (thread.canvas && !originKnown) return null;
        const point = !thread.canvas && anchors[thread.id] ? anchors[thread.id] : { x: bounds.left + thread.x - (thread.canvas ? screen.x! : 0), y: bounds.top + thread.y - (thread.canvas ? screen.y! : 0) };
        if (!pointInside(point.x, point.y)) return null;
        const meta = NOTE_META[thread.kind ?? 'comment']; const Icon = meta.icon;
        return <button key={thread.id} aria-label={`Open ${meta.label.toLowerCase()}: ${thread.title || thread.text}`} title={thread.title || thread.text} onClick={() => reveal(thread.id)} className={`fixed z-40 flex h-7 items-center gap-1 rounded-full px-2 text-xs text-white shadow-md ${meta.pin}`} style={{ left: point.x, top: point.y }}><Icon size={12} />{thread.number ?? relevant.indexOf(thread) + 1}</button>;
      })}
      {originKnown && kits.map(node => {
        const x = bounds.left + node.x - screen.x!; const y = bounds.top + node.y - screen.y!;
        // Page-level items outside this screen remain available in the Notes list.
        if (x + node.width < bounds.left || y + node.height < bounds.top || x > bounds.left + bounds.width || y > bounds.top + bounds.height) return null;
        return <div key={node.id} role="button" tabIndex={0} aria-label={`Open annotation: ${node.annotation!.values.title || annotationMeta(node.annotation!).label}`} className="fixed z-30 cursor-pointer" style={{ left: x, top: y, width: node.width, height: node.height }} onClick={() => reveal(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); reveal(node.id); } }}><AnnotationContent annotation={node.annotation!} /></div>;
      })}
    </>}
    {open && <aside aria-label="Developer notes" className={`${PANEL} fixed right-6 top-24 z-[45] flex max-h-[calc(100vh-120px)] w-[420px] max-w-[calc(100vw-48px)] flex-col overflow-hidden text-sm`}>
      <header className="flex items-center justify-between border-b border-line-soft p-3"><h2 className="font-semibold">Comments & annotations</h2><Button variant="ghost" size="icon" aria-label="Close notes" onClick={() => setOpen(false)}><X size={16} /></Button></header>
      <div className="space-y-3 border-b border-line-soft p-3">
        <div role="group" aria-label="Note type filters" className="grid grid-cols-2 gap-1">{(['all', ...NOTE_KINDS] as const).map(kind => <Button key={kind} size="sm" variant={filter === kind ? 'secondary' : 'ghost'} aria-pressed={filter === kind} onClick={() => setFilter(kind)}>{kind === 'all' ? 'All' : NOTE_META[kind].plural}</Button>)}</div>
        <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-xs">Status<select aria-label="Developer note status" value={status} onChange={event => setStatus(event.target.value)} className="rounded border bg-card p-1"><option value="all">All</option><option value="open">Open</option><option value="resolved">Resolved</option></select></label><Button size="sm" variant="ghost" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide on screen' : 'Show on screen'}</Button></div>
        <p className="text-xs text-muted-foreground">Notes for {screen.name}, plus annotations on this page.</p>
      </div>
      <div className="min-h-0 space-y-3 overflow-auto p-3">
        {notes.map(thread => { const meta = NOTE_META[thread.kind ?? 'comment']; const Icon = meta.icon;
          return <article id={`dev-note-${thread.id}`} key={thread.id} className={`rounded-lg border p-3 ${active === thread.id ? 'border-ring bg-accent/30' : 'border-border'}`}>
            <div className={`flex items-center gap-2 text-xs ${meta.text}`}><Icon size={14} />{meta.label} {thread.resolvedAt ? '· Resolved' : ''}{thread.accessibilityKind ? ` · ${thread.accessibilityKind}` : ''}</div>
            {thread.title && <h3 className="mt-2 font-semibold">{thread.title}</h3>}<p className="mt-2 whitespace-pre-wrap break-words">{thread.text}</p><p className="mt-2 text-xs text-muted-foreground">{thread.author} · {thread.canvas ? 'Page canvas' : thread.anchorLabel || screen.name}</p>
            {thread.replies.map(reply => <div key={reply.id} className="mt-3 border-t border-line-soft pt-2"><p className="text-xs text-muted-foreground">{reply.author}</p><p className="whitespace-pre-wrap break-words">{reply.text}</p></div>)}
            {!thread.canvas && thread.anchorNodeId && query.getNodes()[thread.anchorNodeId] && <Button size="sm" variant="outline" className="mt-3" onClick={() => onInspect(thread.anchorNodeId!)}>Inspect element</Button>}
          </article>;
        })}
        {kits.map(node => <article id={`dev-note-${node.id}`} key={node.id} className={`space-y-2 rounded-lg border p-3 ${active === node.id ? 'border-ring bg-accent/30' : 'border-border'}`}><p className="text-xs text-muted-foreground">{node.annotation!.library === 'designer' ? 'Designer annotation' : 'Accessibility annotation'} · Page canvas</p><div style={{ minHeight: Math.min(node.height, 200), maxHeight: 400, overflow: 'auto' }}><AnnotationContent annotation={node.annotation!} /></div></article>)}
        {!notes.length && !kits.length && <p className="py-6 text-center text-muted-foreground">No notes match these filters.</p>}
      </div>
      <p className="border-t border-line-soft p-3 text-xs text-muted-foreground">Read-only. Comment threads are saved in this browser; library annotations are saved with the file.</p>
    </aside>}
  </div>;
  return <><Button variant={open ? 'secondary' : 'ghost'} aria-label="Comments and annotations" aria-expanded={open} onClick={() => setOpen(!open)}><MessageCircle size={14} />Notes <span className="tabular-nums">{relevant.length + annotations.length}</span></Button>{createPortal(surfaces, document.body)}</>;
}
