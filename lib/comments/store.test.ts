import { describe, expect, it, vi } from 'vitest';
import { createCommentStore, getAuthorName, setAuthorName } from './store';

// A minimal in-memory Storage, standing in for localStorage so these tests
// never touch the real browser storage and can run several independent
// instances side by side without interfering with each other.
function fakeStorage(): Storage {
  let data: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = String(value);
    },
    removeItem: (key: string) => {
      delete data[key];
    },
    clear: () => {
      data = {};
    },
    key: (index: number) => Object.keys(data)[index] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  };
}

describe('createCommentStore', () => {
  it('round trips a thread through a fake storage', () => {
    const storage = fakeStorage();
    const store = createCommentStore('file1', storage);
    store.add({ x: 12, y: 34, author: 'Matt', text: 'Move this button up' });

    // A second store instance over the SAME storage picks up what the first
    // one wrote - this is the persistence contract a reload relies on.
    const reopened = createCommentStore('file1', storage);
    const threads = reopened.list();
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ x: 12, y: 34, author: 'Matt', text: 'Move this button up', replies: [] });
    expect(threads[0].id).toEqual(expect.any(String));
    expect(threads[0].createdAt).toEqual(expect.any(String));
  });

  it('keeps threads for different files separate', () => {
    const storage = fakeStorage();
    createCommentStore('file1', storage).add({ x: 0, y: 0, author: 'Matt', text: 'On file 1' });
    const other = createCommentStore('file2', storage);
    expect(other.list()).toHaveLength(0);
  });

  it('keeps the anchorNodeId when given, omits it when not', () => {
    const storage = fakeStorage();
    const store = createCommentStore('file1', storage);
    store.add({ x: 0, y: 0, author: 'Matt', text: 'Anchored', anchorNodeId: 'node-42' });
    store.add({ x: 0, y: 0, author: 'Matt', text: 'Unanchored' });
    const [anchored, unanchored] = store.list();
    expect(anchored.anchorNodeId).toBe('node-42');
    expect(unanchored.anchorNodeId).toBeUndefined();
  });

  it('appends a reply to the right thread', () => {
    const storage = fakeStorage();
    const store = createCommentStore('file1', storage);
    const thread = store.add({ x: 0, y: 0, author: 'Matt', text: 'First' });
    store.add({ x: 5, y: 5, author: 'Matt', text: 'Second' });

    store.reply(thread.id, { author: 'Priya', text: 'Agreed' });

    const threads = store.list();
    const updated = threads.find((t) => t.id === thread.id);
    expect(updated?.replies).toHaveLength(1);
    expect(updated?.replies[0]).toMatchObject({ author: 'Priya', text: 'Agreed' });
    expect(updated?.replies[0].id).toEqual(expect.any(String));
    // The other thread is untouched.
    expect(threads.find((t) => t.text === 'Second')?.replies).toHaveLength(0);
  });

  it('reply on an unknown thread id is a no-op', () => {
    const storage = fakeStorage();
    const store = createCommentStore('file1', storage);
    store.add({ x: 0, y: 0, author: 'Matt', text: 'First' });
    expect(store.reply('does-not-exist', { author: 'Priya', text: 'Agreed' })).toBeNull();
    expect(store.list()[0].replies).toHaveLength(0);
  });

  it('resolve preserves the discussion and persists its resolved status', () => {
    const storage = fakeStorage();
    const store = createCommentStore('file1', storage);
    const thread = store.add({ x: 0, y: 0, author: 'Matt', text: 'First' });
    store.add({ x: 1, y: 1, author: 'Matt', text: 'Second' });

    store.resolve(thread.id);

    expect(store.list()).toHaveLength(2);
    expect(store.list()[0].resolvedAt).toEqual(expect.any(String));
    expect(createCommentStore('file1', storage).list()[0].resolvedAt).toBeTruthy();
    store.reopen(thread.id);
    expect(store.list()[0].resolvedAt).toBeUndefined();
  });

  it('keeps annotations and accessibility requirements unresolved and supports editing and deletion', () => {
    const storage = fakeStorage(); const store = createCommentStore('notes', storage);
    const annotation = store.add({ x: 1, y: 2, kind: 'annotation', title: 'Width', text: '720px', author: 'Designer', screenId: 's1', anchorNodeId: 'button', anchorOffset: { x: 1, y: 0 } });
    const requirement = store.add({ x: 1, y: 2, kind: 'accessibility', accessibilityKind: 'requirement', text: 'Focus', author: 'Designer' });
    store.resolve(annotation.id); store.resolve(requirement.id);
    expect(store.list().every(t => !t.resolvedAt)).toBe(true);
    store.update(annotation.id, { title: 'Maximum width', text: '680px' });
    expect(createCommentStore('notes', storage).list()[0]).toMatchObject({ title: 'Maximum width', text: '680px', anchorOffset: { x: 1, y: 0 }, screenId: 's1' });
    store.remove(annotation.id);
    expect(store.list()).toHaveLength(1);
  });

  it('tolerates corrupt JSON in storage, starting empty rather than throwing', () => {
    const storage = fakeStorage();
    storage.setItem('assembly-workbench:comments:file1', '{not json');
    expect(() => createCommentStore('file1', storage)).not.toThrow();
    expect(createCommentStore('file1', storage).list()).toEqual([]);
  });

  it('tolerates a storage value that is valid JSON but not an array', () => {
    const storage = fakeStorage();
    storage.setItem('assembly-workbench:comments:file1', '{"oops":true}');
    expect(createCommentStore('file1', storage).list()).toEqual([]);
  });

  it('notifies subscribers on add, reply and resolve', () => {
    const storage = fakeStorage();
    const store = createCommentStore('file1', storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const thread = store.add({ x: 0, y: 0, author: 'Matt', text: 'First' });
    expect(listener).toHaveBeenCalledTimes(1);
    store.reply(thread.id, { author: 'Priya', text: 'Reply' });
    expect(listener).toHaveBeenCalledTimes(2);
    store.resolve(thread.id);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    store.add({ x: 0, y: 0, author: 'Matt', text: 'After unsubscribe' });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('author name', () => {
  it('is null until set', () => {
    const storage = fakeStorage();
    expect(getAuthorName(storage)).toBeNull();
  });

  it('persists across separate calls against the same storage', () => {
    const storage = fakeStorage();
    setAuthorName('Matt', storage);
    expect(getAuthorName(storage)).toBe('Matt');
  });

  it('is independent per storage instance', () => {
    setAuthorName('Matt', fakeStorage());
    expect(getAuthorName(fakeStorage())).toBeNull();
  });
});
