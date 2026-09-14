import { describe, expect, it, vi } from 'vitest';
import {
  loadPanelCollapsed,
  loadPanelMode,
  savePanelCollapsed,
  savePanelMode,
  type PanelStorageLike,
} from './panel-store';

function fakeStorage(initial: Record<string, string> = {}): PanelStorageLike {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('loadPanelMode / savePanelMode', () => {
  it('defaults to design when nothing is stored', () => {
    expect(loadPanelMode(fakeStorage())).toBe('design');
  });

  it('round trips design, prototype, components and diagrams', () => {
    const storage = fakeStorage();
    for (const mode of ['design', 'prototype', 'components', 'diagrams'] as const) {
      savePanelMode(storage, mode);
      expect(loadPanelMode(storage)).toBe(mode);
    }
  });

  it('falls back to design for a corrupt or unrecognized stored value', () => {
    expect(loadPanelMode(fakeStorage({ 'assembly-workbench:panel-mode': 'not-a-mode' }))).toBe('design');
    expect(loadPanelMode(fakeStorage({ 'assembly-workbench:panel-mode': '' }))).toBe('design');
  });

  // The Diagrams tab (spec docs/superpowers/specs/2026-09-14-panel-tabs-
  // icons-design.md) is a new, fourth PANEL_MODES entry - a value that only
  // ever looked plausible (never actually stored by any released build) must
  // still be ignored the same way any other unrecognized string is.
  it('ignores an old/removed panel mode value, falling back to design', () => {
    expect(loadPanelMode(fakeStorage({ 'assembly-workbench:panel-mode': 'elements' }))).toBe('design');
  });

  it('tolerates a storage whose getItem throws', () => {
    const storage: PanelStorageLike = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: vi.fn(),
    };
    expect(() => loadPanelMode(storage)).not.toThrow();
    expect(loadPanelMode(storage)).toBe('design');
  });

  it('tolerates a storage whose setItem throws', () => {
    const storage: PanelStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => savePanelMode(storage, 'prototype')).not.toThrow();
  });
});

describe('loadPanelCollapsed / savePanelCollapsed', () => {
  it('defaults to expanded (false) when nothing is stored', () => {
    expect(loadPanelCollapsed(fakeStorage())).toBe(false);
  });

  it('round trips true and false', () => {
    const storage = fakeStorage();
    savePanelCollapsed(storage, true);
    expect(loadPanelCollapsed(storage)).toBe(true);

    savePanelCollapsed(storage, false);
    expect(loadPanelCollapsed(storage)).toBe(false);
  });

  it('tolerates a throwing storage on both read and write', () => {
    const storage: PanelStorageLike = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: () => {
        throw new Error('boom');
      },
    };
    expect(() => savePanelCollapsed(storage, true)).not.toThrow();
    expect(loadPanelCollapsed(storage)).toBe(false);
  });
});
