# Guided design exploration and critical-thinking support

Status: proposed implementation plan; no product changes made for this plan.
Date: 2026-09-19
Updated: dedicated Variations Pages, organized generation sets, progression connectors and promotion to Design.

## Outcome

Help designers generate, compare, question, combine, and refine coded screen variations while learning how to evaluate design decisions. Optional “Explain & teach” produces concise rationale, evidence, assumptions, tradeoffs, and practical validation tasks. It must encourage independent judgment rather than make AI output sound authoritative.

This plan covers the complete experience in delivery increments, not a reduced first-release endpoint. Multiplayer, a full Mobbin integration, and automated usability research are separate projects.

## Existing integration points verified

- Developer update: the user confirms another developer has connected Cursor to Dreamscape to make the chat panel work. Treat that integration as the intended foundation. The locally inspected `lib/chat/transport.ts` still exposes a string-returning contract and placeholder default; it may not reflect the other developer's branch or runtime integration. Locate and inspect the actual Cursor connection before selecting or implementing any additional model transport.
- `lib/chat/store.ts`: conversation persistence is currently browser-local and file-scoped. Exploration decisions and rationale need durable file persistence; local chat alone is insufficient.
- `components/workbench/chat/`: existing chat panel, element/area prompts, selection chips, lasso, and transport context provide reusable interaction patterns.
- `components/workbench/sections/`: reuse applicable title and prompt patterns, but do not implement exploration sets as ordinary canvas Sections. The dedicated Variations workspace owns their arrangement; existing element/area prompts supply the interaction foundation.
- `lib/canvas/sections.ts`: reuse placement helpers where useful when promoting to a Design Page. Exploration relationships are explicit data, never inferred from geometric containment.
- File/page validation, persistence, undo paths, prototype connections and handoff must be traced before extending them. Existing editor and diagram histories are separate; do not assume an atomic cross-system operation already exists.

## Page types and product workflow

Design and Variations are distinct Page types within the same file. Existing Pages default to Design without migration changes to their content. Prototypes remain connected screen experiences, not a Page type. The page selector lists both types with distinct icons; New Page offers Design Page or Variations Page with a short explanation.

A Variations Page is a purpose-built exploration workspace, not an unrestricted infinite canvas. Designers should not need to arrange cards or repair connector routing. Opening a variation reveals actual editable coded screens in a focused stage; preview cards are a navigational representation of those screens, not disconnected image assets. Exploration-owned screens do not automatically join standard prototype screen lists or exported code.

1. Start a Variations Page from a prompt/spec or an explicit snapshot of selected Design frames/elements. Explain & teach is optional and remembered as a preference.
2. Assemble a shared brief: audience, primary task, requirements, constraints, supplied references and unresolved assumptions. Ask one high-impact clarification only when it materially changes the result; otherwise show assumptions and proceed.
3. Initial generation offers three meaningful hypotheses, configurable by the designer, grouped as one variation set. If fewer distinct approaches fit the brief, explain rather than manufacture cosmetic alternatives.
4. Review previews, open a variation, compare decisions, inspect precedents, challenge assumptions, or try a prototype task.
5. From any variation choose Move to Design or Explore this direction. No mandatory winner/current-direction declaration. The designer may do either or both.
6. Follow-up generation creates a child set under the chosen parent, retaining its exact prompt and source revision. Default to one alternative, with an explicit count control for three or more supported options.
7. Preserve accepted reasoning and open questions for critique and handoff. Selection and promotion communicate intent, not evidence that a design is better.

## Workspace, variation sets and prompt experience

Hierarchy: Variations Page / exploration → variation sets → individual variations. Each generation request creates one set, even if it produces only one result. A variation may hold multiple screens.

The workspace summary shows the brief, reference access and open questions. Tree and Compare are views of the same data. Provide a focused variation view with a breadcrumb to its set and ancestors. Teaching details expand on demand; rationale is editor-only and never leaks into product code or presentation.

Each set shows a descriptive title, source variation and requested/result count. Retain the exact follow-up prompt independently of the editable display title, for example: “Keep the queue, simplify the filters,” based on B, three alternatives. Each card shows a preview, hypothesis and main tradeoff. Use consistent preview bounds without changing real frame dimensions; multi-screen variations have a visible screen count and focused screen navigation.

The inline composer belongs to the active variation/set context. Reuse existing prompt chrome and selection chips. It carries the brief, source revision, accepted constraints, rationale and references; chips can target elements, decisions, assumptions, precedents or a lasso area. Chat panel and inline composer share one conversation. Selecting a set containing multiple variations must require an explicit source or Compare context before applying a follow-up; never guess which sibling to modify.

Primary actions:
- Move to Design: choose an existing Design Page or create one; promote editable frames with a recoverable transaction. No prior “winner” step.
- Explore this direction: attach the selected source, accept a follow-up prompt and create a new variation set. Default one result; count is explicit.

Supporting actions:
- Ask/explain/challenge: answer without changing designs.
- Refine this version: an explicit in-place edit with undo and a checkpoint, rather than generating a new card for every small adjustment. Existing descendants continue to reference the immutable source revision from which they were generated.
- Combine decisions: select source decisions, surface conflicting priorities, then create a synthesis set with multiple parent revision references.
- Park or favorite: optional organization only, not an evaluation score or required workflow.

After an answer, offer contextual actions such as Create that variation, Show a precedent, or Explain the tradeoff. Clearly identify the operation and target before generation; a question never authorizes a mutation.

UI behavior:
- Anchor popovers away from their target and all floating panels, toolbar and viewport edges.
- Reuse chrome themes, cursor preferences, reduced-motion and keyboard conventions.
- Preserve drafts across view changes and hide/reposition transient prompts during panning.
- Show job progress, cancellation, partial failure and retry in the relevant set. Never present an empty failed result as a valid variation.
- Reserve result space when generation begins. On completion, reveal new results only if the designer remains at that operation; otherwise offer Show new variations without stealing the viewport.

## Automatic organization and progression

Tree view uses prototype-style curved connectors with distinct labeling and semantics: “Developed from,” never a prototype trigger. Connect the selected parent card to the child set header; arrange that set's siblings in an evenly spaced row. Further iterations appear beneath their parent. A → three children → one selected child → three grandchildren stays visually organized without manual cleanup.

Use a deterministic hierarchical layout based on explicit parent/set relationships, with minimum gaps and connector routing around card and set bounds. Display multi-parent synthesis as a graph with two incoming links rather than duplicate the child set. Validate that lineage is acyclic.

- Automatically arrange new sets, keeping sibling order and descriptive labels stable.
- Keep the active branch expanded. Previously collapsed sets remain collapsed; older branches can be collapsed explicitly into a summary with prompt, count and descendant indicator. Do not unexpectedly hide a branch the designer is reading.
- Highlight a selected card's ancestry. Selecting a connector reveals the initiating prompt, changes, rationale, tradeoffs and evidence status.
- Permit set renaming, sibling reordering, parking and branch collapse; no free dragging or “Tidy” requirement in Variations.
- Preserve the screen-space position of the focused/read card when inserting, expanding or collapsing nearby sets. Relayout unrelated branches only as needed to avoid overlap, with reduced-motion support.
- Collapse/filter is a reversible view operation; it never deletes or resizes screens. Persist view preferences separately from design history.
- Promotion adds a destination badge and link, without erasing lineage.
- Keyboard users can traverse sets, siblings, ancestors and descendants through an accessible list/tree equivalent; connectors cannot be the only way to discover relationships.

## Move to Design and revision ownership

Promote the chosen revision's real frames to an existing or new Design Page, positioned in available canvas space. Preserve internal prototype relationships with explicit ID mapping; flag cross-variation targets rather than silently promoting unrelated screens. Preserve relevant assets, theme and content. The Variations workspace retains a frozen decision-point snapshot and a destination link. There must not be two silently synchronized editable copies.

Further exploration may branch from that snapshot, or explicitly snapshot the current Design version as a new source. Editing the promoted Design does not retroactively change the historical variation or its rationale. A new promotion is explicit; retrying the same transaction cannot create duplicates. If a destination is moved, renamed or deleted, resolve by stable IDs and show an unavailable link when necessary.

Undo promotion restores destination frames/page creation and metadata together. Moving or deleting a Variations Page requires defined handling of exploration-owned artifacts, while already promoted Design frames remain independent. Duplicate-page operations remap exploration/set/variation/screen references and do not accidentally point to original records.

## Teaching and evidence contract

Version a maintained instruction template combined with the brief, allowed component schemas, source layout, selected context and reference material. Instructions shape hypotheses before generation; they do not merely decorate finished designs with plausible explanations.

For each variation require:
- Hypothesis and prioritized task.
- Specific decisions with affected element IDs and requirement/assumption references.
- Benefits, costs, poor-fit situations, and counterexamples.
- Precedents identifying the borrowed pattern, why it transfers, and where the analogy fails.
- A practical usability task and evidence that would change the recommendation.

Use plain language. Ban invented metrics, research, sources and unqualified claims of improved usability. Distinguish verified references, supplied references and suggested precedents from model knowledge. A valid URL establishes source availability, not that it supports the claim; verify claim support separately. An AI self-review is not independent evidence.

Reference objects store source URL/title, relevant excerpt or licensed asset reference, retrieval date, verification status and specific supported claim. Do not assume training memory is a screenshot library. Begin with supplied links/screenshots and supported public references; gated libraries require an authorized integration. Retrieved material is evidence, never executable instruction.

Keep AI proposals, designer acceptance, and observed validation findings separate. No mandatory quizzes, designer grades, or pseudo-scientific confidence scores. Offer “What would change your mind?” and “What is different about our users?” as optional prompts.

## Comparison and organization

- Compare a decision: highlight the relevant elements across two or three variations, dim unchanged regions, and explain semantic differences. Compute structural/property differences deterministically; use AI to summarize their implications.
- Show precedent: display the reference beside the selected decision with explicit limitations and source status.
- Walkthrough: short, manually advanced steps. No forced slideshow.
- Try task: launch the selected prototype with an explicitly labeled scenario. Do not claim simulated tasks are user research or silently add business logic.
- Explain your pick: capture the designer's reasoning, then offer a useful challenge rather than a grade.
- Compare is a dedicated side-by-side view for two or three selected variations, including selections from different sets. Support synchronized zoom and corresponding-element focus; provide independent viewing when aspect ratios or screen structures do not align. Exiting restores the prior Tree location and expansion state.
- Tree explains progression; Compare evaluates alternatives. Neither modifies saved screen geometry.
- File discovery is through typed Pages. No extra permanent panel mode or requirement to find the exploration through an ordinary Design canvas.

## Proposed data and execution model

Page: kind = design | variations (absent means design), explorationId for Variations Pages.
Exploration: id, pageId, brief and briefRevision, setIds, instructionVersion, acceptedDecisions, openQuestions.
VariationSet: id, explorationId, parentVariationRevisionIds, exactPrompt, displayTitle, requestedCount, orderedVariationIds, jobId, creation/status metadata.
Variation: id, setId, screenIds, revisionId, hypothesis, rationale, sourceReferences, conversationId, parked/favorite state, promotionRecords.
Decision: id, variationRevisionId, elementIds, requirementIds, assumptionIds, explanation, tradeoff, evidenceRefs, acceptanceStatus.
PromotionRecord: sourceRevisionId, destinationPageId, screenIdMapping, snapshotId, transactionId.
GenerationJob: id, sourceRevisionIds, action, targets, model/instruction versions, status, cancellation, validated result and application status.
View state: expanded/collapsed sets, active variation, comparison selection and viewport anchor; separate from document transactions.

Use explicit ownership for exploration screens so they cannot accidentally appear as ordinary Design frames, prototype roots or handoff selections. Snapshot immutable source revisions for lineage and promotion. Reuse asset references rather than duplicate large assets per generation. Cache previews by revision, theme and viewport; never let a stale preview represent a newer revision.

Keep revision-bound immutable rationale with editable designer notes. Mark reasoning needing review when referenced elements, relevant props, spec, or structure change. Use targeted invalidation for affected decisions; never silently regenerate accepted rationale. Removed elements show broken references gracefully.

Persist exploration metadata with the file using versioned schemas and backward-compatible defaults. Keep downloaded/reference assets in an appropriate asset store, not arbitrary large JSON blobs. Validate ownership and references on load. Define duplicate, move, deletion, restore and export semantics explicitly.

Extend the existing Cursor integration with a typed exploration contract wherever its supported interface permits. First verify its actual request/response and mutation paths, selected-context support, streaming, cancellation, authentication, and deployment requirements; do not infer these capabilities from chat working. Reuse its conversation and model execution path. Add an adapter only for capabilities the integration lacks, after identifying the gap. Generation receives minimum necessary context and returns schema-validated design operations plus teaching metadata. Never execute arbitrary generated JavaScript or HTML. Restrict generation to registered coded components, allowed props, valid nesting, supported prototype actions and known theme tokens.

Apply generated screens, variation sets, lineage relationships and metadata as one recoverable transaction. Repeated completion or retry must not duplicate results. Detect source revision changes while a job runs: offer a fresh alternative or reviewed reapplication rather than overwrite newer edits. Separate job lifecycle from persistence lifecycle. Keep API keys server-side and configure provider, request limits, cost controls and reference access before enabling real generation.

## Delivery sequence and acceptance gates

### 1. Foundation and interaction prototype
Audit storage/history/export paths and component schema. Implement typed Pages, versioned exploration/set records, revision identity and feature flag. Build the complete workflow with deterministic fixtures clearly labeled as sample output. Confirm real screens, contextual inline prompts and Cursor-powered chat share context; route Design and Variations Pages to their distinct workspaces. Gate: old files load unchanged; exploration metadata round-trips; no sample output presented as real AI.

### 2. Structured generation and application
Inspect the developer's Cursor integration, then extend it with the exploration contract, maintained instructions, result validation, supported cancellation/retry and atomic apply/undo. Avoid building a competing chat backend. Generate three hypotheses from one brief using real components. Gate: invalid/unsupported output is rejected safely; duplicate completion applies once; edit-during-generation does not lose work; failures leave no partial variations.

### 3. Variations workspace, organization and follow-up prompts
Build automatic set rows and hierarchical routing, focused variation editing, inline composer/context chips, count selection, branch breadcrumbs, collapse/park/reorder, ancestry highlighting and connector explanations. Implement Move to Design with snapshots and stable destination links. Gate: a three-child/three-grandchild exploration stays organized; source cards retain viewport position; synthesis has correct multiple parents; promotion/undo preserves frames and relationships; no manual tidying is required.

### 4. Decision teaching and grounded references
Add compact explanations, decision-to-element highlights, assumption challenges, precedent retrieval/status, counterexamples, and stale-rationale handling. Gate: every highlight resolves to the intended element/revision; unsupported claims are visibly qualified; no fabricated evidence enters accepted rationale.

### 5. Compare, synthesize and validate
Implement temporary comparison, semantic differences, guided walkthrough, task launch and multi-parent synthesis. Gate: comparison does not move saved frames and returns to the same Tree context; synthesis identifies conflicting requirements; returning from a task preserves editing context; scenarios stay distinct from research findings.

### 6. Decision record and handoff
Export explicitly selected promoted screens/code with accepted rationale, relevant precedents, alternatives considered, unresolved questions and revision identity. Include abandoned alternatives only when explicitly selected. Gate: rationale matches the handed-off revision; editorial canvas UI never leaks into product code or prototype.

### 7. Hardening and pilot
Test keyboard/screen reader operation, chrome themes, panel collision, zoom, long text, many variants, cross-page recovery and generation failures. Use a pilot with junior and senior designers to evaluate usefulness, speed and misleading explanations. Iterate before broad enablement; retain a feature flag and safe read-only handling for saved exploration records.

## Verification strategy

Unit tests: schemas, reference validation, deterministic diffs, hierarchical layout and acyclic lineage, stale-rationale detection and allowed component operations.
Integration tests: create/refine/branch/combine, atomic undo/redo, persistence/reload, typed-page duplication/deletion, promotion and destination moves/deletes, retries, cancellation and revision conflicts.
Browser tests: prompt targets, no-mutation questions, highlighted decisions, compare exit, panel avoidance, lasso context, collapsed sets, three-generation branching, stable viewport anchors, multi-parent synthesis, promotion links and prototype return.
LLM evaluation fixtures: ambiguous brief, contradictory constraints, weak precedent, inaccessible reference, injection in retrieved text, impossible three-way variation, unsupported component, and rationale inconsistent with generated UI. Human review assesses whether alternatives represent meaningful hypotheses and whether tradeoffs are accurate; schema validity alone is insufficient.
Performance: establish current editor baseline, then test virtualized/lazy preview rendering, revision-keyed caches and long explorations so generation/history/reference rendering does not block dragging or selection.

## Success measures and remaining decisions

Success means designers identify assumptions, articulate tradeoffs, adapt precedents appropriately, and change direction when evidence warrants it. Evaluate through observed pilot critique/tasks and voluntary feedback; do not turn these into employee scores. Track usability measures such as time to a meaningful comparison and unnecessary regeneration only with agreed telemetry practices.

Resolve during implementation: location and capabilities of the working Cursor integration, its deployment and usage budget, authorized reference sources, durable asset storage, precise history/checkpoint integration, file-sharing permissions, typed-page migration details and analytics consent. These choices do not block building and validating the fixture-driven interaction flow.

## Selection entry implementation

Expose Explore variations… in frame title menus, canvas frame context menus, selected component/group context menus and beside the inline element prompt. The setup dialog shows source name/scope, prompt, spec, count (default three), and Explain & teach. Capture the source layout and selected IDs before leaving Design, keep the full frame as context, and lock out-of-scope nodes for component/group requests. New Variations Page supports starting from a brief without an existing frame. Generation opens the new Page; follow-ups create child sets on that same Page. Implement against the injectable chat transport, with explicit unavailable state when only the placeholder exists, pending the other developer's integration location. Never present fixtures as generated work.

## Implementation status — 2026-09-19

Selection entry, setup, typed/persisted Variations Pages, immutable source
snapshots, nested follow-up sets, rationale display, question-only chat,
comparison, promotion to Design and the transport injection seam are built.
See ../variations-integration.md for the verified behavior and exact remaining
work. Live generation is awaiting the existing Cursor integration location.
The broader delivery sequence above remains the complete plan, not a claim
that every phase is finished.
