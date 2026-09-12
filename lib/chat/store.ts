import type { ChatMessage, ChatRole } from './transport';

// Small enough surface that a plain object or the real window.localStorage
// both satisfy it - keeps this module testable without a DOM.
export interface ChatStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ChatStore {
  load(): ChatMessage[];
  append(message: ChatMessage): ChatMessage[];
  clear(): void;
}

const ROLES: ReadonlySet<string> = new Set<ChatRole>(['user', 'assistant']);

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.role === 'string' &&
    ROLES.has(candidate.role) &&
    typeof candidate.text === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

export function chatStorageKey(fileId: string): string {
  return `assembly-workbench:chat:${fileId}`;
}

// Conversation history per file, mirroring the shape a comments-style store
// would take: load/append/clear, tolerant of a missing key, corrupt JSON, a
// wrong-shaped value, or a storage that throws (private browsing, a full
// quota) - none of those should ever crash the panel, only leave it empty.
export function createChatStore(fileId: string, storage: ChatStorageLike): ChatStore {
  const key = chatStorageKey(fileId);

  function load(): ChatMessage[] {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isChatMessage) : [];
    } catch {
      return [];
    }
  }

  function persist(messages: ChatMessage[]): void {
    try {
      storage.setItem(key, JSON.stringify(messages));
    } catch {
      // Best effort only - a full or disabled store should not crash the panel.
    }
  }

  return {
    load,
    append(message) {
      const next = [...load(), message];
      persist(next);
      return next;
    },
    clear() {
      try {
        storage.removeItem(key);
      } catch {
        // Best effort only, matching persist() above.
      }
    },
  };
}

const PANEL_OPEN_KEY = 'assembly-workbench:chat-open';

// The chat panel's open/closed state, per browser rather than per file -
// deliberately separate from createChatStore's per-file conversation log.
export function loadChatPanelOpen(storage: ChatStorageLike): boolean {
  try {
    return storage.getItem(PANEL_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveChatPanelOpen(storage: ChatStorageLike, open: boolean): void {
  try {
    storage.setItem(PANEL_OPEN_KEY, open ? 'true' : 'false');
  } catch {
    // Best effort only, matching createChatStore's persist().
  }
}
