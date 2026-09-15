# Implementation plan and decisions

Status: proposed implementation, grounded in source inspection. Nothing below
is claimed to exist or pass tests unless identified as existing behavior.

## 1. Reliable entry into presentation

Observed: Present opens a new tab immediately. Autosave has an 800 ms debounce.
The Player route reads the server file, so an immediate Present can show stale data.
Current flush() can return the in-flight request before a queued follow-up finishes;
it resolves on some failure paths. Awaiting flush() alone is not a success barrier.

Extend the existing saver with an operation that drains all changes queued through
the presentation request, waits for server acknowledgement, and reports explicit
success, conflict or failure. Prevent editing during the short transition or define
a generation boundary and ensure later edits are not represented as presented.
Handle the editor's queued layout microtask before establishing that boundary.
Bound waiting; an automatic retry loop must not leave Present waiting indefinitely.

Both the topbar action and keyboard action use this operation and presentHrefFor.
Keep the existing new-tab experience. An asynchronous window.open may be blocked:
reserve a loading tab during the user gesture, then navigate it on confirmed save;
on failure show a recoverable explanation and clean up the reserved tab. If the
browser blocks it, expose an explicit open action after saving. Do not silently
change the user's open-tab behavior or enable arbitrary window.opener access.

Success means all relevant local writes were acknowledged. It does not guarantee
another person cannot update the file between saving and Player's GET. For the POC,
describe presentation as the loaded saved design. Immutable historical presentation
requires snapshots and is deferred.

Checks: debounce pending, already in flight plus a second patch, save conflict,
network failure, double click, keyboard parity and popup-blocked recovery.

## 2. Reuse the renderer and add presentation controls

Extend Player with a presentation shell and a small internal controller for current
screen, display settings, reset and comments. Reuse existing reducer and context;
do not create a parallel navigation stack or a new renderer.

Keep StageProvider, component resolver, Frame normalization and OverlayHost behavior.
Define reset as resetting transient playback (screen/history/dialogs/overlays and
component-local form state) to the launch context; it does not reset saved designs
or delete comments. Remounting a playback subtree may be required for local state.

Fit/zoom changes scale. A viewport choice changes responsive preview width. They
are distinct actions. Use Matt's device presets and verify the preview-only width
does not enter his source-saving path. Mobile preview is not proof of device QA.

Avoid blindly applying a CSS transform to all of Player: portalled Radix dialogs,
sheets, toasts and comments may live outside that transform. Measure each rendered
surface; ensure the prototype and its overlays remain aligned with the controls.

Checks: screen navigation, back, dialogs, overlay stacks, non-dismissible overlays,
responsive width, fit/zoom, reset, form inputs, source file unchanged after playback.

## 3. Extract and connect existing comments

Move current WorkbenchShell comment state and callbacks into a reusable controller.
Keep CommentLayer, CommentComposer, CommentThreadPopover, createCommentStore and
author-name storage. No Tone comment API, reactions or assignment model is imported.

Extend threads compatibly with target screen context; page ID can be retained as
creation context, but screen ID must remain authoritative when a screen moves pages.
Use file + screen + optional Craft node ID for target identity. For overlay frames,
record the overlay's screen ID. Inline dialogs additionally need their owning node
context if distinguishing open/closed dialog placement is required.

Coordinates remain unscaled artboard-local values. A node-relative anchor needs
measured node geometry and a local offset; an optional node ID alone does not make
an existing x/y pin follow reflow. Start with fixed-frame placement and explicitly
handle alternate viewport sizes; hide/label unsupported placement instead of
displaying a confident but incorrect pin. Do not infer identity from data-block,
which names a component type rather than a unique instance.

Legacy threads lack screen context. Preserve their IDs, text and replies. Keep them
available as unassigned/file-level comments or offer explicit attachment; do not
guess their screen or bulk rewrite them when opening presentation.

Comment mode intercepts placement clicks; playback mode preserves prototype events.
Reuse Craft node-to-DOM mapping without enabling editing. Register comment surfaces
inside each relevant Craft context, including overlays. Establish focus and stacking
behavior for portalled comments; Escape dismisses the active comment before an
underlying overlay or presentation. Hidden/deleted targets retain a reachable thread.

Preserve existing Resolve semantics for the first connection: the current store
removes a resolved thread. A retained resolved-history feature needs a deliberate
schema/behavior change; never claim that history already exists.

## 4. Same-browser comment synchronization

Observed: each store loads a private array, broadcasts only to its own listeners,
and writes the whole array. Two tabs can overwrite comments or miss updates.

Add local same-document notification and storage-event handling for other tabs.
Parse and validate records on load and external updates. Subscribe/unsubscribe
cleanly. Storage events do not fire in their originating document.

Reading before writing plus listening to storage events is NOT atomic. For supported
browsers, serialize read/modify/write operations under a same-origin, per-file Web
Lock; reread inside the lock and publish only after a successful write. This makes
mutations asynchronous: update controller/UI to expose pending and error states,
retain failed drafts and avoid double submission. Merely changing the store while
leaving the composer synchronous would falsely report success.

Feature-detect locks. If unavailable, label/limit the POC to a single comment writer
or choose a transactional storage strategy before promising concurrent edits. Do
not silently fall back to unsafe concurrent whole-array writes. Older open tabs
running the old writer can still race; require reload when rolling out the change.

Same-origin local storage is shared only within a browser profile. Localhost,
different Vercel URLs, private windows and different devices are separate contexts.
Do not promise that a presentation link carries comments to Matt's browser.

Checks: simultaneous additions, simultaneous replies, resolution versus stale writer,
same-document stores, reload, malformed data, denied storage/quota failure and cleanup.

## 5. Backend boundary and later work

Initial integration uses existing GET/PATCH files endpoints and browser comments.
No new service or DB schema is required. Presentation does not write design data.

Before adding multi-person file editing guarantees, fix the existing optimistic-save
race: repository.save reads updatedAt and later updates by file ID alone. Two writers
can both pass the comparison. Use a database-atomic conditional update or transaction
with locking, return a conflict when the expected version no longer matches, and
validate compound file mutations against that same version. All competing writers
must participate. This is a separate backend hardening change, not evidence that a
client-side save barrier solves concurrent editing.

Cross-person comments would replace the storage implementation behind the same UI
with server-backed records and file-scoped access checks. The inspected file routes
do not authenticate an actor; author display names are not permissions. Establish
deployment access and app authorization before broadening that scope. Do not port
Tone's unrelated authentication as an accidental side effect of this integration.

Live changes during presentation: default to the file loaded on entry. Do not push
design updates into the middle of a demonstration or wipe entered form state. An
explicit refresh can load the latest saved file, with a clear reset notice.

## Delivery sequence

1. From current Matt, implement save-before-present and its focused saver tests.
2. Extract existing comment controller without changing behavior; test editor parity.
3. Add compatible target context and reliable storage coordination, testing legacy data.
4. Compose the presentation shell around Player and connect comments.
5. Run Dreamscape tests, typecheck, lint and build; perform the acceptance scenario
   and focused keyboard/overlay/narrow-layout checks on a local or preview instance.
6. Review a focused diff against Matt. Keep Tone reference files and deployments intact.

No production deployment or database credentials are required to prepare or test this
integration locally. Use synthetic files and the existing local PGlite fallback.
