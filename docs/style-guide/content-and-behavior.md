# Content and Behavior Rules

Status: product baseline for screen reviews. These rules extend the
[Atom Specifications](atom-specifications.md) and [Layout Baseline](layout-and-patterns.md).
They do not certify the current screens or replace the recorded test task.

## Names and Commands

- Button text names the result: “Save journey,” “Retry upload,” “See evidence,”
  “Abandon test.” Avoid “Submit,” “Continue,” or “Done” when the destination or
  effect is unclear in context. Keep a stable label during a pending action where
  possible; show progress beside it so the control does not change width.
- Icon-only actions have an `aria-label` that names the action, not the glyph:
  “Zoom in,” “Open comment thread,” “Move step earlier.” A tooltip repeats that
  useful name and may add a short hint. It is not the sole accessible name.
- Navigation names the destination; commands name the action. Buttons remain
  buttons when they update in-place content; links expose real destinations.
- Set sentence-case labels consistently across pages. Product names, file names,
  version identifiers, and the requested Fuego wording retain their intended case.
- Do not use an icon, color, emoji, or animation as the only description of a
  status. A count includes its unit and relevant scope.

## Tooltips

- Use on icon-only or unfamiliar compact actions when the name is not already
  visible. Do not put essential instructions, errors or task goals in a tooltip.
- Show on pointer hover and keyboard focus. Dismiss on pointer leave or focus
  movement. Touch users still need an accessible name and a discoverable visible
  route to any essential detail; hover cannot be the only route.
- Keep text short and stable across views that reuse the same action. Distinguish
  “Fit canvas” from “Reset zoom” if their behavior differs.
- A disabled action's explanation is adjacent text or another reachable help
  mechanism; a disabled native button cannot be relied on to expose a tooltip.

## Form Copy and Errors

- Labels remain visible after entry. Mark optional fields explicitly when it
  helps a decision; mark required fields in text and semantics, not color alone.
- Helper text explains the expected format or constraint before an error occurs.
  Errors identify the affected field, the problem and a recovery action. Keep
  entered data after failed validation or saving.
- Empty state copy identifies why content is absent and what can be done. “No
  sessions for version 1” differs from “Results still loading,” “Unable to load
  results,” and “You do not have access.” Never present unavailable data as zero.
- Save feedback states which object changed: journey draft, component revision,
  test setup, comment or PO decision. A saved version and an unsaved local draft
  may coexist and should be described separately.
- Participant task instructions state the goal without naming the exact control
  to click. A reminder stays visible or readily accessible during the test.

## Feedback and Notifications

- Comment forms name the exact target, state and saved version before entry.
  Post is disabled for blank text or while a request is pending; a failed post
  retains the draft. Replies inherit the parent comment's placement. A thread
  exposes author, placement, status and available actions in that order. Keep
  assignment and resolution limited to authorized reviewers, while every reader
  can understand the comment's context without relying on its canvas position.
- Inline validation appears next to the relevant field and is linked with
  `aria-describedby`/`aria-invalid` as applicable. Request failures preserve the
  work and offer retry. Success appears only after confirmation of the action.
- Toasts supplement the persistent screen state. They do not contain information
  needed to complete a task after they disappear. Avoid repeated announcements
  during loading or canvas movement.
- Comment reaction Fuego is a reaction to another person's comment and currently
  shows “Magic.” Participant Fuego is optional test feedback and shows “Fuego”
  centered in red. These are separate interactions and records even though both
  use a flame glyph. Neither changes the star rating automatically.
- Rating stars are ordered one through five with a spoken selected value.
  The flame sits beside the fifth star as an additional choice. A participant can
  finish the task without rating, and feedback submission must not submit twice.
- Destructive actions such as abandonment name the outcome clearly. Abandoned
  sessions are not counted as completed, even if optional feedback is later sent.

## Writing and Evidence

- Findings state an observation with its session count and version/audience scope.
  They do not state a cause that the evidence has not established.
- Quote a participant accurately and keep their feedback attributed to the
  session identity presented in the app. The full quote remains available if a
  summary is truncated.
- PO copy leads with progress, open risk and requested decision. Designer copy
  can include edit rationale and detailed evidence. Engineer copy identifies the
  saved revision and integration work still required.
- Scripted AI is not presented as proof of live model analysis. It may demonstrate
  the intended interaction, but the handoff states which responses are demo rules.

These rules are ready for the first page review. Real wording can be refined with
test evidence while preserving the same action and status contracts.
