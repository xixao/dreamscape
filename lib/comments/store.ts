import { nanoid } from 'nanoid';

export type NoteKind = 'comment' | 'annotation' | 'accessibility';
export type AccessibilityKind = 'requirement' | 'question' | 'issue';
export interface NoteDetails {
  kind?: NoteKind;
  title?: string;
  accessibilityKind?: AccessibilityKind;
}
export interface NoteAnchor {
  screenId?: string;
  pageId?: string;
  canvas?: boolean;
  anchorNodeId?: string;
  anchorLabel?: string;
  /** Position within the element, normalized so it follows resizing. */
  anchorOffset?: { x: number; y: number };
}
export function canResolve(thread: NoteDetails): boolean {
  return thread.kind !== 'annotation' && !(thread.kind === 'accessibility' && (thread.accessibilityKind ?? 'requirement') === 'requirement');
}

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface CommentThread extends NoteDetails, NoteAnchor {
  resolvedAt?: string;
  number?: number;
  id: string;
  fileId: string;
  x: number;
  y: number;
  author: string;
  text: string;
  createdAt: string;
  replies: CommentReply[];
}

export interface CommentStore {
  list(): CommentThread[];
  add(input: NoteDetails & NoteAnchor & { x: number; y: number; author: string; text: string }): CommentThread;
  reply(threadId: string, input: { author: string; text: string }): CommentReply | null;
  resolve(threadId: string): void;
  reopen(threadId: string): void;
  update(threadId: string, patch: NoteDetails & { text: string }): void;
  move(threadId: string, position: { x: number; y: number; anchorOffset?: { x: number; y: number } }): void;
  remove(threadId: string): void;
  subscribe(fn: () => void): () => void;
}

const AUTHOR_NAME_KEY = 'assembly-workbench:author-name';

function threadsKey(fileId: string): string {
  return `assembly-workbench:comments:${fileId}`;
}

// Every read and write is wrapped in try/catch: `storage` throws in some
// locked-down browser contexts (private mode, an embedded iframe with
// storage disabled). Keep the editor usable when storage is unavailable.
function readThreads(fileId: string, storage: Storage): CommentThread[] {
  try {
    const raw = storage.getItem(threadsKey(fileId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CommentThread[]) : [];
  } catch {
    return [];
  }
}

function writeThreads(fileId: string, storage: Storage, threads: CommentThread[]): void {
  try {
    storage.setItem(threadsKey(fileId), JSON.stringify(threads));
  } catch {
    // Quota exceeded or storage unavailable: the in-memory state (and this
    // session's UI) still reflects the change, it just will not survive a
    // reload.
  }
}

export function createCommentStore(fileId: string, storage: Storage = localStorage): CommentStore {
  let threads = readThreads(fileId, storage);
  const listeners = new Set<() => void>();

  function commit(next: CommentThread[]): void {
    threads = next;
    writeThreads(fileId, storage, threads);
    for (const listener of listeners) listener();
  }

  return {
    list() {
      return threads;
    },
    add({ x, y, author, text, ...details }) {
      const thread: CommentThread = {
        id: nanoid(10),
        fileId,
        number: Math.max(0, ...threads.map((thread, index) => thread.number ?? index + 1)) + 1,
        x,
        y,
        ...details,
        kind: details.kind ?? 'comment',
        author,
        text,
        createdAt: new Date().toISOString(),
        replies: [],
      };
      commit([...threads, thread]);
      return thread;
    },
    reply(threadId, { author, text }) {
      const index = threads.findIndex((thread) => thread.id === threadId);
      if (index === -1) return null;
      const reply: CommentReply = { id: nanoid(10), author, text, createdAt: new Date().toISOString() };
      const updated: CommentThread = { ...threads[index], replies: [...threads[index].replies, reply] };
      commit([...threads.slice(0, index), updated, ...threads.slice(index + 1)]);
      return reply;
    },
    resolve(threadId) {
      commit(threads.map(thread => thread.id === threadId && canResolve(thread) ? { ...thread, resolvedAt: new Date().toISOString() } : thread));
    },
    reopen(threadId) {
      commit(threads.map(thread => thread.id === threadId ? { ...thread, resolvedAt: undefined } : thread));
    },
    update(threadId, patch) {
      commit(threads.map(thread => thread.id === threadId ? { ...thread, ...patch, resolvedAt: canResolve({ ...thread, ...patch }) ? thread.resolvedAt : undefined } : thread));
    },
    move(threadId, position) {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
      commit(threads.map(thread => thread.id === threadId ? { ...thread, ...position, anchorOffset: position.anchorOffset, ...(!position.anchorOffset ? { anchorNodeId: undefined, anchorLabel: undefined } : {}) } : thread));
    },
    remove(threadId) {
      commit(threads.filter(thread => thread.id !== threadId));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function getAuthorName(storage: Storage = localStorage): string | null {
  try {
    return storage.getItem(AUTHOR_NAME_KEY);
  } catch {
    return null;
  }
}

export function setAuthorName(name: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(AUTHOR_NAME_KEY, name);
  } catch {
    // Ignored - see the comment on writeThreads above.
  }
}
