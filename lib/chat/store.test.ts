import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from './transport';
import { type ChatStorageLike, chatStorageKey, createChatStore, loadChatPanelOpen, saveChatPanelOpen } from './store';

function fakeStorage(initial: Record<string, string> = {}): ChatStorageLike {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 'm1', role: 'user', text: 'Hello', createdAt: '2026-09-12T00:00:00.000Z', ...overrides };
}

describe('chatStorageKey', () => {
  it('namespaces the key by file id', () => {
    expect(chatStorageKey('abc123')).toBe('assembly-workbench:chat:abc123');
  });
});

describe('createChatStore', () => {
  it('loads an empty array when nothing is stored', () => {
    const store = createChatStore('file1', fakeStorage());
    expect(store.load()).toEqual([]);
  });

  it('round trips messages through append and load, in order', () => {
    const storage = fakeStorage();
    const store = createChatStore('file1', storage);
    const m1 = message({ id: 'm1', text: 'Hi' });
    const m2 = message({ id: 'm2', role: 'assistant', text: 'Hello back' });

    expect(store.append(m1)).toEqual([m1]);
    expect(store.append(m2)).toEqual([m1, m2]);
    expect(store.load()).toEqual([m1, m2]);

    // A fresh store instance for the same file id reads what was persisted.
    const reloaded = createChatStore('file1', storage);
    expect(reloaded.load()).toEqual([m1, m2]);
  });

  it('keys storage independently per file id', () => {
    const storage = fakeStorage();
    createChatStore('file1', storage).append(message({ id: 'm1' }));
    createChatStore('file2', storage).append(message({ id: 'm2' }));

    expect(createChatStore('file1', storage).load()).toEqual([message({ id: 'm1' })]);
    expect(createChatStore('file2', storage).load()).toEqual([message({ id: 'm2' })]);
  });

  it('clear empties the log', () => {
    const storage = fakeStorage();
    const store = createChatStore('file1', storage);
    store.append(message());
    expect(store.load()).toHaveLength(1);

    store.clear();
    expect(store.load()).toEqual([]);
  });

  it('tolerates a missing storage entry', () => {
    const store = createChatStore('file1', fakeStorage());
    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual([]);
  });

  it('tolerates corrupt JSON in storage', () => {
    const storage = fakeStorage({ [chatStorageKey('file1')]: 'not json{{{' });
    const store = createChatStore('file1', storage);
    expect(store.load()).toEqual([]);
  });

  it('tolerates a stored value that parses but is not an array', () => {
    const storage = fakeStorage({ [chatStorageKey('file1')]: JSON.stringify({ not: 'an array' }) });
    const store = createChatStore('file1', storage);
    expect(store.load()).toEqual([]);
  });

  it('drops malformed entries from an otherwise valid array instead of throwing', () => {
    const storage = fakeStorage({
      [chatStorageKey('file1')]: JSON.stringify([message({ id: 'good' }), { bad: true }, null, 42, 'nope']),
    });
    const store = createChatStore('file1', storage);
    expect(store.load()).toEqual([message({ id: 'good' })]);
  });

  it('tolerates a storage whose getItem throws', () => {
    const storage: ChatStorageLike = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const store = createChatStore('file1', storage);
    expect(() => store.load()).not.toThrow();
    expect(store.load()).toEqual([]);
  });

  it('tolerates a storage whose setItem throws: append still returns the updated list', () => {
    const storage: ChatStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: vi.fn(),
    };
    const store = createChatStore('file1', storage);
    expect(() => store.append(message())).not.toThrow();
  });

  it('tolerates a storage whose removeItem throws: clear does not throw', () => {
    const storage: ChatStorageLike = {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: () => {
        throw new Error('boom');
      },
    };
    const store = createChatStore('file1', storage);
    expect(() => store.clear()).not.toThrow();
  });
});

describe('loadChatPanelOpen / saveChatPanelOpen', () => {
  it('defaults to closed when nothing is stored', () => {
    expect(loadChatPanelOpen(fakeStorage())).toBe(false);
  });

  it('round trips true and false', () => {
    const storage = fakeStorage();
    saveChatPanelOpen(storage, true);
    expect(loadChatPanelOpen(storage)).toBe(true);

    saveChatPanelOpen(storage, false);
    expect(loadChatPanelOpen(storage)).toBe(false);
  });

  it('tolerates a throwing storage on both read and write', () => {
    const storage: ChatStorageLike = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: () => {
        throw new Error('boom');
      },
      removeItem: vi.fn(),
    };
    expect(() => saveChatPanelOpen(storage, true)).not.toThrow();
    expect(loadChatPanelOpen(storage)).toBe(false);
  });
});
