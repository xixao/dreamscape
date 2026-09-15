# Dreamscape presentation integration

Status: preparation and implementation contract; no runtime integration has been made.

## Scope agreed with the user

Dreamscape is the application. Our contribution is its presentation experience.
Use Matt's component library, editor, Player, prototype interactions, file saving,
and comments. Do not build a second review application inside it.

Keep the current Tone app intact as a reference. Implementation starts from the
current Matt branch, with focused commits for this integration. The branches have
unrelated histories; do not merge Tone wholesale or overwrite Matt's files.

Inspected Dreamscape baseline: f53cf1f095cb8b7c5813ddda22489f6e69d0a697.
Recheck origin/Matt and its instructions before implementation; this is a source
inspection, not a test report or evidence that production has this exact commit.

## What stays and what is left behind

| Tone source | Disposition | Dreamscape owner / integration guidance |
| --- | --- | --- |
| app/flow-review.tsx | Presentation reference only | Extend components/play/player.tsx; do not port the workspace orchestrator, audience routing, API calls or demo state |
| app/design-workspace.tsx | Leave behind | components/workbench/workbench.tsx owns authoring |
| app/preview-canvas.tsx | Adapt behavior, not whole file | Fit/zoom/pan must use actual Player artboard dimensions; remove fixed page/component/error widths, paired canvases, feedback gutters and uploader state assumptions |
| components/workspace-header.tsx | Adapt composition | Use Dreamscape UI primitives/tokens; current screen, display controls, comments and exit only |
| components/right-panel.tsx | Layout reference | It depends on Tone global CSS; do not import it without reimplementing the shell in Dreamscape's styling |
| app/review-comments.tsx, app/anchored-comments.tsx, components/comment-pin.tsx | Leave duplicate implementations behind | Reuse Dreamscape CommentLayer, CommentComposer, CommentThreadPopover and createCommentStore |
| app/demo/*, lib/demo/* | Reference fixtures only | Dreamscape components/blocks/registry.tsx and known-types.ts remain canonical |
| components/state-selector.tsx | Do not port fixed states | Use current screens and existing Play interactions; expose only supported scenario controls |
| components/phone-model-select.tsx, lib/preview-devices.ts | Leave demo device catalog behind | Reuse Dreamscape lib/stage/device-presets.* and StageProvider |
| components/ui/*, app/globals.css | Do not copy wholesale | Dreamscape's primitives, theme and chrome own visual styling |
| lib/model.ts, lib/server.ts, app/api/*, db/*, drizzle/* | Leave behind | Dreamscape's existing files repository, API and database remain authoritative |
| app/chatgpt-auth.ts, .openai/hosting.json, build/*, scripts/sites-* | Leave behind | Preserve Dreamscape's hosting/runtime; no Cloudflare/Sites migration |
| PO, tests/results, journey, case study, code handoff, AI assistant | Defer | No audience switcher, research telemetry, chat integration or second editor in this slice |
| docs/style-guide/* | Selectively apply | Preserve focus, clear labels, action ownership, error handling and responsive behavior; do not override Matt's entire design system |

## Existing connection points

All paths below are relative to the Matt checkout, not Tone.

- app/f/[id]/play/page.tsx: loads and normalizes the saved file and forwards
  screen/page/overlay selection. Keep this entry route and existing validation.
- components/play/player-loader.tsx: retains the client-only boundary required
  by Craft. Do not import its component registry into a server route.
- components/play/player.tsx: owns Play state and renders the existing resolver
  through Craft Editor/Frame. Keep this as the rendering and interaction owner.
- components/play/play-context.tsx and lib/interactions.ts: navigation, back,
  dialogs and overlays. Presentation commands delegate here.
- components/workbench/topbar.tsx: presentHrefFor remains the URL builder.
  Toolbar and keyboard entry must share one save-before-present operation.
- lib/persistence.ts: enhance createFileSaver's completion contract instead of
  adding a second file writer.
- lib/comments/store.ts: preserve the existing comment model/store as the base.
- components/workbench/comments/*: reuse the UI and coordinate helpers.
- components/workbench/workbench.tsx: extract existing comment state/handlers
  into a shared controller, then use it in both editor and Player.

## Data ownership

| Data | Owner | Presentation behavior |
| --- | --- | --- |
| File/pages/screens/layouts | Existing files repository | Read the saved file; presentation controls do not PATCH layouts |
| Prototype navigation/dialogs/overlays | Player | Transient state, resettable without modifying the source design |
| Display zoom/fit/viewport | Presentation session | Separate visual scaling from responsive width; never autosave a device preview into the design |
| Comments/replies/resolution | Existing comment store | Same browser storage namespace and existing records; add target context compatibly |
| Author name | Existing author-name preference | Keep current display-name semantics; do not describe it as authenticated identity |

## Initial acceptance scenario

1. Edit a label in Dreamscape and immediately choose Present.
2. Presentation shows that confirmed saved label through the same component.
3. Operate a wired navigation control and an overlay normally.
4. Enter comment mode and add a comment to the current screen.
5. Return to the editor; see and reply to the same thread.
6. Reopen presentation; the reply appears on the correct screen.
7. Fail a save and repeat Present: retain the draft, explain the failure, and do
   not imply the stale saved design contains the latest change.

No immutable snapshots or database migration are required for this local POC.
The existing Play URL identifies a mutable file, not a pinned design revision.
Cross-person comments and version-pinned reviews remain separate scope decisions.

See implementation-plan.md for the work sequence, edge cases and verification.
