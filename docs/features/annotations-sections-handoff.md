# Editor update: annotations, sections, and canvas tools

## Included changes

- Added distinct comments, designer annotations, and accessibility notes, with the Notes panel, type/status filters, editing, replies, and applicable resolve/reopen actions.
- Added native accessibility and GitHub-inspired Designer annotation libraries in the right Components panel. Editable stamps, cards, lassos, brackets, and Post-it variants reuse canvas placement, sizing, duplication, persistence, and undo.
- Added Show/Hide all comments and annotations in the top-nav note menu. Comment pins can be dragged to new positions; Escape cancels, clicks still open threads, and positions persist locally.
- Added named, colored canvas sections. Dragging moves contained frames, diagrams, annotations, and nested sections. All four edges and corners resize independently of contents.
- Section menus now use Rename, Resize to Fit, Remove Section (keep objects), and Delete. Fit considers all contained object types. Removed section-name icons and frame counts.
- Fixed accidental whole-frame selection when a marquee only brushes an edge, and suppressed browser text/image selection during marquee dragging.
- Fixed diagram click/drag insertion and centered click placement in available viewport space. Added editable diagram tables.
- Expanded selection shortcuts and context actions: wrap in horizontal/vertical frame, component clipboard, duplication, layer navigation, PNG copy, custom-component creation/detachment, alignment, code preview, and Dream Docs preview.
- Cleaned up the shortcuts dialog, context menus, and layer controls; renamed the user-facing Elements panel to Components.
- Added inspector section configuration and reorganized Button properties, with conditional fields and collapsed advanced settings.
- Included page-switch/editor fixes and chat prompt-history navigation.

## Developer notes and limits

- See `docs/annotation-libraries.md` for source kits, catalog scope, persistence, and implementation files. These are native adaptations, not exhaustive pixel-identical Figma imports; experimental Primer presets are excluded.
- Annotation-library objects persist in page diagram data. Text comments/notes and pin positions remain browser-local; shared-user persistence, permissions, and collaboration still need backend integration.
- Sections remain design-canvas organization, excluded from prototypes and generated product UI. A file must retain one root frame: deleting all contained frames creates a new empty frame.
- Removing a section keeps its objects. The explicit Delete menu action removes contents. Keyboard Delete/Backspace on a section retains the earlier region-only behavior.
- View Code and Dream Docs remain preview/handoff surfaces; they do not imply production Dream component integration or a live documentation backend.
- Added `html-to-image` for copying selections as PNG.
- No deployment is part of this update.

## Validation

- Full test run: 2,449 passed, with one stale layer-toolbar test failing. Updated that test for double-click rename and drag reordering; all three layer tests pass on rerun (2,450 tests covered overall).
- TypeScript and whitespace checks pass.
- Browser checks verified annotation-library hide/show, section grouped dragging and persistence, section undo/redo, menu labels, and comment pin dragging and persistence.
- Existing lint findings remain in the comments hooks around synchronous state updates in effects; a clean project-wide lint run is not claimed.
