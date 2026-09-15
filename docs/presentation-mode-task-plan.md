# Presentation mode task plan

## Task 1 — Integration boundary

Status: complete.

Dreamscape's repository, Craft renderer, Player reducer, overlays, persistence,
and comments remain authoritative. The presentation layer only composes those
systems. See `presentation-integration-audit.md`.

## Task 2 — Presentation review experience

Status: in progress on `presentation-integration`.

Already connected:

- Separate Play tab and read-only boundary
- Dreamscape-rendered components and interactions
- Desktop/Mobile preview selector
- Zoom and reset controls
- Review panel with Screens, Comments, and Details tabs
- Screen navigation and comment context

Remaining polish:

- Use the full device preset lists from `lib/stage/device-presets.ts`.
- Add Fit to window and fullscreen.
- Make Review a collapsible desktop sidebar and mobile bottom sheet.
- Persist editable presentation metadata without changing component data.
- Add prototype-only sharing once access rules are defined.

## Task 3 — Existing app views

Status: adapter pending.

The inspected Dreamscape repo currently has `/f/[id]` and `/f/[id]/play` routes,
but no code-view or journey/workflow routes. We must not copy those views from
another application or build duplicate renderers here. When Matt's existing
journey and code views are exposed, add a presentation View menu that links to
them with the file, page, screen, and read-only context preserved.

Acceptance criteria:

1. Switching views never creates a second source of truth.
2. Returning to Prototype restores the previous screen and viewport.
3. Code and workflow views are read-only for presentation viewers.
4. View links are unavailable or clearly marked when the source view is not
   present in the deployed Dreamscape app.
