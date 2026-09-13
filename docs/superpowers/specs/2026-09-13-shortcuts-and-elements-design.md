# Dreamscape: Keyboard shortcuts for every area, and "Elements"

Date: 2026-09-13
Status: requested by Matt ("i also want keyboard shortcuts for every major area of the editor. for example: Design (D) / (P) Prototype / (E) -- change Components to Elements, (C) for Chat panel, command+R to Present"). Folds in the queued hold-Cmd shortcuts overlay (`2026-09-12-shortcuts-overlay-design.md`). Runs right after the infinite canvas merges, before Pages.

## 1. Rename: Components becomes Elements

Everywhere the UI says Components it now says Elements: the right panel tab, the panel's accessible name, the search field ("Search elements"), the rail icon tooltip, the empty-state copy, the README. Code identifiers can keep `components`/`tray` names; only user-facing text and accessible names change. Tests updated to the new names.

## 2. The shortcut map

Single keys are ignored while typing in a text field, textarea, select or contenteditable, and while a dialog or menu owns the interaction (the existing `isEditableTarget` and popup guards); modifier shortcuts marked "always" work everywhere.

| Area | Shortcut | Action |
| --- | --- | --- |
| Panels | D | Design tab (expands the panel if minimized) |
| Panels | P | Prototype tab |
| Panels | E | Elements tab |
| Panels | C | Open or close the chat panel |
| Panels | Cmd+. | Minimize or expand the right panel |
| Panels | Cmd+\ (always) | Show or hide all panels |
| Present | Cmd+R (always, `preventDefault`) | Present the focused screen (same as the Present button) |
| Tools | V | Pointer (leaves the comment or diagram tool) |
| Tools | Shift+C | Comment tool (was C; C now opens the chat) |
| Tools | Shift+D | Diagram palette (when diagrams land) |
| Canvas | Space (hold) + drag | Pan |
| Canvas | Cmd+= / Cmd+- (always) | Zoom in / out |
| Canvas | Cmd+0 (always) | Zoom to 100 % |
| Canvas | Shift+1 / Shift+2 | Zoom to fit / to selection |
| Screens | Shift+N | New screen |
| Screens | Cmd+Shift+] / Cmd+Shift+[ | Next / previous page (when Pages land) |
| Edit | Cmd+Z / Shift+Cmd+Z (always) | Undo / redo |
| Edit | Delete or Backspace | Delete the selected layer |
| Edit | Escape | Deselect, leave a tool, close a menu |
| Help | Cmd (hold) | Shortcuts overlay |

Cmd+R takes the browser's reload shortcut inside the editor on purpose (Cmd+Shift+R still hard-reloads); the Files page and Play keep the browser default.

## 3. Shortcuts overlay (from the 12b spec)

Holding Cmd for 600 ms opens a centred SF2 sheet listing the map above grouped by area, with the keys as mono chips (`⌘` `⇧` glyphs on macOS, `Ctrl` `Shift` elsewhere); releasing Cmd closes it; it never opens while a text field has focus or a menu or dialog is open, and any Cmd shortcut fired during the hold still runs. A "Keyboard shortcuts" item in the top bar's overflow (and `?` as a shortcut) opens the same sheet as a dialog that stays until Escape.

## 4. Code

- `lib/shortcuts.ts` (+ tests): the single registry `SHORTCUTS: { id, area, keys, label, always? }[]`, `formatKeys(platform)`, and `matchShortcut(event)` returning the id (handles `=`, `+`, `-`, `_`, numpad, Shift-modified digits, and layout differences for `.`). `keyboard.tsx` dispatches by id instead of ad hoc key checks; every existing shortcut moves into the registry so the overlay and the handler can never drift.
- `components/workbench/shortcuts-overlay.tsx` (+ tests): the hold detection (keydown Meta, timer, keyup or blur cancels) and the sheet.
- The Elements rename across `components/workbench/*` user-facing strings and tests; `README.md` shortcut table regenerated from the registry (a test asserts the README lists every registry entry).

## 5. Tests

Registry completeness (every handled id has a label and area; no duplicate keys within the same guard class); each new single key switches the right tab or toggles the chat and is ignored while typing; Cmd+R calls the Present navigation and prevents default; Shift+C toggles the comment tool and C no longer does; the overlay opens after the hold and closes on keyup, never over a text field; the README table matches the registry; the Elements rename in the inspector, rail tooltip and search field.

## 6. Browser check

Production: press D, P, E to switch tabs; C to open the chat and C again to close; Cmd+R opens Present in the same tab; hold Cmd to see the sheet; type in the chat composer and confirm single keys do not fire; Shift+C enters comment mode.
