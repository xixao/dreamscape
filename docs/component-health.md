# Component Health Review

Source review: 2026-09-13. [Generated inventory](component-inventory.md) contains
all used JSX component types and consumers. This review judges reuse, atom adoption,
data ownership and duplication from source. It does not claim every view has passed
visual, keyboard or assistive-technology testing.

## Count and Meaning

The design-system count is **18 shared foundation sources** (13 UI modules and
5 product controls), plus **3 reusable domain families**: document uploader,
comments and preview canvas. Those three families contain six collaborating
implementations. The remaining **16 product declarations** are feature/screen
compositions, not separate entries in the reusable library. Four route/provider
components are tracked separately.

The prior **55** was an implementation-symbol count at the initial audit. It treated `Tabs`, `TabsList` and
`TabsTrigger` like three design-system components and counted full screens beside
atoms. That number is retained in the generated inventory for source traceability,
but should not be used to describe the library's size.

Variants such as Button size, tone or icon placement do not become new components.
A component can be healthy while used once, and a widely reused component can
still have a defect. Atomic Design is a guide to composition, not a reason to
merge different tasks into one generic component.

## Verdict by Product-Owned Component

| Component(s) | Source-health verdict | Evidence and next action |
| --- | --- | --- |
| CommentAvatar | Consolidated | The same comment initial is now rendered from one source in ReviewComments and AnchoredComments. CSS `.avatar` remains shared. Verify visually in both placements. |
| LabeledField | Shared form molecule | Journey, Results and PO Decisions now share label/control anatomy with Input, Textarea and NativeSelect. Help/error variants and browser verification remain. |
| IconButton, StateSelector, GuidedPrompt | Shared with consumers | Reused in designer/review/setup as appropriate. StateSelector's strip and compact modes both use Button; preserve pressed/numbered semantics. |
| PreviewCanvas | Shared canvas behavior | Designer and Review import the same pan/zoom surface. PO Experience deliberately uses read-only prototype presentation; do not force editing behavior into it. Verify controls and anchors together. |
| DocumentUploader | Shared demo renderer | Designer, Review, PO and Participant use one runtime component. Its two native annotation pins have distinct anchors; instrumented upload/continue actions already use Button. Preserve demo IDs and test events. |
| DocumentUploaderFields, UploadProperties | Shared fields, scoped save | Mock designer and Edit component reuse field definitions and schema limits. UploadProperties owns save/discard; avoid a second field implementation. |
| UploadCaseStudy | Demo-specific, healthy boundary | Version selection row is purpose-specific and export is scenario-derived. Align its version-selection behavior with History later, without treating the entire case study as a generic component. |
| ReviewComments, CommentReactions, AnchoredComments | Shared discussion behavior | ReviewComments is used by owner/PO; CommentReactions is used in threads and anchored comments; anchors position existing comment data. Native context/reply actions need atom review, not a second comment backend. |
| ResultsSummary, ReviewResults, SessionSignals, EvidenceTrail | Shared evidence calculations | All derive facts from `lib/results.ts`. ResultsSummary presents designer details; PO's concise outcomes now use the same `summarizeResults` counts. Maintain identical version/audience scope before comparing values. |
| ReviewBrief | Local evidence entry | Shares StateSelector and sessionFacts; its two evidence buttons share local styling. A common evidence-entry composition can be considered during molecule review. |
| JourneyView | Atom consolidation implemented | Drag grips, step rows and reorder actions now use Button's bare/auto variant; seven fields use LabeledField. Preserve ordering, draft and saved-state behavior. |
| POReview | Field and action placement implemented | Section navigation now uses Button's bare/auto variant. Four decision fields share LabeledField; section footer is outside scrolling content. Permission and shared-link disclosure stay distinct. |
| DesignWorkspace | Demo boundary and composition review | Six direct layer/feedback buttons are specialized selection rows. It shares PreviewCanvas, StateSelector, DocumentUploader and fields; replace only the marked mock editor when Matt's real canvas connects. |
| FlowReview | Composition review needed | Workspace orchestrator owns audiences, revisions, dialogs and inspector modes, and uses many shared controls. One direct history selection button remains. Its size and page-specific CSS warrant staged extraction during layout review, not a blanket generic wrapper. |
| ReviewResults | Atom consolidation implemented | Two filters use LabeledField and NativeSelect; session selection uses Button's bare/auto variant. Filtering, selected-session fallback and detail evidence are unchanged. |
| ParticipantTest | Purposefully separate behavior | Uses shared DocumentUploader and UI atoms. Its consent, telemetry, completion/abandonment and rating must not be merged into an owner preview or comment reaction. |
| TestSetupEditor | Shared prompt and form atoms | Uses GuidedPrompt and existing form controls, with scripted demo helper. Real AI connection remains future work. |
| DeveloperCode | Purposefully specialized | Uses shared Tabs/Button and a scenario code generator. Generated example code is not the runtime DocumentUploader source; retain accurate handoff wording. |
| SharedReview, SharedReviewContent | Routing/permission adapter | Reuses POReview/ParticipantTest after token validation. Internal helper is counted because it renders JSX, not because it creates a new product screen. |

Every one of the 27 product-owned declarations appears in the table. The used
UI-library parts remain owned by their existing `components/ui/` sources. Their
public APIs are not duplicated in product code, but consumers can still override
visual behavior through page CSS.

## Cross-Application Findings

1. **Confirmed duplicate fixed:** comment initials appeared in two files with
   the same markup. Both now use CommentAvatar. No other exact cross-source
   rendering duplicate is established from source review alone.
2. **Shared math fixed:** PO's completed/abandoned/open session counts were
   recomputed alongside the common results helper. They now use
   `summarizeResults` on the same revision-scoped sessions. This aligns logic;
   it does not make the PO view a copy of ResultsSummary.
3. **Zero direct product button/input/textarea/select sites remain** outside
   the UI-library internals. The 21 former button sites now use Button, with
   `bare`/`auto` for specialized rows, pins, grips, navigation and evidence
   selection. Shared source adoption is implemented; cross-variant visual and
   keyboard verification remains. See [atom remedies](atom-remediation.md).
4. **CSS still weakens reuse:** one application stylesheet exists, but page
   overrides and literal colors can make one shared primitive look different.
   The [baseline](style-guide/layout-and-patterns.md) sets ownership; migrate
   selectors with each affected screen instead of deleting broad blocks blindly.
5. **Large view files need composition work:** FlowReview and POReview contain
   multiple screens and workflow responsibilities. Extract only repeated
   behavior with real consumers after the template review. Retain their data,
   share permission and telemetry boundaries.
6. **Demo boundaries are well marked:** four demo adapters are product-owned
   components but are not the real design engine. Do not count a mock designer
   and a future design canvas as two production component sources.

## Health Criteria for the Next Pass

| Criterion | What counts as healthy | Current evidence |
| --- | --- | --- |
| Canonical atoms | One approved source/variant for each common control; justified native exceptions | Button, Input, Textarea and Select sources adopted across audited product code; full variant verification remains |
| No copy-paste behavior | Shared renderer, reactions and calculations where semantics match | Good for uploader/comments; avatar and PO count duplicates fixed |
| Clear ownership | Component owns its local behavior; persistence and authorization stay with workflow/server | Good boundaries; large orchestrators need review |
| Token propagation | Shared token and atom edits render consistently in all roles/themes | Baseline tokens exist; per-page CSS not migrated or visually verified |
| State completeness | Loading, error, empty, selected, disabled, saved/draft and permission variants meaningful | Documented contract; screen review outstanding |
| Responsive/accessibility | Keyboard focus, target size, reflow, long content, light/dark in real browser | Not certified by static source audit |
| Demo handoff | IDs/anchors/states stable; replacement points explicit | Documented and structure-tested |

## Work Order

1. Verify Button's bare/auto row and pin presentations and the field recipe in
   every role/theme; add help/error field variants where needed.
2. Review one connected layout slice: Review → Test results → PO Findings. Test
   primary action, scroll ownership, evidence drill-down and role-specific detail.
3. Carry approved patterns to the remaining screens with regression checks in
   all consuming views and themes. Update the [screen audit](page-audit.md) as each
   view passes; no screen is marked conformant from source inspection alone.
4. Re-run both inventory scripts, structure/lint/build/API checks as relevant,
   then record browser and keyboard evidence before declaring a component verified.

This review is a health baseline, not a full application certification. There are
no known duplicate implementations of the runtime DocumentUploader, comment
reaction logic or session-fact calculation after the targeted fixes above.
