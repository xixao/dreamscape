# Flow Review Engineering Review

Reviewed September 12, 2026. Scope: review, presentation/canvas, comments/reactions,
versioning, test setup, participant lifecycle, analytics, exports, API access,
demo components, and application styles. The mock design workspace was excluded;
its imports were updated only to follow the relocated demo modules.

## Findings Addressed

| Priority | Finding | Resolution |
| --- | --- | --- |
| P1 | Handoff exported saved configuration together with checks calculated from an unsaved draft. | Schema v2 explicitly separates `savedRevision` from `inspectedDesign`; checks describe the latter and comments identify the saved version. |
| P1 | A prepared test token could be reused with a different selected version or mutable setup. | Ready tests capture the token, revision, and settings together. Saving/switching versions invalidates the ready link. Participant trials receive that snapshot. |
| P1 | Typing during a save could be overwritten by the completed save response. | The saved version advances while subsequent draft edits remain unsaved and intact. |
| P2 | Both-device feedback did not distinguish the actual clicked device. | Pin selection carries the concrete viewport; the shared placed-comment selector respects it. Existing `both` comments remain compatible. |
| P2 | First-version comparison could compare a version with itself, and device modes could conflict with comparison. | Compare requires a genuinely older version and starts in desktop mode; choosing mobile/both leaves comparison. |
| P2 | Zoom buttons treated Fit as 100%, causing an unexpected jump. | Controls now step from the actual rendered scale. |
| P2 | State-based busy flags alone allowed same-tick duplicate submissions. | Ref-backed guards protect owner mutations, shared-review actions, feedback posting, and participant feedback. |
| P2 | Malformed JSON values produced server failures; reply context could diverge from its parent. | Non-object bodies return 400. The server inherits reply state, viewport, and anchor from its parent. |
| P2 | Late refresh responses could overwrite newer data. | Owner/shared loads use sequence guards; shared pages reset by token. |
| P2 | Test analytics wording suggested designer trials were excluded. | Results now distinguish consented designer-run tests from unrecorded canvas previews. |
| P2 | Participant screen transitions did not move keyboard focus. | Start, active-task, and finish headings receive focus when the phase changes. |
| P3 | Demo data/rules, large views, and legacy style layers were mixed together. | Demo modules and reusable results view extracted; one application stylesheet; retired notification panel removed. |

## Demo Replacement Map

Search `DEMO_IDS`, `data-demo-id`, or the `flow-demo:` prefix. These are repeatable
DOM metadata attributes, not duplicated HTML `id` attributes or database keys.

| Stable ID | Replacement location |
| --- | --- |
| `flow-demo:document-upload:v1` | `app/demo/document-upload.tsx`; `lib/demo/upload.ts`; `lib/demo/upload-schema.ts` |
| `flow-demo:recovery-agent:v1` | Marked assistant panel in `app/flow-review.tsx`; `lib/demo/recovery-agent.ts`; patch in `lib/demo/upload.ts` |
| `flow-demo:test-setup-agent:v1` | Marked section in `app/test-setup-editor.tsx`; `lib/demo/test-setup.ts` |
| `flow-demo:upload-checks:v1` | Marked checks panel in `app/flow-review.tsx`; `checks` in `lib/demo/upload.ts` |
| `flow-demo:upload-properties:v1` | `app/demo/upload-properties.tsx` |
| `flow-demo:upload-case-study:v1` | `app/demo/upload-case-study.tsx`, including its Markdown export |

`lib/demo/registry.ts` owns all IDs and the legacy upload anchors. The shared
`Config` type is now an explicit alias to the demo schema rather than a second
hand-maintained definition. Server validation and the review property editor
consume that same schema. The demo designer still has its own property controls,
deliberately left out of this review's refactor scope.

### Keep When Integrating

- `Feedback`, `CommentReactions`, and `AnchoredComments` provide the common feedback UI.
- `PreviewCanvas` owns pan/zoom; `ParticipantTest` owns consent, task controls, completion, and feedback.
- `ReviewResults` and `SessionSignals` render real recorded sessions.
- `lib/review.ts` owns configuration comparison, previous-version selection, placed-comment filtering, and consistent handoff creation.
- Existing database records and immutable migrations are unchanged.

### Replace Deliberately

1. Agree with Matt on the real document/component schema, stable anchor IDs,
   state transitions, and task-success events. `Config` and `UploadState` are
   still upload-specific contracts, not a universal design-document engine.
2. Replace the demo renderer, schema, fixtures, rules, and agent adapter at the
   imports above. Update the bootstrap baseline and the participant event adapter.
3. Preserve or explicitly migrate stored `document-uploader` / `upload-error`
   anchors and version-pinned tests. Do not rename these IDs merely to remove
   the demo prefix; saved feedback depends on them.
4. Replace the scripted checks with evidence from the actual component/system.
   Passing these three checks is not an accessibility or production certification.
5. Remove the marked demo panels and fixtures only after their imports and stored
   data have an integration path. The markers make replacement discoverable;
   deleting the entire demo directory today would intentionally break the app.

## Styles And Duplication

`app/globals.css` is the only authored application stylesheet and the only CSS
import in the app shell. Tailwind, animation, and vendor primitive CSS remain
dependencies of that entry point. Dynamic canvas transforms and comment positions
remain inline because they are runtime coordinates, not duplicate style themes.

Consolidation preserved selector and conditional order. Removed 55 declarations
shadowed by later declarations of the same selector/property/context and the
unused `FeedbackNotifications` component/styles. A parser comparison verified
1,849 effective selector/property/condition entries against the previous styles,
excluding the deliberately retired notification styles. Responsive, theme,
focus, and presentation overrides are intentional and have not been flattened.

## Verification

- TypeScript and the production build passed.
- Scoped Flow Review lint passed with zero warnings; the excluded mock designer,
  generated/vendor UI, and platform build tooling are not covered by that claim.
- 96 API status assertions plus payload assertions passed against the local built
  worker: ownership, identity attribution, version pinning, revocation, parent
  context, validation, reactions, consent, success/recovery, abandonment, feedback,
  duplicate interaction IDs, and competing terminal requests.
- Structure/domain checks passed: one stylesheet entry point, no exact duplicate
  CSS blocks, no retired imports, unique/used demo markers, scenario transitions,
  unordered version selection, viewport filtering, and draft-safe handoff data.
- No browser interaction, screenshot, assistive-technology, real-device, or load
  testing was performed. Code/API verification does not establish visual or
  end-to-end browser correctness.

Repeatable commands: `npm run test:structure`, `npm run lint:review`, and
`npx tsc --noEmit`. For API tests, build, start the built worker on port 5186,
then run `npm run test:api`. Tests are local-only and use a unique test owner;
they do not seed or overwrite the designer's workspace.

## Before Production

- Add browser regression coverage for the complete designer/tester journey,
  draft edits during delayed saves, trackpad gestures, responsive layouts,
  comments, keyboard focus, and screen-reader announcements.
- Define production roles and authorization. The audience selector changes the
  owner's presentation; it is not a role-permission system. Private Site access
  is still required even when someone possesses a share link.
- Add pagination/retention and appropriate service limits. Results currently
  show the latest 100 sessions; comments/revisions are not paginated. Session
  interaction arrays are bounded, but public-scale abuse protection is not built.
- Add idempotent mutation keys/recovery for uncertain network failures and a
  deliberate draft-persistence policy. In-memory drafts do not survive reloads;
  abandoned browser tabs remain open sessions rather than inferred failures.
- Connect the real design document, Design System MCP, AI approval/audit workflow,
  and real product actions. Current upload events and checks are intentionally
  scripted. This remains a well-bounded prototype, not a production certification.
