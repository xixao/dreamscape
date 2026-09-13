# Flow Review: A five-minute demo

## The scenario

The designer created one document uploader, not a full mortgage application. It uses a fictional, preselected PDF and three states: ready, failed, complete. It does not accept real files or personal mortgage information.

1. Open Flow Studio, the labeled design workspace demo, and sign in if prompted. Select layers, edit the uploader in the Design inspector, or prepare the simulated agent's recovery patch. Review & Test enters Flow Review; Back to design returns to the same draft, version, component selection, and upload state. Play the scenario and select Upload document. The original design preview reaches an error with no recovery action.
2. Open **Feedback**, or select the error's numbered pin, and add a comment. Reply, like, assign, or resolve it. Feedback belongs to this version, state, component, and viewport.
3. Open the assistant and select **Review this flow**. It presents the prepared error-copy, retry-button, and alert-announcement changes. Nothing applies until **Apply changes** is selected.
4. Retry the upload. It succeeds. Switch to mobile or both viewports to see the same component state.
5. Open **Edit component** to adjust copy and behavior manually. Save a new version. In **History**, return to earlier versions or compare with the preceding version.
6. Share a pinned **Product owner review** or **Participant test** link. Private Site access is required in addition to the link. Participant mode now opens the same focused test experience as a shared test: instructions and consent, the prototype with a sticky task/Abandon Test bar, then feedback. Selecting Participant test from the audience menu creates a link to the saved revision; clicking Begin test records a real session, including when the designer is trying it. Ordinary canvas playback still does not create participant metrics.
7. Open **Test results** and refresh. Inspect the captured actions, elapsed time, outcome, and written feedback. Export the evidence or the working case study.

To repeat the failure-to-fix story, use **History > Create baseline version**. This preserves existing feedback and history instead of deleting them.

## What is real

- Set up test opens editable title, instructions, task reminder, participant cohort (Teammate, Business, Development, Research, Pilot), page/component surface, desktop/mobile viewport, and success/recovery scenario. Creating a link saves an immutable setup with its version. Ready confirmation, copy/share link, and Try test are available; trials record a session only after consent and Begin test. Cohorts label the test; they do not grant Site access.
- Test setup appears in participant instructions and session analytics. Recovery setup is rejected when the selected version has no Retry action.

- Participant tasks without a configured retry use a successful upload path so the test is completable. Retry-enabled versions retain the failure/recovery task. After the document is received, Continue or Complete Test records completion. Fuego is a flame-only button immediately after the fifth star.

- Participant completion and explicit abandonment records, plus a click timeline (target, state, availability, elapsed time). Five or more unavailable-control attempts on the same target/state are flagged. Non-action clicks are counted separately; these signals do not establish that a tester clicked the wrong thing or was confused.
- Participant feedback includes optional 1-5 stars, a Fuego reaction with a bottom-screen "Fuego" confirmation, and a written comment. Feedback can be saved after completion or abandonment and is visible in the designer's Test results.

- A window-filling workspace with fixed surrounding controls. Drag the canvas background or non-interactive parts of the prototype to pan. Two-finger scrolling pans; Mac trackpad pinch zooms only the canvas. Fit recenters it. Arrow keys pan a focused canvas.
- Light/dark theme switching, fit/15-300% canvas zoom, page/component/error focus, and presentation mode with optional browser fullscreen.
- Toggleable compact comment cards alongside their saved component anchors, filtered to the current version, state, and viewport. Cards move with the canvas and stack to avoid overlapping each other. Open the thread to reply. Existing comments use semantic component anchors, not arbitrary saved pixel coordinates.
- Like, dislike, and Fuego reactions persist, with one active reaction per person per comment. Adding Fuego displays a fire emoji and a "Magic" toast; removing it does not replay the celebration. Existing likes are preserved by the additive database migration.
- Feedback polls every ten seconds while enabled and the tab is visible. New signed-in reviewer comments use their supplied display name (email fallback); old generic author labels are preserved.

- The upload component, editable text, three states, retry action, and responsive layout.
- Server-saved versions, contextual comments, replies, reactions, assignments, resolutions, link revocation, and notification preferences.
- Scoped review/test links, consent, fixed event recording, outcome validation, and session exports.
- Deterministic checks of this component's configured behavior and a copy-length heuristic. No overall accessibility or production-readiness certification.

## What is scripted or limited

- Flow Studio is a bounded stand-in for Matt's app, not a general drawing tool. It uses the same live uploader, draft configuration, selected component ID, upload state, comments, and save operation as Flow Review. Its agent proposes the fixed recovery patch. There is no live model selection, arbitrary drawing, or integration with Matt's app. Reloading resets the workspace to Design and discards unsaved in-memory drafts; saved versions persist.

- The simulated setup prompt recognizes audience names, mobile/phone, component, and recovery/retry/failure keywords and fills a prepared draft. It does not interpret arbitrary workflow requests. Example: "Set up a Research mobile component test for the document upload." The designer reviews and creates the link before the test is marked ready. The main assistant input also routes test/study/pilot/research requests into setup.

- Phone preview includes iPhone and iPhone Duo folded/unfolded. The 390px and 740px layout widths are illustrative CSS viewports, not certified hardware dimensions or an iOS emulator. Switching posture preserves the upload state and mobile feedback; it does not create a new revision.

- The assistant is a deterministic sequence with a short presentation delay. No model receives prompts or files.
- There is no real upload, lending decision, loan submission, Figma import, Design System MCP connection, arbitrary app execution, or live multi-user coediting.
- Comments update after actions, manual refresh, or the enabled on-screen feedback poll. There is no real-time push. Notifications are in-app only.
- Participant session timing includes idle time. Closing or reloading an unfinished task leaves an open session; sessions are not inferred to have failed.
- Reviewer likes are per supplied session actor for anonymous links; this is not a fraud-resistant research platform.
- Shared review links expose the pinned version and its comments. The workspace's case study/history remain internal.
- Site access stays owner-private by default. Do not claim that an app link alone gives another person access.

## A connection Matt can build against

The prototype exports a versioned JSON handoff from **Checks**. Its stable component ID is `document-uploader`; its error anchor is `upload-error`.

For an integration, an adapter should provide the rendered component, stable element IDs, explicit states, supported edit fields, version metadata, and named interaction events. The first supported edits are text, retry availability, and an error announcement flag. Avoid treating arbitrary generated HTML or an embedded URL as an instrumented app.

The central contract lives in `lib/model.ts`; the demonstrator lives in `app/uploader.tsx`. Review UI is separate from the demonstrator. `lib/server.ts` validates and persists requests. The assistant patch can later come from GPT, Claude, or a Design System MCP without replacing the surrounding review workflow.

## Verification

Build the app and apply the generated local migration, then start the built Worker with `npm start -- --port 5186`. Run the focused API checks with `node tests/api.mjs http://localhost:5186`. They use a dedicated local test identity and do not seed demo feedback into the owner's workspace. The development server intentionally strips injected identity headers, so run these tests against the built Worker only.

82 API requests and their payload assertions passed, including all five test cohorts, custom setup persistence, scenario validation, successful-upload and recovery completion paths, access checks, reactions, revision pinning, consent, event sequencing, link revocation, interaction isolation, and rating/comment/Fuego persistence. TypeScript and the production build passed. Browser interaction testing and physical Mac trackpad testing were not performed in this build pass.

WebMCP preview-state tools are feature-detected. Unsupported browsers ignore them. This is optional integration groundwork, not a requirement to use the prototype. No supported WebMCP execution context was available for contract validation, so those tools are not yet verified.
