# Component Boundaries

For the current atom-only review, start with [the Style Guide](docs/style-guide/README.md).
For atom/molecule/organism contracts and the 14-screen handoff map, start with
[the Design Bible](docs/design-bible.md). The [source audit](docs/atomic-source-audit.md)
records actual adoption and exceptions; the [pre-build practice](docs/pre-build-design-practice.md)
is the working agreement before new prototype work. This file remains the concise
implementation-ownership reference.
The [component inventory](docs/component-inventory.md) counts used JSX types, while
the [health review](docs/component-health.md) records verified reuse and remaining work.

## Naming and Ownership

- React components use PascalCase names and matching kebab-case filenames. Route entrypoints (`page.tsx`, `layout.tsx`) follow framework conventions.
- `components/ui/` contains the existing shared UI library. Keep its public names and APIs intact.
- `components/` contains product-independent controls. These must not import demo fixtures.
- `app/` contains workflow views and application composition. Reuse views through their props; do not copy their markup into another audience view.
- `app/demo/` and `lib/demo/` contain the document-upload scenario, fixture data, configuration checks, and scripted responses. These are not a generic production design engine.
- All application styling stays in `app/globals.css`. The downloadable `style.css` is a generated handoff artifact, not a second application stylesheet.

## Shared Controls

| Component | Contract / Consumers |
| --- | --- |
| IconButton | Label, icon children, optional active state, native button props. Review and mock design tool share tooltips and accessible names. Defaults to a non-submitting button. |
| CommentAvatar | One deterministic comment initial/fallback; shared by threaded and anchored comments. Decorative when the full author name is adjacent. |
| StateSelector | Typed value/options and change callback. Review canvas, brief, and design workspace share selection semantics. No upload-specific imports. |
| GuidedPrompt | Controlled text, supplied suggestions, character limit, disabled state. Review assistant and test setup share completion behavior; demo prompts are supplied by their parents. |

## Workflow Components

| Component | Responsibility |
| --- | --- |
| FlowReview | Owner workspace orchestration: revision selection, persistence, audience navigation and dialogs. Intentionally application-specific. |
| DesignWorkspace | Replaceable mock design tool; passes edited config into review. Marked by `DEMO_IDS.designWorkspace`. |
| PreviewCanvas | Children-based pan/zoom surface, framing and focus. Does not create the design being displayed. |
| ReviewBrief | Selected upload-state goal, review question and evidence entrypoints. Upload scenario-specific copy remains an integration point. |
| ReviewComments | Version/state/anchor-scoped comment threads, replies and moderation. Used by owner and shared product-owner reviews. |
| AnchoredComments | Positions supplied comments against stable component anchors; uses CommentReactions. |
| CommentReactions | Shared persisted like/dislike/Fuego actions. |
| ReviewResults | Revision-filtered participant evidence and session selection. |
| ResultsSummary | Scoped outcome metrics and grouped observations. Links directly to matching sessions; full evidence stays in ReviewResults. |
| SessionSignals | Interaction timeline and observations from the shared `sessionFacts` helper. |
| EvidenceTrail | Links a recorded session to feedback and a subsequent saved revision. Uses the same `sessionFacts` calculations as results. |
| POReview | Presentation-ready update, experience, findings and decisions. Shared links reuse this view without granting owner data access. |
| ParticipantTest | Consent, instructions, sequential telemetry, completion/abandonment and feedback. Intentionally owns test-session behavior. |
| TestSetupEditor | Controlled test settings plus a marked scripted helper. |
| JourneyView | Journey editing, ordering, persistence and review navigation. |
| DeveloperCode | Read-only saved-revision export; delegates scenario-specific generation to `lib/demo/document-uploader-code.ts`. |
| SharedReview | Share-token loading and audience routing. Not a second implementation of the product-owner or participant experience. |
| Providers | Theme and toast context. |

## Replaceable Upload Scenario

- `DocumentUploader` is the canonical runtime and handoff component name. All design, review, PO and participant previews import the same runtime component.
- `DocumentUploaderFields` supplies the same config fields to DesignWorkspace and UploadProperties. Length limits come from the validated upload schema; parent views own save behavior.
- `UploadProperties` adds version-note/save/discard actions around those fields.
- `UploadCaseStudy` and its export are upload-specific narrative templates.
- `createDocumentUploaderCode` creates a simplified standalone React/CSS example from saved configuration. It is deliberately not a byte-for-byte export of the application renderer. Real uploads, production integration and automatic design-to-code conversion remain future work.
- Keep existing `DEMO_IDS` values, `document-uploader`, `upload-error`, test action names, and persisted state values unchanged. Saved comments and evidence depend on them.
- When integrating the real design tool, replace the marked design workspace and scenario adapters. Keep the review/evidence/session APIs intact; do not globally replace stored anchors or states without a migration.

## Guardrails

- `npm run lint:review` covers every application, library and component source, not a hand-maintained subset.
- `npm run test:structure` checks component/file naming, retired imports, demo markers, independent shared controls, one stylesheet, scenario state ordering, export syntax, and evidence logic.
- `npm run test:api` exercises persistence, owner/share boundaries, reactions, journeys and participant event transitions against the built local server.

This is a reusable POC structure, not a claim that every workflow is domain-independent. The upload scenario, scripted AI, handoff template, and workspace orchestration still need deliberate adapters when the real design engine is connected.
