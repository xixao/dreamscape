import { describe, expect, it } from 'vitest';
import { loadViewport, saveViewport, type ViewportStorageLike } from './viewport-store';

function memoryStorage(initial: Record<string, string> = {}): ViewportStorageLike {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe('loadViewport', () => {
  it('returns null when nothing is stored for this file', () => {
    expect(loadViewport(memoryStorage(), 'file1')).toBeNull();
  });

  it('round-trips a saved viewport', () => {
    const storage = memoryStorage();
    saveViewport(storage, 'file1', { x: 12, y: -34, zoom: 1.5 });
    expect(loadViewport(storage, 'file1')).toEqual({ x: 12, y: -34, zoom: 1.5 });
  });

  it('keeps different files independent, keyed by fileId', () => {
    const storage = memoryStorage();
    saveViewport(storage, 'file1', { x: 1, y: 1, zoom: 1 });
    saveViewport(storage, 'file2', { x: 2, y: 2, zoom: 2 });
    expect(loadViewport(storage, 'file1')).toEqual({ x: 1, y: 1, zoom: 1 });
    expect(loadViewport(storage, 'file2')).toEqual({ x: 2, y: 2, zoom: 2 });
  });

  it('is tolerant of corrupt JSON, returning null', () => {
    const storage = memoryStorage({ 'assembly-workbench:viewport:file1': 'not json' });
    expect(loadViewport(storage, 'file1')).toBeNull();
  });

  it('is tolerant of a value missing a required field, returning null', () => {
    const storage = memoryStorage({ 'assembly-workbench:viewport:file1': JSON.stringify({ x: 1, y: 2 }) });
    expect(loadViewport(storage, 'file1')).toBeNull();
  });

  it('is tolerant of non-numeric fields, returning null', () => {
    const storage = memoryStorage({
      'assembly-workbench:viewport:file1': JSON.stringify({ x: '1', y: 2, zoom: 1 }),
    });
    expect(loadViewport(storage, 'file1')).toBeNull();
  });

  it('is tolerant of a storage that throws on getItem', () => {
    const throwing: ViewportStorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadViewport(throwing, 'file1')).toBeNull();
  });

  it('does not throw when setItem is blocked (private mode, full quota)', () => {
    const throwing: ViewportStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveViewport(throwing, 'file1', { x: 0, y: 0, zoom: 1 })).not.toThrow();
  });
});
