import { afterEach, describe, expect, it } from 'vitest';
import { SHORTCUTS, SHORTCUTS_BY_ID, detectPlatform, formatKeys, matchShortcut, type ShortcutKeyEvent } from './shortcuts';

// Builds a plain object satisfying ShortcutKeyEvent (the small subset of
// KeyboardEvent matchShortcut reads) rather than a real KeyboardEvent -
// keeps every case below a one-line literal instead of DOM construction.
function key(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return { key: '', code: '', metaKey: false, ctrlKey: false, shiftKey: false, ...overrides };
}

function withNavigatorProperty<T>(name: 'platform' | 'userAgentData', value: T, fn: () => void): void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, name);
  Object.defineProperty(window.navigator, name, { value, configurable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(window.navigator, name, original);
    else delete (window.navigator as unknown as Record<string, unknown>)[name];
  }
}

describe('SHORTCUTS registry', () => {
  it('gives every entry an id, area, label and at least one key', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.id).toBeTruthy();
      expect(shortcut.area).toBeTruthy();
      expect(shortcut.label).toBeTruthy();
      expect(shortcut.keys.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids', () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate key combination within the same guard class (always vs. guarded)', () => {
    const seen = { always: new Set<string>(), guarded: new Set<string>() };
    for (const shortcut of SHORTCUTS) {
      const bucket = shortcut.always ? seen.always : seen.guarded;
      const signature = shortcut.keys.join('+');
      expect(bucket.has(signature)).toBe(false);
      bucket.add(signature);
    }
  });

  it('exposes a by-id lookup matching the array', () => {
    for (const shortcut of SHORTCUTS) {
      expect(SHORTCUTS_BY_ID[shortcut.id]).toBe(shortcut);
    }
  });

  it('marks the modifier shortcuts that must work while typing as always, and single keys as not', () => {
    const alwaysIds = ['chat-toggle-mod', 'panel-collapse', 'toggle-ui', 'present', 'zoom-in', 'zoom-out', 'zoom-reset'];
    for (const id of alwaysIds) {
      expect(SHORTCUTS_BY_ID[id]?.always).toBe(true);
    }
    const guardedIds = ['panel-design', 'panel-prototype', 'panel-elements', 'chat-toggle', 'tool-pointer', 'tool-comment', 'screen-new'];
    for (const id of guardedIds) {
      expect(SHORTCUTS_BY_ID[id]?.always).toBeFalsy();
    }
  });
});

describe('formatKeys', () => {
  it('concatenates mac glyphs with no separator', () => {
    expect(formatKeys(['D'], 'mac')).toBe('D');
    expect(formatKeys(['Mod', 'J'], 'mac')).toBe('⌘J');
    expect(formatKeys(['Mod', '.'], 'mac')).toBe('⌘.');
    expect(formatKeys(['Mod', '\\'], 'mac')).toBe('⌘\\');
    expect(formatKeys(['Mod', 'R'], 'mac')).toBe('⌘R');
    expect(formatKeys(['Shift', 'C'], 'mac')).toBe('⇧C');
    expect(formatKeys(['Mod', 'Z'], 'mac')).toBe('⌘Z');
    expect(formatKeys(['Shift', 'Mod', 'Z'], 'mac')).toBe('⇧⌘Z');
  });

  it('matches the zoom menu\'s existing hardcoded mac labels exactly', () => {
    expect(formatKeys(['Mod', '='], 'mac')).toBe('⌘=');
    expect(formatKeys(['Mod', '-'], 'mac')).toBe('⌘-');
    expect(formatKeys(['Mod', '0'], 'mac')).toBe('⌘0');
    expect(formatKeys(['Shift', '1'], 'mac')).toBe('⇧1');
    expect(formatKeys(['Shift', '2'], 'mac')).toBe('⇧2');
  });

  it('joins words with + on other platforms', () => {
    expect(formatKeys(['D'], 'other')).toBe('D');
    expect(formatKeys(['Mod', 'J'], 'other')).toBe('Ctrl+J');
    expect(formatKeys(['Shift', 'Mod', 'Z'], 'other')).toBe('Shift+Ctrl+Z');
    expect(formatKeys(['Shift', '1'], 'other')).toBe('Shift+1');
  });

  it('renders a leading Hold token as the word "Hold" plus the rest, platform-aware', () => {
    expect(formatKeys(['Hold', 'Mod'], 'mac')).toBe('Hold ⌘');
    expect(formatKeys(['Hold', 'Mod'], 'other')).toBe('Hold Ctrl');
  });

  it('passes named keys through unchanged on both platforms', () => {
    for (const platform of ['mac', 'other'] as const) {
      expect(formatKeys(['Delete'], platform)).toBe('Delete');
      expect(formatKeys(['Escape'], platform)).toBe('Escape');
      expect(formatKeys(['?'], platform)).toBe('?');
    }
  });
});

describe('matchShortcut', () => {
  it('matches the bare panel-tab letters, and ignores them with a modifier or shift held', () => {
    expect(matchShortcut(key({ key: 'd' }))).toBe('panel-design');
    expect(matchShortcut(key({ key: 'D' }))).toBe('panel-design');
    expect(matchShortcut(key({ key: 'p' }))).toBe('panel-prototype');
    expect(matchShortcut(key({ key: 'e' }))).toBe('panel-elements');
    expect(matchShortcut(key({ key: 'd', metaKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: 'p', shiftKey: true }))).toBeNull();
  });

  it('matches bare C for the chat toggle, and Shift+C for the comment tool', () => {
    expect(matchShortcut(key({ key: 'c' }))).toBe('chat-toggle');
    expect(matchShortcut(key({ key: 'C' }))).toBe('chat-toggle');
    expect(matchShortcut(key({ key: 'c', shiftKey: true }))).toBe('tool-comment');
    expect(matchShortcut(key({ key: 'C', shiftKey: true }))).toBe('tool-comment');
    expect(matchShortcut(key({ key: 'c', metaKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: 'c', ctrlKey: true }))).toBeNull();
  });

  it('matches Shift+D for the diagram palette, distinct from bare D', () => {
    expect(matchShortcut(key({ key: 'd', shiftKey: true }))).toBe('tool-diagram');
  });

  it('matches bare V for the pointer tool', () => {
    expect(matchShortcut(key({ key: 'v' }))).toBe('tool-pointer');
    expect(matchShortcut(key({ key: 'v', metaKey: true }))).toBeNull();
  });

  it('matches Shift+N for a new screen', () => {
    expect(matchShortcut(key({ key: 'n', shiftKey: true }))).toBe('screen-new');
    expect(matchShortcut(key({ key: 'n' }))).toBeNull();
  });

  it('matches Cmd+J and Ctrl+J for the chat toggle', () => {
    expect(matchShortcut(key({ key: 'j', metaKey: true }))).toBe('chat-toggle-mod');
    expect(matchShortcut(key({ key: 'j', ctrlKey: true }))).toBe('chat-toggle-mod');
  });

  it('matches Cmd+. for the panel collapse toggle', () => {
    expect(matchShortcut(key({ key: '.', metaKey: true }))).toBe('panel-collapse');
  });

  it('matches Cmd+\\ for show/hide UI', () => {
    expect(matchShortcut(key({ key: '\\', metaKey: true }))).toBe('toggle-ui');
  });

  it('matches Cmd+R for Present, but not Cmd+Shift+R (the browser hard-reload)', () => {
    expect(matchShortcut(key({ key: 'r', metaKey: true }))).toBe('present');
    expect(matchShortcut(key({ key: 'r', ctrlKey: true }))).toBe('present');
    expect(matchShortcut(key({ key: 'r', metaKey: true, shiftKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: 'r' }))).toBeNull();
  });

  it('matches the zoom in/out/reset chords by key or code, regardless of shift', () => {
    expect(matchShortcut(key({ key: '=', code: 'Equal', metaKey: true }))).toBe('zoom-in');
    expect(matchShortcut(key({ key: '+', code: 'Equal', metaKey: true, shiftKey: true }))).toBe('zoom-in');
    expect(matchShortcut(key({ key: '+', code: 'NumpadAdd', metaKey: true }))).toBe('zoom-in');
    expect(matchShortcut(key({ key: '-', code: 'Minus', metaKey: true }))).toBe('zoom-out');
    expect(matchShortcut(key({ key: '_', code: 'Minus', metaKey: true, shiftKey: true }))).toBe('zoom-out');
    expect(matchShortcut(key({ key: '-', code: 'NumpadSubtract', metaKey: true }))).toBe('zoom-out');
    expect(matchShortcut(key({ key: '0', metaKey: true }))).toBe('zoom-reset');
  });

  it('matches Shift+1/Shift+2 for zoom to fit/selection by code, and by the shifted "!"/"@" characters', () => {
    expect(matchShortcut(key({ code: 'Digit1', shiftKey: true }))).toBe('zoom-to-fit');
    expect(matchShortcut(key({ key: '!', shiftKey: true }))).toBe('zoom-to-fit');
    expect(matchShortcut(key({ code: 'Digit2', shiftKey: true }))).toBe('zoom-to-selection');
    expect(matchShortcut(key({ key: '@', shiftKey: true }))).toBe('zoom-to-selection');
  });

  it('matches Cmd+Z for undo and Shift+Cmd+Z for redo', () => {
    expect(matchShortcut(key({ key: 'z', metaKey: true }))).toBe('undo');
    expect(matchShortcut(key({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(matchShortcut(key({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('matches Delete and Backspace to the same id', () => {
    expect(matchShortcut(key({ key: 'Delete' }))).toBe('delete-layer');
    expect(matchShortcut(key({ key: 'Backspace' }))).toBe('delete-layer');
  });

  it('matches Escape', () => {
    expect(matchShortcut(key({ key: 'Escape' }))).toBe('escape');
  });

  it('matches a bare "?" for the shortcuts dialog', () => {
    expect(matchShortcut(key({ key: '?', shiftKey: true }))).toBe('shortcuts-help');
  });

  it('returns null for an unrelated key', () => {
    expect(matchShortcut(key({ key: 'a', metaKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: 'k' }))).toBeNull();
  });
});

describe('detectPlatform', () => {
  afterEach(() => {
    // withNavigatorProperty restores its own property; nothing to do here,
    // this afterEach only documents that each test below is self-contained.
  });

  it('reads "Mac" out of navigator.userAgentData.platform first', () => {
    withNavigatorProperty('userAgentData', { platform: 'macOS' }, () => {
      withNavigatorProperty('platform', 'Win32', () => {
        expect(detectPlatform()).toBe('mac');
      });
    });
  });

  it('falls back to navigator.platform when userAgentData is absent', () => {
    withNavigatorProperty('userAgentData', undefined, () => {
      withNavigatorProperty('platform', 'MacIntel', () => {
        expect(detectPlatform()).toBe('mac');
      });
    });
  });

  it('is "other" for a non-Mac platform', () => {
    withNavigatorProperty('userAgentData', undefined, () => {
      withNavigatorProperty('platform', 'Win32', () => {
        expect(detectPlatform()).toBe('other');
      });
    });
  });
});
