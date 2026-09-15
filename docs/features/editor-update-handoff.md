# Editor update handoff — September 15, 2026

## Changes

- Add file-level Light/Dark appearance in File settings and root-frame overrides in the Design inspector. Apply inherited appearance to canvas frames, custom components, and prototype screens/overlays.
- Persist appearance through file APIs, saves, and duplication. Add database migration `0005_file_appearance.sql`. Local in-memory development databases apply new migrations during HMR without discarding the file data.
- Consolidate Layers and Chat into a shared floating left panel in both editors, with consistent tab placement, a Sparkles chat icon, collapse/expand controls, and a resizable width of 256–400px saved locally.
- Remove the top-bar New Frame, Chat, and overflow controls. Move keyboard shortcuts and source download into the Layers panel. Remove Chat's clear-conversation action and redundant close button.
- Add Share immediately after Present in the top bar. Add a larger sharing dialog with starting-screen selection, per-screen comment settings, prototype/per-screen approval choices, page-navigation preference, and a copyable prototype link.
- Restore Escape/close behavior for editor previews, while keeping shared-view presentation free of editor-return controls.
- Add custom-component instance sizing: Fill container, pixels, or percentage, plus optional maximum width in pixels or percentage. Preserve sizing when detaching an instance. Keep the CC preview's numeric width control separate from instance sizing rules.
- Add pixel/percentage maximum width for Cards and unit-aware spacing input support.
- Add regression coverage for appearance persistence/rendering, prototype exits/sharing, panel resizing, component sizing, and updated panel interactions.

## Integration notes

- Apply the hosted database migration before deploying these changes.
- Chat still uses the existing placeholder transport; this update does not connect an AI service.
- Share starting-screen links work. Comments, approval, and page-navigation choices are locally stored configuration UI; they are not yet connected to viewer behavior or a sharing backend.
- Shared-view mode hides editor controls; it is not an authorization/access-control boundary.
- This update does not deploy to Vercel.
