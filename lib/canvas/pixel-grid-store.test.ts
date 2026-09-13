import { describe, expect, it } from 'vitest';
import { loadPixelGridVisible, savePixelGridVisible } from './pixel-grid-store';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('pixel grid store', () => {
  it('defaults to visible when nothing is stored yet', () => {
    expect(loadPixelGridVisible(fakeStorage())).toBe(true);
  });

  it('round-trips false through save and load', () => {
    const storage = fakeStorage();
    savePixelGridVisible(storage, false);
    expect(loadPixelGridVisible(storage)).toBe(false);
  });

  it('round-trips true through save and load', () => {
    const storage = fakeStorage();
    savePixelGridVisible(storage, false);
    savePixelGridVisible(storage, true);
    expect(loadPixelGridVisible(storage)).toBe(true);
  });

  it('is stored under the assembly-workbench:pixel-grid key', () => {
    const storage = fakeStorage();
    savePixelGridVisible(storage, false);
    expect(storage.getItem('assembly-workbench:pixel-grid')).toBe('false');
  });

  it('falls back to visible when the storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: () => {
        throw new Error('disabled');
      },
    };
    expect(loadPixelGridVisible(throwing)).toBe(true);
    expect(() => savePixelGridVisible(throwing, false)).not.toThrow();
  });
});
