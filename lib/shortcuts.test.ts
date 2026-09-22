import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SHORTCUTS, SHORTCUTS_BY_ID, detectPlatform, formatKeys, matchShortcut, type ShortcutKeyEvent, displayRows, readmeKeysCell } from './shortcuts';

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
    const guardedIds = ['panel-design', 'panel-prototype', 'panel-elements', 'diagram-tab', 'chat-toggle', 'tool-pointer', 'tool-comment', 'screen-new'];
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

describe('matchShortcut and SHORTCUTS never drift apart', () => {
  // The registry's own `keys` tokens, turned back into the event
  // matchShortcut expects - the reverse of formatKeys. Modifier tokens set
  // their flag; the one remaining token (every entry has exactly one) is
  // the key itself - except a Shift+digit combo, which a real keyboard
  // reports as `code: 'DigitN'` with `key` already shifted to "!"/"@"/...,
  // never as `key: '1'`; matchShortcut matches on `code` for exactly that
  // reason (see its own comment), so this builds the same shape a real
  // browser would rather than a `key` no browser could ever actually send.
  // The diagram nudge rows display an arrow glyph (matching formatKeys'
  // pass-through of any token it does not recognize as a modifier), but a
  // real KeyboardEvent never reports that glyph as `key` - it reports
  // "ArrowUp" etc. Same idea as the shifted-digit handling just below for
  // "!"/"@": the display token and the real event value can differ, so this
  // helper maps the ones that do.
  const ARROW_KEY_BY_GLYPH: Record<string, string> = {
    '↑': 'ArrowUp',
    '↓': 'ArrowDown',
    '←': 'ArrowLeft',
    '→': 'ArrowRight',
  };

  function eventFromKeys(keys: string[]): ShortcutKeyEvent {
    let eventKey = '';
    let metaKey = false;
    let shiftKey = false;
    let altKey = false;
    for (const token of keys) {
      if (token === 'Mod') metaKey = true;
      else if (token === 'Shift') shiftKey = true;
      else if (token === 'Alt') altKey = true;
      else eventKey = ARROW_KEY_BY_GLYPH[token] ?? token;
    }
    const code = shiftKey && /^\d$/.test(eventKey) ? `Digit${eventKey}` : '';
    return key({ key: eventKey, metaKey, shiftKey, altKey, code });
  }

  // Gestures, not keydown chords: each has its own listener elsewhere
  // (shortcuts-overlay.tsx's hold detection for the Cmd-hold row,
  // canvas.tsx's shouldStartPan/panRef for the two pan rows) and
  // matchShortcut never returns any of these ids.
  // diagram-context-menu is a window listener owned by the diagram layer (it opens a Radix menu for the
  // selection), so matchShortcut never returns it either.
  const GESTURE_IDS = new Set(['pan-space', 'pan-middle-mouse', 'diagram-context-menu', 'zoom-region']);

  it('resolves every matchable registry entry back to its own id from its own keys', () => {
    for (const shortcut of SHORTCUTS) {
      if (GESTURE_IDS.has(shortcut.id)) continue;
      const event = eventFromKeys(shortcut.keys);
      expect(matchShortcut(event), `matchShortcut(${shortcut.keys.join('+')}) should resolve to "${shortcut.id}"`).toBe(
        shortcut.id,
      );
    }
  });
});

describe('matchShortcut', () => {
  it('matches the bare panel-tab letters, and ignores them with shift held', () => {
    expect(matchShortcut(key({ key: 'd' }))).toBe('panel-design');
    expect(matchShortcut(key({ key: 'D' }))).toBe('panel-design');
    expect(matchShortcut(key({ key: 'p' }))).toBe('panel-prototype');
    expect(matchShortcut(key({ key: 'e' }))).toBe('panel-elements');
    expect(matchShortcut(key({ key: 'g' }))).toBe('diagram-tab');
    expect(matchShortcut(key({ key: 'G' }))).toBe('diagram-tab');
    expect(matchShortcut(key({ key: 'p', shiftKey: true }))).toBeNull();
  });

  it('matches Cmd+D for the diagram duplicate, distinct from the bare "d" panel-tab shortcut', () => {
    expect(matchShortcut(key({ key: 'd', metaKey: true }))).toBe('diagram-duplicate');
    expect(matchShortcut(key({ key: 'd', ctrlKey: true }))).toBe('diagram-duplicate');
    expect(matchShortcut(key({ key: 'd', metaKey: true, shiftKey: true }))).toBeNull();
  });

  it('matches Cmd+G for group and Cmd+Shift+G for ungroup, distinct from bare Shift+G (layout grid) and bare G (Diagrams tab)', () => {
    expect(matchShortcut(key({ key: 'g', metaKey: true }))).toBe('diagram-group');
    expect(matchShortcut(key({ key: 'g', ctrlKey: true }))).toBe('diagram-group');
    expect(matchShortcut(key({ key: 'g', metaKey: true, shiftKey: true }))).toBe('diagram-ungroup');
    expect(matchShortcut(key({ key: 'g', ctrlKey: true, shiftKey: true }))).toBe('diagram-ungroup');
    expect(matchShortcut(key({ key: 'g', shiftKey: true }))).toBe('layout-grid-toggle');
    expect(matchShortcut(key({ key: 'g' }))).toBe('diagram-tab');
  });

  it('matches the four arrow keys for the nudge, as distinct ids with and without Shift', () => {
    expect(matchShortcut(key({ key: 'ArrowUp' }))).toBe('diagram-nudge-up');
    expect(matchShortcut(key({ key: 'ArrowDown' }))).toBe('diagram-nudge-down');
    expect(matchShortcut(key({ key: 'ArrowLeft' }))).toBe('diagram-nudge-left');
    expect(matchShortcut(key({ key: 'ArrowRight' }))).toBe('diagram-nudge-right');
    expect(matchShortcut(key({ key: 'ArrowUp', shiftKey: true }))).toBe('diagram-nudge-up-shift');
    expect(matchShortcut(key({ key: 'ArrowDown', shiftKey: true }))).toBe('diagram-nudge-down-shift');
    expect(matchShortcut(key({ key: 'ArrowLeft', shiftKey: true }))).toBe('diagram-nudge-left-shift');
    expect(matchShortcut(key({ key: 'ArrowRight', shiftKey: true }))).toBe('diagram-nudge-right-shift');
    expect(matchShortcut(key({ key: 'ArrowUp', metaKey: true }))).toBeNull();
  });

  it('matches bare C for the chat toggle, and Shift+C for the comment tool', () => {
    expect(matchShortcut(key({ key: 'c' }))).toBe('chat-toggle');
    expect(matchShortcut(key({ key: 'C' }))).toBe('chat-toggle');
    expect(matchShortcut(key({ key: 'c', shiftKey: true }))).toBe('tool-comment');
    expect(matchShortcut(key({ key: 'C', shiftKey: true }))).toBe('tool-comment');
    expect(matchShortcut(key({ key: 'c', metaKey: true }))).toBe('copy-elements');
    expect(matchShortcut(key({ key: 'c', ctrlKey: true }))).toBe('copy-elements');
  });

  it('matches Shift+D for the diagram palette, distinct from bare D', () => {
    expect(matchShortcut(key({ key: 'd', shiftKey: true }))).toBe('tool-diagram');
  });

  it('matches bare V for the pointer tool', () => {
    expect(matchShortcut(key({ key: 'v' }))).toBe('tool-pointer');
    expect(matchShortcut(key({ key: 'v', metaKey: true }))).toBe('paste-elements');
  });

  it('matches bare T for the diagram text tool', () => {
    expect(matchShortcut(key({ key: 't' }))).toBe('diagram-text-tool');
    expect(matchShortcut(key({ key: 'T' }))).toBe('diagram-text-tool');
    expect(matchShortcut(key({ key: 't', metaKey: true }))).toBeNull();
    expect(matchShortcut(key({ key: 't', shiftKey: true }))).toBe('tool-table');
  });

  it('matches Shift+N for a new screen', () => {
    expect(matchShortcut(key({ key: 'n', shiftKey: true }))).toBe('screen-new');
    expect(matchShortcut(key({ key: 'n' }))).toBeNull();
  });

  it('matches Shift+G for the layout grid toggle, distinct from bare G (the Diagrams tab)', () => {
    expect(matchShortcut(key({ key: 'g', shiftKey: true }))).toBe('layout-grid-toggle');
    expect(matchShortcut(key({ key: 'g' }))).toBe('diagram-tab');
  });

  it('matches Cmd+\' and Ctrl+\' for the pixel grid toggle', () => {
    expect(matchShortcut(key({ key: "'", metaKey: true }))).toBe('pixel-grid-toggle');
    expect(matchShortcut(key({ key: "'", ctrlKey: true }))).toBe('pixel-grid-toggle');
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
    expect(matchShortcut(key({ key: 'q', metaKey: true }))).toBeNull();
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

describe('README shortcut table', () => {
  // Read fresh inside the test (not hoisted to module scope) so a failure
  // here is always about today's README.md, never a stale value cached
  // from a previous test file in the same run. process.cwd() is the
  // project root under `vitest run` (same assumption db/client.ts and
  // scripts/seed.ts already make).
  function readme(): string {
    return readFileSync(join(process.cwd(), 'README.md'), 'utf8');
  }

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // A plain `toContain(label)` / `toContain(keys)` pair (this test's
  // previous version) passes as long as those two strings appear ANYWHERE
  // in the file, independently of each other - rebinding, say, the Design
  // tab from D to F would still find a stray "F" somewhere else in the
  // README (Files, Folder, ...) and never notice the table row itself still
  // said D. A single-letter key is the worst case: it is such a common
  // substring that the old assertion carried almost no signal. Requiring
  // the mac-formatted keys cell (optionally followed by a "(... elsewhere)"
  // note, same as the zoom/undo/redo rows) immediately followed by the
  // label's own cell ties both to one specific `| ... | ... |` row, so a
  // row that quietly fell out of sync with the registry actually fails
  // this.
  it('lists every merged registry row as one table row: the keys cell (all combinations joined with " or ") followed by the label cell', () => {
    const text = readme();
    for (const row of displayRows()) {
      const keysCell = readmeKeysCell(row);
      const rowPattern = new RegExp(`\\|\\s*${escapeRegExp(keysCell)}\\s*\\|\\s*${escapeRegExp(row.label)}\\s*\\|`);
      expect(
        rowPattern.test(text),
        `README has no table row matching "| ${keysCell} | ${row.label} |" for "${row.ids.join(', ')}"`,
      ).toBe(true);
    }
  });

  it('merges entries that share a label into one row with every key combination', () => {
    const chat = displayRows().find((row) => row.label === 'Open or close the chat panel');
    expect(chat?.keys).toHaveLength(2);
    const nudge = displayRows().find((row) => row.ids.includes('diagram-nudge-up'));
    expect(nudge?.keys.map((keys) => keys.join(' '))).toEqual(['↑', '↓', '←', '→']);
    const nudgeShift = displayRows().find((row) => row.label === 'Nudge the selection 8 px');
    expect(nudgeShift?.keys.map((keys) => keys.join(' '))).toEqual(['Shift ↑', 'Shift ↓', 'Shift ←', 'Shift →']);
  });
});
