import { nanoid } from 'nanoid';

// Comments placeholder store (docs/superpowers/specs/2026-09-12-folders-and-comments-design.md
// section 5). Browser-only for now: everything lives in `storage` (localStorage
// in the app, a fake in tests), keyed per file so each design keeps its own
// thread list. There is no backend yet - `anchorNodeId` is carried along
// purely so a real one can use it later (the PRD pins comments to a node id).

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  fileId: string;
  x: number;
  y: number;
  anchorNodeId?: string;
  /** The page/screen context is optional for compatibility with old threads. */
  pageId?: string;
  screenId?: string;
  author: string;
  text: string;
  createdAt: string;
  replies: CommentReply[];
}

export interface CommentStore {
  list(): CommentThread[];
  add(input: { x: number; y: number; anchorNodeId?: string; pageId?: string; screenId?: string; author: string; text: string }): CommentThread;
  reply(threadId: string, input: { author: string; text: string }): CommentReply | null;
  resolve(threadId: string): void;
  subscribe(fn: () => void): () => void;
}

const AUTHOR_NAME_KEY = 'assembly-workbench:author-name';

function threadsKey(fileId: string): string {
  return `assembly-workbench:comments:${fileId}`;
}

// Every read and write is wrapped in try/catch: `storage` throws in some
// locked-down browser contexts (private mode, an embedded iframe with
// storage disabled), and a comments placeholder losing its data there is far
// better than it crashing the editor - the same tradeoff layer-stack-menu.tsx
// makes for its own sessionStorage hint counter.
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
    // reload. Nothing useful to surface to the user for a placeholder.
  }
}

export function createCommentStore(fileId: string, storage: Storage = localStorage): CommentStore {
  let threads = readThreads(fileId, storage);
  const listeners = new Set<() => void>();

  // The editor and presentation can be open in separate tabs. Storage events
  // keep each view current without changing the existing localStorage schema.
  // The originating tab still notifies its own subscribers through commit().
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== storage || event.key !== threadsKey(fileId)) return;
    try {
      const parsed: unknown = event.newValue ? JSON.parse(event.newValue) : [];
      threads = Array.isArray(parsed) ? (parsed as CommentThread[]) : [];
      for (const listener of listeners) listener();
    } catch {
      // Ignore malformed external data; the local view remains usable.
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  function commit(next: CommentThread[]): void {
    threads = next;
    writeThreads(fileId, storage, threads);
    for (const listener of listeners) listener();
  }

  return {
    list() {
      return threads;
    },
    add({ x, y, anchorNodeId, pageId, screenId, author, text }) {
      const thread: CommentThread = {
        id: nanoid(10),
        fileId,
        x,
        y,
        ...(anchorNodeId !== undefined ? { anchorNodeId } : {}),
        ...(pageId !== undefined ? { pageId } : {}),
        ...(screenId !== undefined ? { screenId } : {}),
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
      commit(threads.filter((thread) => thread.id !== threadId));
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
