// The single source of truth for every keyboard shortcut the editor handles
// (spec docs/superpowers/specs/2026-09-13-shortcuts-and-elements-design.md
// section 2 and docs/superpowers/specs/2026-09-12-shortcuts-overlay-design.md
// section 3): components/workbench/keyboard.tsx dispatches by `id` from
// `matchShortcut`, the shortcuts overlay and dialog list `SHORTCUTS` grouped
// by area, the top bar's zoom menu labels itself with `formatKeys`, and the
// README's shortcut table is checked against this file in shortcuts.test.ts
// - so the four can never quietly drift apart from one another.

export type Platform = 'mac' | 'other';

export type ShortcutArea = 'Panels' | 'Present' | 'Tools' | 'Canvas' | 'Screens' | 'Edit' | 'Help';

export interface Shortcut {
  id: string;
  area: ShortcutArea;
  // Platform-neutral tokens in display order: 'Mod' (Cmd/Ctrl), 'Shift',
  // 'Alt', a literal 'Hold' prefix for the hold-gesture row, or the key
  // itself already in its displayed form ('D', '=', '\\', 'Delete', '?', ...).
  keys: string[];
  label: string;
  // True for a modifier chord that must keep working while a text field,
  // select or dialog owns the interaction (it either doubles as a browser
  // shortcut that must never reach the browser instead, or is how the user
  // gets back out of whatever currently has focus). Every other shortcut -
  // every bare single key, and Shift+key with no other modifier - is ignored
  // while typing and while a menu or dialog is open (the existing
  // `isEditableTarget` and popup guards in keyboard.tsx).
  always?: boolean;
}

export const SHORTCUTS: Shortcut[] = [
  { id: 'panel-design', area: 'Panels', keys: ['D'], label: 'Design tab' },
  { id: 'panel-prototype', area: 'Panels', keys: ['P'], label: 'Prototype tab' },
  { id: 'panel-elements', area: 'Panels', keys: ['E'], label: 'Elements tab' },
  { id: 'chat-toggle', area: 'Panels', keys: ['C'], label: 'Open or close the chat panel' },
  {
    id: 'chat-toggle-mod',
    area: 'Panels',
    keys: ['Mod', 'J'],
    label: 'Open or close the chat panel',
    always: true,
  },
  {
    id: 'panel-collapse',
    area: 'Panels',
    keys: ['Mod', '.'],
    label: 'Minimize or expand the right panel',
    always: true,
  },
  { id: 'toggle-ui', area: 'Panels', keys: ['Mod', '\\'], label: 'Show or hide all panels', always: true },
  { id: 'present', area: 'Present', keys: ['Mod', 'R'], label: 'Present the focused screen', always: true },
  { id: 'tool-pointer', area: 'Tools', keys: ['V'], label: 'Pointer' },
  { id: 'tool-comment', area: 'Tools', keys: ['Shift', 'C'], label: 'Comment tool' },
  // Registered for the overlay/README only - no handler yet (spec: "when
  // diagrams land").
  { id: 'tool-diagram', area: 'Tools', keys: ['Shift', 'D'], label: 'Diagram palette' },
  // Space+drag and middle-mouse-drag both pan the canvas (canvas.tsx's
  // shouldStartPan/panRef, gated on the Space key or the middle mouse
  // button) - a held pointer gesture, not a keydown chord, so
  // matchShortcut never returns either id (see the GESTURE_IDS exclusion
  // in shortcuts.test.ts's "never drift apart" describe block; canvas.tsx
  // owns the actual gesture, not keyboard.tsx). Registered here only so
  // the hold-Cmd overlay, the "?" dialog and the README list them
  // alongside every other Canvas shortcut. The single-token 'keys' entries
  // below (rather than separate modifier/key tokens) are gesture
  // descriptions, not chords - formatKeys renders a lone token unchanged
  // on both platforms, which is exactly the platform-neutral text wanted
  // here.
  { id: 'pan-space', area: 'Canvas', keys: ['Hold', 'Space + drag'], label: 'Pan the canvas' },
  { id: 'pan-middle-mouse', area: 'Canvas', keys: ['Middle mouse drag'], label: 'Pan the canvas' },
  { id: 'zoom-in', area: 'Canvas', keys: ['Mod', '='], label: 'Zoom in', always: true },
  { id: 'zoom-out', area: 'Canvas', keys: ['Mod', '-'], label: 'Zoom out', always: true },
  { id: 'zoom-reset', area: 'Canvas', keys: ['Mod', '0'], label: 'Zoom to 100%', always: true },
  { id: 'zoom-to-fit', area: 'Canvas', keys: ['Shift', '1'], label: 'Zoom to fit' },
  { id: 'zoom-to-selection', area: 'Canvas', keys: ['Shift', '2'], label: 'Zoom to selection' },
  { id: 'screen-new', area: 'Screens', keys: ['Shift', 'N'], label: 'New screen' },
  { id: 'page-next', area: 'Screens', keys: ['Mod', 'Shift', ']'], label: 'Next page' },
  { id: 'page-prev', area: 'Screens', keys: ['Mod', 'Shift', '['], label: 'Previous page' },
  { id: 'undo', area: 'Edit', keys: ['Mod', 'Z'], label: 'Undo' },
  { id: 'redo', area: 'Edit', keys: ['Shift', 'Mod', 'Z'], label: 'Redo' },
  { id: 'delete-layer', area: 'Edit', keys: ['Delete'], label: 'Delete the selected layer' },
  // Diagram-selection-only (spec docs/superpowers/specs/2026-09-13-diagrams-
  // design.md section 3): keyboard.tsx only acts on these when a diagram
  // element is selected, but they are registered unconditionally like every
  // other shortcut so the overlay/dialog/README always list them.
  { id: 'diagram-duplicate', area: 'Edit', keys: ['Mod', 'D'], label: 'Duplicate the diagram selection' },
  // Nudges whichever selection is active - a diagram element, or (spec
  // docs/superpowers/specs/2026-09-13-grid-snapping-alignment-design.md
  // section 4) one or more selected frames when no diagram element is
  // selected; keyboard.tsx's own dispatch decides which (diagram wins when
  // both exist). 1 px plain, 8 px with Shift - the same two rows below,
  // split by modifier since they now move by different amounts.
  { id: 'diagram-nudge-up',
    area: 'Canvas',
    keys: ['↑'],
    label: 'Nudge the selection 1 px',
  },
  { id: 'diagram-nudge-down',
    area: 'Canvas',
    keys: ['↓'],
    label: 'Nudge the selection 1 px',
  },
  { id: 'diagram-nudge-left',
    area: 'Canvas',
    keys: ['←'],
    label: 'Nudge the selection 1 px',
  },
  { id: 'diagram-nudge-right',
    area: 'Canvas',
    keys: ['→'],
    label: 'Nudge the selection 1 px',
  },
  { id: 'diagram-nudge-up-shift',
    area: 'Canvas',
    keys: ['Shift', '↑'],
    label: 'Nudge the selection 8 px',
  },
  { id: 'diagram-nudge-down-shift',
    area: 'Canvas',
    keys: ['Shift', '↓'],
    label: 'Nudge the selection 8 px',
  },
  { id: 'diagram-nudge-left-shift',
    area: 'Canvas',
    keys: ['Shift', '←'],
    label: 'Nudge the selection 8 px',
  },
  { id: 'diagram-nudge-right-shift',
    area: 'Canvas',
    keys: ['Shift', '→'],
    label: 'Nudge the selection 8 px',
  },
  { id: 'escape', area: 'Edit', keys: ['Escape'], label: 'Deselect, leave a tool, close a menu' },
  // Labelled "Shortcuts dialog" rather than "Keyboard shortcuts" (the
  // dialog's own title, and the overflow menu item's own text - spec
  // section 3): a row inside that dialog reading the same words as the
  // dialog's title would be an ambiguous, confusing duplicate of it.
  { id: 'shortcuts-help', area: 'Help', keys: ['?'], label: 'Shortcuts dialog' },
];

export const SHORTCUTS_BY_ID: Record<string, Shortcut> = Object.fromEntries(
  SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]),
);

const MODIFIER_GLYPHS: Record<string, Record<Platform, string>> = {
  Mod: { mac: '⌘', other: 'Ctrl' },
  Shift: { mac: '⇧', other: 'Shift' },
  Alt: { mac: '⌥', other: 'Alt' },
};

/**
 * Renders a `Shortcut.keys` array for display: modifier tokens become their
 * platform glyph or word, everything else passes through unchanged (it is
 * already the character or name to show). Mac glyphs concatenate with no
 * separator, matching the top bar zoom menu's existing hardcoded labels
 * ("⌘=", "⇧1"); other platforms join words with "+" ("Ctrl+Z"). A leading
 * `'Hold'` token (the overlay's own "Cmd (hold)" row) renders as the word
 * "Hold" plus a space and the rest, on both platforms.
 */
export function formatKeys(keys: string[], platform: Platform): string {
  if (keys[0] === 'Hold') {
    return `Hold ${formatKeys(keys.slice(1), platform)}`;
  }
  const parts = keys.map((token) => MODIFIER_GLYPHS[token]?.[platform] ?? token);
  return platform === 'mac' ? parts.join('') : parts.join('+');
}

// navigator.userAgentData is not yet in TypeScript's lib.dom.d.ts.
interface NavigatorWithUAData extends Navigator {
  userAgentData?: { platform?: string };
}

/**
 * Mac vs. everything else, for choosing which physical modifier key the
 * shortcuts overlay watches (Meta vs. Control) and which glyphs
 * `formatKeys` renders (spec docs/superpowers/specs/2026-09-12-shortcuts-
 * overlay-design.md section 2: "navigator.platform or userAgentData.platform
 * contains 'Mac' -> Command, shown as ⌘; otherwise Control, shown as Ctrl").
 */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const nav = navigator as NavigatorWithUAData;
  const platformString = nav.userAgentData?.platform ?? nav.platform ?? '';
  // Case-insensitive: Chromium's userAgentData.platform reports "macOS"
  // (lowercase "mac"), while the older navigator.platform reports "MacIntel"
  // (uppercase "Mac") - both must resolve to 'mac'.
  return platformString.toLowerCase().includes('mac') ? 'mac' : 'other';
}

// The subset of a real KeyboardEvent matchShortcut reads - kept narrow so
// tests can pass a plain object instead of constructing a DOM KeyboardEvent,
// while a real `event: KeyboardEvent` from keyboard.tsx still satisfies it
// structurally.
export type ShortcutKeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'shiftKey'>;

// Cmd+=/Cmd+- (spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
// section 3): `event.key` alone already covers a numpad Add/Subtract press,
// but `event.code` is checked too for a keyboard/OS combination that reports
// something unexpected for `key`. `=`/`+` share one physical key on a US
// layout (Shift changes which character is produced, not which shortcut the
// user meant), same for `-`/`_`.
const ZOOM_IN_KEYS = new Set(['=', '+']);
const ZOOM_OUT_KEYS = new Set(['-', '_']);
const ZOOM_IN_CODES = new Set(['Equal', 'NumpadAdd']);
const ZOOM_OUT_CODES = new Set(['Minus', 'NumpadSubtract']);

// Cmd+Shift+]/[ (next/previous page): `event.key` already reflects the
// shifted character a real US-layout keyboard reports for Shift+]/[ ('}'/
// '{'), so both the plain and shifted character are accepted, same pattern
// as ZOOM_IN_KEYS/ZOOM_OUT_KEYS above; `code` is checked too for a
// keyboard/OS combination that reports something unexpected for `key`.
const PAGE_NEXT_KEYS = new Set([']', '}']);
const PAGE_PREV_KEYS = new Set(['[', '{']);
const PAGE_NEXT_CODE = 'BracketRight';
const PAGE_PREV_CODE = 'BracketLeft';

/**
 * Maps a raw keyboard event to the `Shortcut.id` it corresponds to, or
 * `null` for anything unhandled. Purely a key-matching function - it knows
 * nothing about editable targets, open popups, or which ids are "always" (see
 * `SHORTCUTS_BY_ID[id]?.always`), and nothing about what a match should
 * actually DO (that lives in keyboard.tsx, since a few ids - Escape, Delete,
 * Undo/Redo - need editor state, not just the event, to decide their effect).
 */
export function matchShortcut(event: ShortcutKeyEvent): string | null {
  const mod = event.metaKey || event.ctrlKey;
  const shift = event.shiftKey;
  const key = event.key.toLowerCase();

  if (mod && event.key === '\\') return 'toggle-ui';
  if (mod && key === 'j') return 'chat-toggle-mod';
  if (mod && event.key === '.') return 'panel-collapse';
  if (mod && (ZOOM_IN_KEYS.has(event.key) || ZOOM_IN_CODES.has(event.code))) return 'zoom-in';
  if (mod && (ZOOM_OUT_KEYS.has(event.key) || ZOOM_OUT_CODES.has(event.code))) return 'zoom-out';
  if (mod && event.key === '0') return 'zoom-reset';
  if (mod && !shift && key === 'r') return 'present';
  if (mod && shift && (PAGE_NEXT_KEYS.has(event.key) || event.code === PAGE_NEXT_CODE)) return 'page-next';
  if (mod && shift && (PAGE_PREV_KEYS.has(event.key) || event.code === PAGE_PREV_CODE)) return 'page-prev';
  if (mod && shift && key === 'z') return 'redo';
  if (mod && key === 'z') return 'undo';
  // Cmd+D duplicates the diagram selection (keyboard.tsx only acts on it
  // when one exists) - checked before the generic `if (mod) return null`
  // below, `!shift` so Cmd+Shift+D (unused here) does not also match it.
  if (mod && !shift && key === 'd') return 'diagram-duplicate';
  if (mod) return null;

  // Shift-only chords (checked by `code` where digits are involved, not
  // `key`, which reports "!"/"@" once Shift changes the produced character -
  // matchShortcut also accepts those characters directly so a keyboard/OS
  // combination that only reports `key` still matches).
  if (shift && (event.code === 'Digit1' || event.key === '!')) return 'zoom-to-fit';
  if (shift && (event.code === 'Digit2' || event.key === '@')) return 'zoom-to-selection';
  if (shift && key === 'n') return 'screen-new';
  if (shift && key === 'c') return 'tool-comment';
  if (shift && key === 'd') return 'tool-diagram';
  if (shift && event.key === '?') return 'shortcuts-help';
  // Arrow keys nudge the diagram selection or, when none is active, a
  // selected frame (keyboard.tsx decides which) - matched both with and
  // without Shift, as distinct ids now that they move by a different
  // amount (1 px plain, 8 px with Shift), so these four checks sit on both
  // sides of the `if (shift) return null` gate just below.
  if (shift && event.key === 'ArrowUp') return 'diagram-nudge-up-shift';
  if (shift && event.key === 'ArrowDown') return 'diagram-nudge-down-shift';
  if (shift && event.key === 'ArrowLeft') return 'diagram-nudge-left-shift';
  if (shift && event.key === 'ArrowRight') return 'diagram-nudge-right-shift';
  if (shift) return null;

  if (key === 'd') return 'panel-design';
  if (key === 'p') return 'panel-prototype';
  if (key === 'e') return 'panel-elements';
  if (key === 'c') return 'chat-toggle';
  if (key === 'v') return 'tool-pointer';
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete-layer';
  if (event.key === 'Escape') return 'escape';
  if (event.key === '?') return 'shortcuts-help';
  if (event.key === 'ArrowUp') return 'diagram-nudge-up';
  if (event.key === 'ArrowDown') return 'diagram-nudge-down';
  if (event.key === 'ArrowLeft') return 'diagram-nudge-left';
  if (event.key === 'ArrowRight') return 'diagram-nudge-right';

  return null;
}

/** One row per area and label: entries that share a label (the chat panel's
 * C and Cmd+J, the two pan gestures, the four nudge arrows) show as a single
 * row with every key chip, in registry order. Used by the shortcuts sheet,
 * the dialog and the README table so all three stay identical. */
export type ShortcutRow = { area: ShortcutArea; label: string; keys: string[][]; ids: string[] };

export function displayRows(): ShortcutRow[] {
  const rows: ShortcutRow[] = [];
  for (const shortcut of SHORTCUTS) {
    const existing = rows.find((row) => row.area === shortcut.area && row.label === shortcut.label);
    if (existing) {
      existing.keys.push(shortcut.keys);
      existing.ids.push(shortcut.id);
    } else {
      rows.push({ area: shortcut.area, label: shortcut.label, keys: [shortcut.keys], ids: [shortcut.id] });
    }
  }
  return rows;
}

/** The README table cell for a row: every key combination, mac formatted,
 * joined with " or ". */
export function readmeKeysCell(row: ShortcutRow): string {
  return row.keys.map((keys) => formatKeys(keys, 'mac')).join(' or ');
}
