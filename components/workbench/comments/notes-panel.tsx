'use client';
import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { CommentThread } from '@/lib/comments/store';
import { PANEL, EMPTY, EMPTY_TITLE } from '../chrome';
import type { CanvasNotes, NoteFilter, NoteStatus } from './use-canvas-notes';
import { NOTE_META, NOTE_KINDS } from './note-meta';
import { NoteTool } from './note-tool';
export function NotesPanel({ notes, onOpen, targetLabel, onStart, allowCanvas = true }: {
  onStart?: (kind: import('@/lib/comments/store').NoteKind) => void;
  allowCanvas?: boolean; notes: CanvasNotes; width: number; onWidthChange: (width: number) => void;
  onOpen: (thread: CommentThread) => void; targetLabel: (thread: CommentThread) => string;
}) {
  const [position, setPosition] = useState({ x: 0, y: 88 });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  return <aside aria-label="Notes panel" style={{ width: 340, height: 520, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 100px)', left: position.x || Math.max(12, window.innerWidth / 2 - 170), top: position.y, resize: 'both' }} className={`${PANEL} absolute z-30 flex min-h-[260px] min-w-[260px] flex-col overflow-hidden`}>
      <div className="flex h-[50px] shrink-0 touch-none items-center justify-between border-b border-line-soft px-3 cursor-move"
        onPointerDown={event => { if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return; const rect = event.currentTarget.parentElement!.getBoundingClientRect(); drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (drag.current) { const rect = event.currentTarget.parentElement!.getBoundingClientRect(); setPosition({ x: Math.max(12, Math.min(window.innerWidth - rect.width - 12, drag.current.left + event.clientX - drag.current.x)), y: Math.max(76, Math.min(window.innerHeight - 100, drag.current.top + event.clientY - drag.current.y)) }); } }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
        <h2 className="text-sm font-medium">Notes</h2><button aria-label="Close notes panel" className="rounded p-1 hover:bg-accent" onClick={() => { notes.setNotesOpen(false); notes.cancel(); notes.commentsProps.onCloseThread(); }}><X className="size-4" /></button>
      </div>
      <div className="space-y-3 border-b border-line-soft p-3">
        <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Feedback and annotations</span><NoteTool libraries={!!onStart} label="Place a note" menuLabel="Add note options" active={notes.commentMode} kind={notes.kind} onToggle={notes.toggle} onStart={onStart ?? notes.start} /></div>
        <div role="group" aria-label="Note type filters" className="grid grid-cols-2 gap-1">{(['all', ...NOTE_KINDS] as NoteFilter[]).map(type => {
          const label = type === 'all' ? 'All' : NOTE_META[type].plural;
          const count = notes.threads.filter(t => (type === 'all' || (t.kind ?? 'comment') === type) && (notes.status === 'all' || Boolean(t.resolvedAt) === (notes.status === 'resolved'))).length;
          return <button key={type} aria-pressed={notes.filter === type} onClick={() => { notes.setFilter(type); notes.commentsProps.onCloseThread(); }} className={`rounded-md px-2 py-1.5 text-left text-xs ${notes.filter === type ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{label} <span className="tabular-nums opacity-70">{count}</span></button>;
        })}</div>
        <label className="flex items-center justify-between text-xs text-muted-foreground">Show<select aria-label="Note status" value={notes.status} onChange={e => { notes.setStatus(e.target.value as NoteStatus); notes.commentsProps.onCloseThread(); }} className="rounded border bg-card px-2 py-1 text-foreground"><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All statuses</option></select></label>
        {notes.commentMode && <p role="status" className="text-xs text-muted-foreground">Click {allowCanvas ? 'an element, frame, or empty canvas' : 'an element or the component frame'} to add {notes.kind === 'annotation' ? 'an annotation' : notes.kind === 'accessibility' ? 'an accessibility note' : 'a comment'}. Press Esc to cancel.</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{notes.filtered.length ? notes.filtered.map(thread => {
        const meta = NOTE_META[thread.kind ?? 'comment']; const Icon = meta.icon;
        return <button key={thread.id} onClick={() => onOpen(thread)} aria-label={`Open ${meta.label.toLowerCase()}: ${thread.title || thread.text}`} className={`mb-1 flex w-full gap-2 rounded-lg border p-3 text-left hover:bg-muted ${notes.commentsProps.openThreadId === thread.id ? 'border-acc bg-accent/40' : 'border-transparent'}`}>
          <Icon className={`mt-0.5 size-4 shrink-0 ${meta.text}`} aria-hidden /><span className="min-w-0 flex-1"><span className="block text-[10px] text-muted-foreground">{meta.label}{thread.resolvedAt ? ' · Resolved' : ''}</span><span className="line-clamp-2 break-words text-xs font-medium">{thread.title || thread.text}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{thread.author} · {targetLabel(thread)}</span></span>
        </button>;
      }) : <div className={EMPTY}><p className={EMPTY_TITLE}>No notes here</p><p>Add a note or change the filters.</p></div>}</div>
      <p className="border-t border-line-soft p-3 text-[10px] text-muted-foreground">Saved in this browser. Notes aren’t shared with other viewers yet.</p>
  </aside>;
}
