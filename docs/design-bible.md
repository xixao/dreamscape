# Flow Review Design Bible

Baseline: 2026-09-13. Scope: the 14 workflow screens and two overlay families in this repository.
Status: component documentation standard adopted; individual component and
template conformance remains under review. No blanket UI approval is implied.

## Start Here

- [Component inventory](component-inventory.md): count and consumers for every used product/UI JSX type.
- [Component health review](component-health.md): reuse verdicts, confirmed duplicates, boundaries and next work.
- [Navigation and control budget](style-guide/navigation.md): one owner per control, persistent choices prioritized by task, secondary choices disclosed without hiding safety.
- [Component standard and conformance](style-guide/component-standards.md): approved family/variant decision rule, 19-family catalog, CSS ownership and review gate for anything new.
- [Content and behavior rules](style-guide/content-and-behavior.md): naming, tooltips, form errors, Fuego and evidence language.
- [Change and handoff rules](style-guide/governance.md): token/code authority, variants, cross-consumer verification and future Figma/MCP mapping.
- [CSS and layout baseline](style-guide/layout-and-patterns.md): shared spacing, theme, focus, scroll, action and evidence rules for every page.
- [Screen audit queue](page-audit.md): 14 screens and two overlays, with cross-consumer checks.
- [Atom-only style guide](style-guide/README.md): current review entry point; canonical primitives, variants, states and decisions. Molecules/templates below remain planning context.
- [Atom duplication and remedy register](atom-remediation.md): unique groups, variants, exclusions and implementation order. Use this instead of treating native occurrence counts as unique duplicates.
- [Generated source audit](atomic-source-audit.md): imports, usage locations, native controls and CSS candidates.
- [Machine-readable evidence](atomic-source-audit.json): full site, token and dependency records.
- [Component ownership](../COMPONENTS.md): existing implementation and demo boundaries.
- [Pre-build practice](pre-build-design-practice.md): required discovery-to-handoff process.

Classification is by responsibility, not file size. The approved reusable-library
count is **18 foundation sources plus 3 domain families**, not a count of JSX subparts.
Existing files often contain multiple
levels. Atomic Design is our documentation vocabulary, not a requirement to create a
folder or wrapper for every row. Native HTML remains a valid source of semantics.

## 1. Foundations Before Atoms

### Shared workspace orientation

Design, review, and product-owner views use `WorkspaceHeader`: one object title,
one short line naming the current context and saved/draft version, an optional
back action, and only the actions relevant to that view. The destination row
below owns page navigation; page content owns its specific task title and status.
Journey, Test results, Case study, and Code compose that second level through
`WorkspacePageHeading`, with one h2, optional short status, and local actions.
Do not repeat the object, version, and view name as a large second heading or a
global status sentence. Put details such as evidence and check counts in the
relevant page, where they can be understood and acted on. On narrow screens the
header actions may wrap while the object and current context remain first.

| Foundation | Observed source | Contract / next work |
| --- | --- | --- |
| Theme and color | `app/globals.css`, `app/providers.tsx` | Shared light/dark semantic tokens already exist. Consolidate literal overrides before promising universal token propagation. |
| Typography | Arial/Helvetica stack in globals; page-specific size rules | Define named text roles and a scale. One page title, inline title icon; heading levels follow structure, not visual size. |
| Spacing and dimensions | Per-selector values in globals | Define density/spacing/toolbar/input roles. 72px belongs to the assistant input region, not every footer. |
| Radius, borders, focus | CSS tokens plus UI-library classes | Preserve visible focus and semantic contrast. Avoid page overrides of atom internals. |
| Icons | `lucide-react` | Same icon vocabulary; decorative icons hidden from assistive tech, action icons named by the control. Do not wrap every icon without a need. |
| Motion and geometry | `PreviewCanvas`, anchored-comment positions | Pan/zoom/anchor coordinates are runtime data. They must not become hard-coded theme tokens. |

Observed source audit: 116 literal-color declarations outside custom properties and 30
repeated selector/context groups. These are review candidates, not 146 confirmed defects.
One stylesheet does not mean one rule per design decision. Vendor/Tailwind imports and
generated downloadable CSS are distinct from the application stylesheet entry point.

## 2. Atoms: Source and Adoption Audit

Existing sources below are authoritative candidates to reuse, not blanket approval of
every current size or behavior. Every native occurrence is linked in the generated audit.

| ID / atom | Existing canonical source | Actual adoption and gap | Required shared behavior |
| --- | --- | --- | --- |
| A01 Button | `components/ui/button.tsx` | All product button sites now use this source. `bare`/`auto` preserves specialized row, pin, grip and navigation presentations; submit is explicit. | Focus, accessible name, action type, pressed state, pending protection and target size. |
| A02 Text input | `components/ui/input.tsx` | Journey and PO now use this atom; no direct product inputs remain in the source audit. | Value/onChange, label association, read-only vs disabled, length limits and error association. |
| A03 Text area | `components/ui/textarea.tsx` | Journey and PO now use this atom; no direct product textareas remain in the source audit. | Same field semantics; multiline Enter is not globally overridden by assistant submission behavior. |
| A04 Option selection | `components/ui/select.tsx`, `components/ui/native-select.tsx` | Journey/PO/Results use the native variant; no direct product selects remain in the source audit. | Controlled selection, label, keyboard behavior. Native vs popup is chosen by task. |
| A05 Checkbox | `components/ui/checkbox.tsx` | Shared in participant consent and component fields; no direct input type=checkbox in this audit. | Checked/unchecked semantics and label target. Consent stays false until explicitly selected. |
| A06 Switch | `components/ui/switch.tsx` | Shared in component fields and notifications. | Binary setting with an explicit persistence policy; a switch is not a consent checkbox. |
| A07 Label/help/error text | Native label; available `ui/label.tsx`, `ui/field.tsx` | 30 native labels; no shared field composition adopted. Some Select labels are separate text. | Visible label bound to the control/group, stable help/error IDs. Separate label text is not proof of accessible association. |
| A08 Icon | `lucide-react` | Direct shared-library imports. One authored SVG in AnchoredComments draws a connector, not a replacement icon. | Consistent semantic size/weight roles and decorative vs informative treatment. |
| A09 Link | Native anchor, framework/navigation callbacks as appropriate | 3 native anchor sites; several navigation-like buttons need semantic review. | Links navigate to locations; buttons perform commands. Preserve new-tab and keyboard behavior when a real URL exists. |
| A10 Text/heading | Semantic h1-h4/p/span plus CSS | Shared stylesheet, but page-specific typography. No canonical Text component required yet. | One dominant title; correct hierarchy; wrapping; readable light/dark tokens. |
| A11 Status marker | Local `.badge` and outcome labels; `components/number-marker.tsx` owns all numbered circles | Numbered circles share one source with state, journey, version, anchor, and progress variants. Product status labels remain local. | Label + icon/shape + color. Explicit domains: save, prototype, session, review decision. Same color does not equate domains. |
| A12 Avatar/identity | Shared `components/comment-avatar.tsx`; unused `ui/avatar.tsx` available | Comment cards use its comment-icon variant; initials remain available. Demo/assistant identities remain distinct. | Readable name beside the decorative icon; deterministic initials fallback; assistant identity distinct from a person. |
| A13 Separator/progress | Native layout borders and demo progress; library primitives available | Mostly local markup. | Decorative separators stay noninteractive; true progress exposes its semantics. Journey order is not numeric completion progress. |
| A14 Loading indicator | Busy text/disabled state; unused spinner/skeleton available | No unified pending presentation. | Loading vs empty vs unavailable remain distinct; do not shift action locations or announce endlessly. |

Compound library controls such as Select, Dialog and Tabs contain their own primitives;
they are grouped here by their atomic consumer role, not described as indivisible HTML.

### Verdict

Button, Input, Textarea and Select now have one canonical source family each;
there are no direct product button/input/textarea/select sites in the static
audit. This is source adoption, not blanket visual or accessibility approval.
The remaining audited native sites are labels, disclosures, SVG and links. Of 61 UI
library modules, 12 are statically reachable from app source; installed does not mean used.
Do not delete unused starter modules solely because they appear in this inventory.

### Reviewed Exceptions and Candidate Groups

| Group | Sources | Disposition before refactor |
| --- | --- | --- |
| Selected rows/navigation | DesignWorkspace, JourneyView, ReviewResults, POReview, case-study/history | Extract the correct selection/navigation molecule. Do not make every row a padded default Button. |
| Strip buttons | `components/state-selector.tsx` | Strip and compact now use Button; verify selected/numbered geometry and pressed semantics. |
| Journey fields and PO decision fields | JourneyView, POReview | Shared LabeledField recipe now implemented; preserve validation, dirty state, permissions and different submission endpoints. Help/error variants remain. |
| Native filters | ReviewResults, JourneyView, POReview | Shared NativeSelect variant now implemented; verify label, keyboard, size and focus in each consumer. |
| Anchor pins | DocumentUploader, AnchoredComments | Dedicated numbered-pin molecule may be appropriate; keep stable anchors and accessible names. |
| Instrumented unavailable actions | DocumentUploader uses shared Button already | Preserve intentional aria-disabled click capture when observeDisabled is enabled; handlers must reject unavailable actions. Native disabled would suppress evidence. |
| Connector SVG and dynamic styles | AnchoredComments, PreviewCanvas, comparison framing | Legitimate geometry candidate, not an icon/token duplication finding. |
| Native details/summary | Participant instructions, PO note, results, session signals | Preserve disclosure semantics. Share a recipe only if behavior/styling merits it; no replacement merely for categorization. |

## 3. Molecules: What Works Together

Observed means an existing reusable implementation; embedded means currently assembled
inside views; proposed means a named contract to discuss, not a newly implemented component.

| ID / molecule | Atom recipe and action order | Consumers / source | Behavior, variants and status |
| --- | --- | --- | --- |
| M01 IconButton | A01 + A08 + Tooltip | `components/icon-button.tsx`; designer/review | Observed. Name and tooltip, default non-submit, active/disabled. Counted reactions need not use an icon-only variant. |
| M02 LabeledField | A07 + A02/A03/A04 | `components/labeled-field.tsx`; Journey, Results, PO Decisions | Implemented for visible label and control. Help/error association and adoption in remaining forms are pending. |
| M03 ToggleField | A05/A06 + A07 + optional help | Consent, properties, notifications | Embedded. Consent vs immediate setting vs save-on-submit are explicit variants, not interchangeable behavior. |
| M04 StateSelector | Group label + repeated A01 + state marker | `components/state-selector.tsx`; review/brief/designer | Observed. One controlled value, aria-pressed; compact/strip/numbered. Must not mutate saved revisions or create participant events just by inspecting. |
| M05 NavigationItem/Group | Link or A01 + icon + active marker/count | Workspace navigation, PO navigation | Embedded/proposed. Same-destination identity and active semantics; route links versus in-place section navigation remain explicit. |
| M06 LocalTabs | Tabs list/triggers + selected panel | Inspector, React/CSS; Journey modes are separate button group today | Observed partly via `ui/tabs.tsx`. Use tabs only for alternate panels, not arbitrary filters. Preserve keyboard semantics. |
| M07 ActionGroup | Secondary/cancel + primary command; optional destructive action separated | Save/discard, apply proposal, setup, decision form | Embedded/proposed. Stable order and busy state. Enter submits only owning form; prevent duplicate requests; keep draft on failure. |
| M08 StepNavigation | Previous + progress label + Next | PO sections; potential Journey selection | Embedded in PO. Bounds and focus on section change; no participant Next that bypasses task success. |
| M09 PromptSuggestions | Repeated outline A01 + icon + supplied prompt text | GuidedPrompt in review/setup | Observed inside GuidedPrompt. Fills text, does not silently send. Presets supplied by scenario adapter. |
| M10 PromptComposer | M09 + A03 + accept completion + send action | GuidedPrompt + parent forms; mock designer currently separate | Partly shared. Tab/right accepts eligible completion; Escape dismisses; Enter submits, Shift+Enter newline; IME safe. Pending states coordinated by parent; input region 72px. |
| M11 HeadingContext | Heading + inline icon + scoped metadata/status | All page/panel headings | Embedded; shared `.icon-title` only. One semantic heading; version saved status must not imply journey draft saved. |
| M12 ReactionGroup | Like + dislike + flame + counts | `app/comment-reactions.tsx`; threads/replies/pins | Observed. Persist before success toast; toggle selected reaction, pending guard. Existing comment flame says Magic; do not silently replace with participant Fuego. |
| M13 RatingFeedback | Five stars + adjacent flame + comment + submit state | ParticipantTest | Embedded. Rating and flame are different fields from comment reactions. Existing Fuego confirmation is red/centered; announce save/error. |
| M14 CommentIdentity | Comment icon at left; name/status at right; scope/version context | ReviewComments, AnchoredComments, CommentPin, PO discussion | Embedded. Text follows the name and feedback follows the text. No anonymous count presented as a real identity; viewport/state/version labels come from saved context. |
| M15 CommentComposer | Label + textarea + submit/cancel/reply action | ReviewComments and replies | Embedded/shared within thread view. Empty/pending handling; preserve failed drafts; no AI autocomplete unless explicitly part of that mode. |
| M16 AnchorPin | Number marker + named action + anchored comment preview | `components/comment-pin.tsx` in the demo renderer; AnchoredComments shows the expanded overlay variant | Implemented. Hover and focus reveal comments on the current saved version/state/viewport; clicking pins the preview open. Escape, outside click, or Close dismisses it. The full thread and Add comment remain reachable. Same target ID after zoom; placement belongs to canvas coordinate adapter. |
| M17 Metric | Value + label + denominator/scope + optional status icon | ResultsSummary, PO findings/update | Embedded. Use shared calculations; not-loaded is not zero; rated denominator excludes unrated sessions. |
| M18 Finding | Title + observation + count + evidence action; optional quote | ResultsSummary, PO findings, brief | Partly shared. See evidence filters to matching sessions; full quote reachable; observation is not an inferred cause. |
| M19 SessionRow | Session identity + outcome + duration + short finding | ReviewResults, recorded journey | Embedded. Stable selection, no list reordering on selection; preserve scope and expose selected state. |
| M20 Disclosure | Summary trigger + indicator + details body | 5 native details sites | Native composition. Keyboard open/close; no hidden essential task goal; preserve local open state where useful. |
| M21 VersionReference | Version ID/number + saved date/note + navigation action | Header, history, code, case study, comments | Embedded. Labels and evidence always reference the same saved revision; draft comparisons explicitly labeled. |
| M22 FileActions | Selected file identity + Copy + Download | DeveloperCode, handoff/report exports | Embedded. Correct source/version and MIME/filename; accessible success/error; cannot share generated demo code as exact production source. |
| M23 ShareLink | Scope/version/audience + URL + Copy/Open/Try | Share setup dialog | Embedded. Link only ready after successful creation; try mode/real test must not be confused; shared access limited server-side. |
| M24 StatusMessage | Icon + title/body + optional retry/dismiss | Errors, empty states, toasts, save notifications | Embedded/shared provider only. Error, informational, success, no-data and no-access are different variants. No false success on request failure. |
| M25 CanvasToolbar | Pan/select + zoom controls + fit/reset + viewport/state controls | PreviewCanvas + parent review/designer toolbars | Partly shared. Pinch zoom affects canvas, not browser; bounded scale; reset deterministic; visible control alternative to gestures. |
| M26 FilterGroup | Labeled selectors + scope indicator/reset where needed | Results, comments, recorded journey | Embedded. Filtering not navigation; recompute summary and detail from same scope; handle selected item falling out of scope. |
| M27 FileStatus | File icon/name/size + status + retry | DocumentUploader | Demo-owned. Retry may change state only through configured scenario; shared renderer across audiences. |
| M28 CheckRow | Status + criterion + explanation | Review checks/manual checks, handoff readiness | Shared `components/check-row.tsx` with passed, needs-work, manual and unavailable variants. Local config checks are not a verified accessibility audit; human review and disconnected integration remain distinct states. |

## 4. Organisms: Coherent Responsibilities

| ID / organism | Molecules composed | Existing owner / boundary |
| --- | --- | --- |
| O01 Workspace chrome | M05, M11, M21, context/role controls | FlowReview, DesignWorkspace, POReview separately; shared shell proposed, permissions not inferred from role label |
| O02 Preview workspace | M04, M16, M25 + rendered child | PreviewCanvas + parent controls; geometry generic, renderer supplied |
| O03 Design properties | M02, M03, M07, M24 | DocumentUploaderFields reused by DesignWorkspace/UploadProperties; parent owns draft and persistence |
| O04 Assistant panel | M10, M07, M24 + message/proposal stream | FlowReview; scripted adapter in lib/demo; mock-designer assistant separate |
| O05 Discussion | M14, M15, M12, M26 | ReviewComments; reused PO/shared review. AnchoredComments positions related threads, not a second backend |
| O06 Journey workspace | Connected JourneyCanvas nodes, M02, M07, M20, M21 | JourneyView owns draft order, node positions, save/reload and layout mode. Edges always follow step order. Dragging switches to manual positioning; Auto sync clears positions and reflows nodes. Observed path is read-only evidence, not editable planned intent. |
| O07 Evidence workspace | M17, M18, M19, M20, M26, M22 | ReviewResults + ResultsSummary + SessionSignals/EvidenceTrail; shared sessionFacts calculations |
| O08 Product briefing | M11, M17/M18, M21, M08 | POReview; case study narrative overlaps structurally but remains scenario-specific |
| O09 Decision form | M02, M03 where appropriate, M07, M21, M24 | POReview; persisted decision separate from changing a design revision |
| O10 Developer handoff | M06, M21, M22, M28 | DeveloperCode; generated simplified React/CSS adapter in lib/demo |
| O11 Test setup/share | M02, M03, M10, M07, M23 | TestSetupEditor + FlowReview dialog; configuration distinct from active session |
| O12 Participant runner | Instructions/consent + M27 renderer + M13 + M24 | ParticipantTest owns ordered telemetry, real completion/abandonment, failure recovery and feedback |
| O13 Notification preferences | M03, M11, M24 | FlowReview dialog; preserve current save policy until deliberately changed |
| O14 Demo product | Product identity/progress + M27 + Continue | DocumentUploader; same runtime everywhere, stable demo IDs; cannot be replaced by generic canvas UI |

Server/session ownership is not an Atomic Design level. Keep lib/server, model validation,
API authorization, version scoping and event ordering separate from reusable UI contracts.
Copying an organism into PO/shared view must never broaden data access.

## 5. Every Screen and Overlay Accounted For

These are workflow screens, not 14 routes. `/` and `/s/[token]` are the two frontend
route patterns. Inspector/file/device/appearance subviews are variants, not new pages.

| Screen | Observed source | Organisms / important molecules |
| --- | --- | --- |
| S01 Mock design workspace | app/design-workspace.tsx | O01/O02/O03/O14; mock assistant; M01/M04/M25 |
| S02 Design review | app/flow-review.tsx review branch | O01/O02/O04/O05/O14; ReviewBrief, checks/history/evidence panes |
| S03 Journey | app/journey-view.tsx and app/journey-canvas.tsx | O01/O06; connected node map, manual/auto layout, editing, save, recorded path |
| S04 Edit component | app/demo/upload-properties.tsx | O01/O03; same fields as S01, different save responsibility |
| S05 Test results | app/review-results.tsx | O01/O07; summary to session details |
| S06 Case study | app/demo/upload-case-study.tsx | O01 + scenario narrative; M21/M22; O08 structural candidate |
| S07 Code | app/developer-code.tsx | O01/O10 |
| S08 PO Overview | app/po-review.tsx | Full-width 30/70 desktop split: title, purpose, guidance, test/comment/check counts, update and decision on the left; only preview controls and the same interactive saved component/page on the right. The mock content fills the preview rather than retaining the standard 590px page-content cap, and can expand. Stack at narrow widths. |
| S09 PO Proposals | app/po-review.tsx | Saved configuration comparison and designer note; O14 preview opens on demand, not as the page canvas |
| S10 PO Tests | app/po-review.tsx | M17/M18 summary and top findings; all observations and quotes behind disclosure; unavailable data is not zero |
| S11 PO Implementation and Decision | app/po-review.tsx | Prototype checks and handoff limits; O09 decision with rationale and follow-up; optional O05 discussion |
| S12 Participant Welcome | app/participant-test.tsx | O12; instructions, consent, Begin |
| S13 Participant Active | app/participant-test.tsx | O12/O14; persistent task, Abandon; no workspace nav |
| S14 Participant Finish | app/participant-test.tsx | O12/M13/M24; complete and abandoned remain different outcome states |
| X01 Setup/share | app/flow-review.tsx + test-setup-editor.tsx | O11; participant and PO sharing variants |
| X02 Notifications | app/flow-review.tsx | O13; shared dialog primitive, different persistence policy |

Engineer reuses S02/S05/S06/S07 under different permissions/navigation. SharedReview
reuses POReview/ParticipantTest; it is a token-loading/router boundary, not a duplicate UI.

POReview has five local sections (Overview, Tests, Proposals, Implementation,
Decision) within the four PO audit families above. They share one bounded shell,
compact title scale, fixed header/section navigation, and independently scrolling
content. Share, print, present, and comments are review-level actions. Present
uses a focused five-section chapter view with explicit previous/next controls;
the normal review retains compact navigation and typography. A decision
is scoped to a saved version and is not a production-release approval. It is
persisted as an append-only `review_decisions` record with choice, rationale,
follow-up, authenticated actor and timestamp; ordinary comments cannot create
decisions. Shared PO links include version-scoped participant results. Earlier
comment-based decisions are unverified and must be recorded again. Production
authorization still needs organization membership and explicit PO assignment;
the prototype enforces a PO-scoped link and signed-in actor only.

In-progress participant test IDs are retained locally per share link. Reload
resumes the same server session and derives the visible component state from
its events. The local pointer is cleared after feedback or explicit finish so
the next tester on a shared browser sees the welcome screen. The server remains
the source of truth for event order and completion; clearing browser storage
mid-test can still leave a started session without an outcome.

Right-side inspector and discussion surfaces now use the shared `RightPanel`
shell. Its review, properties, design and discussion variants keep separate
content/permission behavior while sharing frame and heading rules. See the
[right-panel contract](style-guide/right-panels.md) before adding another panel.

## 6. Template Discussion: Intentionally Not Finalized

Candidates remain Canvas, Journey, Evidence, Handoff, Briefing, Guided Task and an Overlay
frame. Do not implement placement decisions until atoms/molecules and their exceptions
are agreed. Reuse does not require a single giant Page component with dozens of flags.

Decisions for the next conversation:

1. Which context and navigation are global, and which belong to the local task?
2. Which action group owns each primary command? Which views need no footer at all?
3. Which slots are stable versus scrollable? Keep Previous/Next outside variable content;
   allow responsive reflow at small heights, mobile keyboards and browser zoom.
4. Does the inspector remain mounted across navigation, and which values should persist?
5. How should PO summary differ from designer evidence while sharing calculations?
6. Which molecule variants need separate semantics (tabs/filters, consent/settings, ratings/reactions)?
7. Which native-control exceptions should be approved, consolidated or removed?

## 7. Consolidation Backlog and Acceptance

| Priority | Work after agreement | Acceptance |
| --- | --- | --- |
| P1 | Verify bare/auto Button presentations across all specialized sites | Each migrated site retains name, focus, keyboard, value, events and permission behavior |
| P1 | Extend LabeledField with help/error vocabulary beyond the first slice | Same label/error rules across Journey, PO, setup and properties; no lost drafts or false saved status |
| P1 | Shared action/step-navigation contracts | Stable placement and order; bounded Previous/Next; no participant completion bypass |
| P1 | Share evidence calculations/presentation where meaningful | Designer/PO report identical facts for identical permitted scope; no-access is not zero |
| P2 | Consolidate text/spacing/status roles and CSS candidates | Light/dark, long text, 200% zoom and mobile inspected; token edit verified across consumers |
| P2 | Unify prompt/notification/identity molecules | Presets never auto-submit; focus/completion tested; comment Magic and participant Fuego intentionally specified |
| P2 | Compose approved templates | Layout tests confirm stable action positions, appropriate scrolling and no obscured content |

Global acceptance: no broken stable IDs, no duplicated test events, no broadened share
permissions, no raw accessibility compliance claims from demo config checks. Verify
loading, empty, error, success, disabled, selected, dirty and no-access states as applicable.
Use existing tests/structure.mjs and tests/api.mjs plus targeted keyboard/browser checks.

## 8. Handoff and Change Protocol

- Canonical names already in use stay intact: DocumentUploader, PreviewCanvas,
  GuidedPrompt, StateSelector, ReviewComments, CommentReactions, ResultsSummary.
- Proposed molecule names are contracts, not files that already exist.
- Keep demo replacements under app/demo and lib/demo; preserve DEMO_IDS, anchors,
  stored state values and telemetry actions unless a migration is explicitly designed.
- Future Design System MCP/real editor integration should map external identities to
  these contracts. This document does not claim an MCP connection currently exists.
- Before a component change, list all consumers from the generated audit; after it,
  regenerate evidence and verify affected variants. Update status from proposed to
  implemented only when code exists, and verified only with recorded test evidence.
- The generated audit is a deterministic source snapshot. `--check` detects drift;
  it does not enforce that every occurrence has been consolidated.

## Baseline Decision Record

- Adopted: inventory atoms, molecules and organisms before deciding templates.
- Adopted: document handoff alongside design, preserve a single application stylesheet.
- Observed: existing reuse is partial, with the gaps above; no blanket clean bill of health.
- Pending: actual atom migrations, molecule extractions, template layout/scroll decisions.
- Out of scope for this pass: live app changes, deployment, external-tool benchmark and visual certification.
