# Editor polish handoff — September 15, 2026

This update follows commit 6280058.

## Changes

- File and root-frame theme menus now offer External - Light, External - Dark, Internal - Light, and Internal - Dark. Frames retain File default inheritance. Existing light/dark values remain compatible; internal variants persist separately across saves and duplication.
- Fill color now opens the shared theme-variable picker, including Transparent, instead of a plain text input.
- Image elements display actual uploaded images or image URLs. Added choose/replace/remove controls and alt text. Local files are embedded as data URLs, with a 5 MB per-image limit and PNG/JPEG/WebP/GIF/SVG support.
- Added image width/height controls, aspect-ratio locking, and right/bottom/corner resize handles that account for canvas zoom. Image dimensions stay independent of wider sibling text unless Fill container is enabled. Removed an image alignment override that prevented parent centering.
- New elements resolve through the mounted Craft editor's resolver at insertion time, avoiding stale component identity errors after hot updates. Main-editor Layers now accepts element drops from the Elements tray; CC insertion uses the same resolver helper.
- Main-editor frame resizing and device presets now participate in Craft undo history. Inspector changes to frame appearance, layout grids, overlay presentation, and multi-frame alignment also participate. Image aspect presets and their resulting dimensions are one undoable edit.
- Explicitly selected root frames now receive selection outlines. Outline bounds refresh when inspector edits change layout, and labels honor renamed layers.
- Shift+Up/Down adjusts numeric controls by 10, respecting bounds and image aspect locking. Applied to spacing, sizing, component limits, and border opacity. Unmodified arrows retain existing behavior (preset navigation in spacing fields).

## Implementation and integration notes

- Internal and External themes currently share their corresponding light/dark palettes. Separate branding/token sets are not yet implemented. The previously introduced appearance database column requires no additional migration for these values.
- Uploaded images live inside saved layout JSON, not a media-storage service. Plan asset storage and file-size policies before scaling this approach. URL images depend on the supplied host.
- Undo uses root custom metadata (`frameSize` and `inspectorScreens`) to restore screen properties alongside Craft node edits. Preserve these fields when serializing layouts. History remains screen-scoped and is not persisted across page reloads.
- The CC preview viewport dimensions are still separate from component-content history; this update's inspector history coverage does not change that preview behavior.
- Visually verified the logo's fixed size and centering with wider text in Untitled — recovered, and a nested frame highlight selected through Layers.
- Shared review settings and the chat backend remain at the UI-scaffolding stage described in the previous handoff.
