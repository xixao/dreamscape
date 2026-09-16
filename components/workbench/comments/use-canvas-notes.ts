'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createCommentStore, getAuthorName, setAuthorName, type NoteKind, type CommentThread } from '@/lib/comments/store';
import type { PendingPin, StageCommentsProps } from './comment-layer';
export type NoteFilter = 'all' | NoteKind;
export type NoteStatus = 'open' | 'resolved' | 'all';

export function useCanvasNotes(fileId: string, screenId?: string, legacyScreenId?: string, pageId?: string) {
  const [store] = useState(() => createCommentStore(fileId));
  const threads = useSyncExternalStore(store.subscribe, store.list, store.list);
  const [visible, setVisible] = useState(true);
  const [commentMode, setCommentMode] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [kind, setKind] = useState<NoteKind>('comment');
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [status, setStatus] = useState<NoteStatus>('open');
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [authorName, setAuthor] = useState<string | null>(() => getAuthorName());
  useEffect(() => { setPendingPin(null); }, [screenId, pageId]);
  const filtered = threads.filter(t => (filter === 'all' || (t.kind ?? 'comment') === filter) && (status === 'all' || Boolean(t.resolvedAt) === (status === 'resolved')));
  function cancel() { setPendingPin(null); setCommentMode(false); }
  function start(next: NoteKind) { setVisible(true); setKind(next); setFilter('all'); setStatus('open'); setPendingPin(null); setOpenThreadId(null); setNotesOpen(true); setCommentMode(true); }
  function open(thread: CommentThread) { setVisible(true); setPendingPin(null); setCommentMode(false); setOpenThreadId(thread.id); setNotesOpen(true); }
  const commentsProps: StageCommentsProps = {
    visible, commentMode, noteKind: kind,
    threads: filtered.filter(t => !t.canvas && (t.screenId ?? legacyScreenId) === screenId),
    pendingPin: pendingPin?.canvas ? null : pendingPin, openThreadId, authorName,
    onPlacePin: (x, y, anchorNodeId, anchor) => { setOpenThreadId(null); setPendingPin({ x, y, anchorNodeId, screenId, pageId, ...anchor }); },
    onCancelPending: cancel,
    onSubmitComment: input => {
      if (!pendingPin) return;
      setAuthorName(input.author); setAuthor(input.author);
      const thread = store.add({ ...pendingPin, ...input, kind });
      setPendingPin(null); setCommentMode(false); setOpenThreadId(thread.id);
    },
    onPinClick: id => { const thread = threads.find(t => t.id === id); if (thread) open(thread); },
    onCloseThread: () => setOpenThreadId(null),
    onSubmitReply: (id, input) => { setAuthorName(input.author); setAuthor(input.author); store.reply(id, input); },
    onResolveThread: id => { store.resolve(id); setOpenThreadId(null); },
    onReopenThread: id => { store.reopen(id); setOpenThreadId(null); },
    onEditThread: (id, patch) => store.update(id, patch),
    onMovePin: (id, position) => store.move(id, position),
    onDeleteThread: id => { store.remove(id); setOpenThreadId(null); },
  };
  function toggleVisibility() {
    if (visible) { cancel(); setOpenThreadId(null); }
    setVisible(!visible);
  }
  return { visible, setVisible, toggleVisibility, threads, filtered, filter, setFilter, status, setStatus, notesOpen, setNotesOpen, commentMode, kind, start, cancel, open,
    toggle: () => { if (commentMode) cancel(); else start(kind); },
    commentsProps,
    canvasComments: { ...commentsProps, threads: filtered.filter(t => t.canvas && t.pageId === pageId), pendingPin: pendingPin?.canvas ? pendingPin : null },
  };
}
export type CanvasNotes = ReturnType<typeof useCanvasNotes>;
