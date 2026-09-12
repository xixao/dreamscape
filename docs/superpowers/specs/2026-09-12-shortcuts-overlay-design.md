# Assembly Workbench: Keyboard shortcuts overlay

Date: 2026-09-12
Status: approved in conversation (Matt, 2026-09-12); scheduled after the comments placeholder

## 1. What it delivers

Hold the Command key (Control on Windows and Linux) for a moment and an overlay lists every keyboard shortcut in the editor, grouped by area. Let go and it disappears. It never gets in the way of real shortcuts: Cmd+Z, Cmd+\ and the rest work exactly as before.

## 2. Behavior

- `keydown` of Meta (Mac) or Control (others) with no other key held starts a timer (`OVERLAY_HOLD_MS = 600`). Any other `keydown` while the timer runs cancels it (so combos never show the overlay). `keyup` of the modifier cancels the timer or hides the overlay. Window `blur` hides it. The overlay is display-only: it captures no focus and no clicks (`pointer-events: none`), so nothing behind it changes.
- Platform detection: `navigator.platform` or `userAgentData.platform` contains "Mac" → Command, shown as ⌘; otherwise Control, shown as Ctrl. The labels use the platform's symbol.
- Shown in the workbench only (not on the Files page), including when the UI is hidden with Cmd+\.

## 3. Content

One registry, `lib/shortcuts.ts`, exports `SHORTCUTS: ShortcutGroup[]` where `ShortcutGroup = { area: string; items: { keys: string[]; label: string }[] }` with `keys` written platform-neutral (`['Mod', 'Z']`, `['Shift', 'Mod', 'Z']`, `['Mod', '\\']`, `['Delete']`, `['Backspace']`, `['Escape']`, `['C']`, `['ArrowLeft']`, `['Hold Mod']`). `formatKeys(keys, platform)` renders them (`Mod` → ⌘ or Ctrl, `Shift` → ⇧ on Mac, arrows → glyphs).

Groups and items:
- Canvas: Delete or Backspace, "Delete the selected layer"; Escape, "Deselect"; Press and hold on a layer, "Open the layer stack menu"; Drag a layer, "Move it to another frame or container".
- History: Mod+Z, "Undo"; Shift+Mod+Z, "Redo".
- View: Mod+\, "Show or hide the panels"; Left and Right arrows on the frame edge, "Resize the frame by 10 px, 100 px with Shift".
- Comments: C, "Comment tool"; Escape, "Leave the comment tool"; Mod+Enter, "Post a comment or reply".
- Design panel: Enter, "Apply a field"; Escape, "Revert a field".
- Files: Enter, "Save a name"; Escape, "Cancel renaming".
- Help: Hold Mod, "Show this list".

A drift-guard test asserts every key combination handled in `components/workbench/keyboard.tsx` (undo, redo, toggle UI, delete, escape, comment tool) appears in the registry, by comparing against an exported `HANDLED_SHORTCUTS` list from the keyboard module.

## 4. Look

Centered SF2 modal surface (`bg-card border border-line-strong rounded-2xl shadow-panel-lg p-6`, max width 880 px) over a light scrim (`bg-black/40`), title "Keyboard shortcuts" (`text-[17px] font-semibold`) with the mono caption "Release ⌘ to close". Groups in a responsive grid (`grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5`), each with the SF2 section title (`text-[12.5px] font-semibold`) and rows: label on the left (`text-[13px] text-t2`), keys on the right as key caps (`font-mono text-[11px] px-1.5 py-0.5 rounded-sm bg-muted border border-border shadow-[var(--bevel-hi),var(--bevel-drop)]`). No animation beyond an instant show and hide.

## 5. Tests

- `lib/shortcuts.test.ts`: the registry has every group above; `formatKeys` renders ⌘/Ctrl and ⇧ correctly per platform; the drift guard passes.
- `components/workbench/shortcuts-overlay.test.tsx`: holding Meta for 600 ms (fake timers) shows the overlay with the group titles; pressing Z during the hold prevents it; releasing Meta hides it; window blur hides it; on a non-Mac platform the caption reads "Release Ctrl to close".
- Browser: hold ⌘ in the workbench, the overlay appears; release, it goes; Cmd+Z still undoes without showing it.
