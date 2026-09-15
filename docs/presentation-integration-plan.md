# Presentation integration plan

Dreamscape remains the source application. Its editor, component library, Craft
renderer, Play interactions, file persistence, and comment UI stay authoritative.
The integration adds a focused presentation experience around those existing
systems. The separate Tone application remains a reference and is not merged into
Dreamscape.

## Four parts

### Part 1 — reliable Present handoff

Present must finish pending autosave work and receive a successful response before
opening Play. Both the top-bar action and the keyboard shortcut use one entry point.
Save failures and conflicts keep the draft visible and explain why presentation
could not start. Tests cover a queued edit, an in-flight save followed by another
edit, retryable failure, conflict, double activation, and blocked new tabs.

### Part 2 — presentation shell around Player

Keep `components/play/player.tsx`, its resolver, `PlayProvider`, navigation,
dialogs, overlays, and existing Play route. Add only presentation chrome: current
screen context, exit, viewport choice, zoom, fit, reset, and a read-only boundary.
Playback state must never PATCH the file. Zoom scales the presentation; viewport
choice changes the simulated width; neither changes a saved layout.

### Part 3 — connect existing comments

Reuse `CommentLayer`, `CommentComposer`, `CommentThreadPopover`, and
`createCommentStore`. Extract the current Workbench comment controller so the editor
and Player use the same behavior. Add compatible page/screen/overlay context to new
threads, preserve legacy threads without guessing their screen, and keep pins in
the artboard's local coordinate space. A missing or moved target is shown as
unavailable rather than silently reattached.

### Part 4 — verification and backend hardening

Run the existing tests, typecheck, lint, build, and a focused browser flow. Verify
keyboard/focus behavior, narrow layouts, overlays, comments, failed saves, and
return-to-editor context. Before multi-user use, make file saves atomic against
the expected version and move comments behind authenticated, file-scoped server
storage. These are later hardening steps and are not prerequisites for the local
single-browser POC.

## First acceptance flow

Edit a component → wait for confirmed save → Present → interact with the prototype
→ add a comment → return to the same editor screen → reply → reopen Present.

## Ownership rules

- Dreamscape components and tokens own the visual language.
- Presentation styling is limited to the frame, controls, focus, and status states.
- Presentation never owns component data or a second persistence API.
- The current local comment store is a POC limitation, not cross-device collaboration.
- No participant, PO, research, AI, or duplicate component-library work is in this slice.
