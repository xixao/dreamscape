import { describe, expect, it } from 'vitest';
import { loadViewport, saveViewport, type ViewportStorageLike } from './viewport-store';
import { MAX_ZOOM, MIN_ZOOM } from './viewport';

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
    expect(loadViewport(memoryStorage(), 'file1', 'page1')).toBeNull();
  });

  it('round-trips a saved viewport', () => {
    const storage = memoryStorage();
    saveViewport(storage, 'file1', 'page1', { x: 12, y: -34, zoom: 1.5 });
    expect(loadViewport(storage, 'file1', 'page1')).toEqual({ x: 12, y: -34, zoom: 1.5 });
  });

  it('keeps different files independent, keyed by fileId', () => {
    const storage = memoryStorage();
    saveViewport(storage, 'file1', 'page1', { x: 1, y: 1, zoom: 1 });
    saveViewport(storage, 'file2', 'page1', { x: 2, y: 2, zoom: 2 });
    expect(loadViewport(storage, 'file1', 'page1')).toEqual({ x: 1, y: 1, zoom: 1 });
    expect(loadViewport(storage, 'file2', 'page1')).toEqual({ x: 2, y: 2, zoom: 2 });
  });

  it('keeps different pages of the same file independent, keyed by pageId', () => {
    const storage = memoryStorage();
    saveViewport(storage, 'file1', 'page1', { x: 1, y: 1, zoom: 1 });
    saveViewport(storage, 'file1', 'page2', { x: 9, y: 9, zoom: 2 });
    expect(loadViewport(storage, 'file1', 'page1')).toEqual({ x: 1, y: 1, zoom: 1 });
    expect(loadViewport(storage, 'file1', 'page2')).toEqual({ x: 9, y: 9, zoom: 2 });
  });

  it('is tolerant of corrupt JSON, returning null', () => {
    const storage = memoryStorage({ 'assembly-workbench:viewport:file1:page1': 'not json' });
    expect(loadViewport(storage, 'file1', 'page1')).toBeNull();
  });

  it('is tolerant of a value missing a required field, returning null', () => {
    const storage = memoryStorage({ 'assembly-workbench:viewport:file1:page1': JSON.stringify({ x: 1, y: 2 }) });
    expect(loadViewport(storage, 'file1', 'page1')).toBeNull();
  });

  it('is tolerant of non-numeric fields, returning null', () => {
    const storage = memoryStorage({
      'assembly-workbench:viewport:file1:page1': JSON.stringify({ x: '1', y: 2, zoom: 1 }),
    });
    expect(loadViewport(storage, 'file1', 'page1')).toBeNull();
  });

  it('is tolerant of a zoom outside [MIN_ZOOM, MAX_ZOOM], returning null so the caller falls back to fit', () => {
    const storage = memoryStorage({
      'assembly-workbench:viewport:file1:page1': JSON.stringify({ x: 0, y: 0, zoom: MIN_ZOOM - 0.01 }),
      'assembly-workbench:viewport:file2:page1': JSON.stringify({ x: 0, y: 0, zoom: MAX_ZOOM + 0.01 }),
    });
    expect(loadViewport(storage, 'file1', 'page1')).toBeNull();
    expect(loadViewport(storage, 'file2', 'page1')).toBeNull();
  });

  it('accepts a zoom exactly at MIN_ZOOM or MAX_ZOOM (the range is inclusive)', () => {
    const storage = memoryStorage({
      'assembly-workbench:viewport:file1:page1': JSON.stringify({ x: 0, y: 0, zoom: MIN_ZOOM }),
      'assembly-workbench:viewport:file2:page1': JSON.stringify({ x: 0, y: 0, zoom: MAX_ZOOM }),
    });
    expect(loadViewport(storage, 'file1', 'page1')).toEqual({ x: 0, y: 0, zoom: MIN_ZOOM });
    expect(loadViewport(storage, 'file2', 'page1')).toEqual({ x: 0, y: 0, zoom: MAX_ZOOM });
  });

  it('is tolerant of a zoom that overflows to Infinity from a huge JSON number literal, returning null', () => {
    // JSON has no NaN/Infinity literal (JSON.parse throws on one, which the
    // existing try/catch already handles) - a huge exponent is the
    // realistic way real JSON produces a non-finite JS number: it is
    // syntactically a plain number, but overflows `double` on parse.
    const storage = memoryStorage({
      'assembly-workbench:viewport:file1:page1': '{"x":0,"y":0,"zoom":1e400}',
    });
    expect(loadViewport(storage, 'file1', 'page1')).toBeNull();
  });

  it('is tolerant of an x or y that overflows to Infinity from a huge JSON number literal, returning null', () => {
    const storageX = memoryStorage({ 'assembly-workbench:viewport:filex:page1': '{"x":1e400,"y":0,"zoom":1}' });
    const storageY = memoryStorage({ 'assembly-workbench:viewport:filey:page1': '{"x":0,"y":-1e400,"zoom":1}' });
    expect(loadViewport(storageX, 'filex', 'page1')).toBeNull();
    expect(loadViewport(storageY, 'filey', 'page1')).toBeNull();
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
    expect(loadViewport(throwing, 'file1', 'page1')).toBeNull();
  });

  it('does not throw when setItem is blocked (private mode, full quota)', () => {
    const throwing: ViewportStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveViewport(throwing, 'file1', 'page1', { x: 0, y: 0, zoom: 1 })).not.toThrow();
  });
});
