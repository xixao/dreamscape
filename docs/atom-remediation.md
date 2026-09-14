# Atom Duplication and Remediation Register

Status: source-reviewed plan, 2026-09-13. No runtime changes in this pass.
Scope: all 14 atom families in the Design Bible, across 14 workflow screens and two overlay families.

## Counting Contract

Count one group per unique primitive responsibility, not one per JSX occurrence, page,
label, callback, or CSS selector. Different business callbacks are normal inputs to one
button primitive. A drag gesture and a click command are not the same interaction.

- **D / duplicate:** matching rendering and behavior are separately implemented.
- **V / consolidation variant:** same primitive responsibility, but current appearance
  or behavior differs; converge through an explicit variant, not a blind replacement.
- **S / shared:** already one primitive or shared CSS recipe. Repeated use is not duplication.
- **E / exception:** specialized behavior or native semantics should remain explicit.
- **C / consistency:** token, labeling or accessibility concern without a duplicate implementation claim.

Baseline findings: **one exact duplicated-rendering group (D01, now resolved)** and
**four primitive consolidation families (V01-V04, still pending)**. These five
groups were not five visually identical buttons. D01 was a passive avatar; there
is no verified exact cross-source button match in this source pass. Button
candidates have geometry or semantic differences.

This is not a pixel-comparison or browser-accessibility certification. Visual equivalence
must be verified at the same theme, viewport, density and state before an implementation
is declared an exact visual duplicate. The earlier 34 count remains an occurrence count.

## Unique Remediation Groups

### D01: Comment Initial Avatar — resolved

- Sources: [ReviewComments](../app/review-comments.tsx#L124),
  [AnchoredComments](../app/anchored-comments.tsx#L81).
- Both previously rendered the same initial span.
- Same passive purpose, same initial calculation, same `.avatar` CSS. Two markup
  implementations; styling is already shared.
- Implemented remedy: [CommentAvatar](../components/comment-avatar.tsx) now accepts a
  display name and is used in both locations. The existing `.avatar` CSS remains
  the single style recipe; the richer image library was not added.
- Contracts: deterministic empty-name fallback, no duplicate accessible announcement
  when the full name is adjacent. Do not merge assistant identity or fictional product
  user identity merely because those also have a circular shape.
- Verify: both locations render the same initial/fallback and dimensions in both themes.

### V01: Single-Line Text Input

- Existing source: [Input](../components/ui/input.tsx).
- Previous direct implementations: Journey name and step name in
  [JourneyView](../app/journey-view.tsx); decision owner in
  [POReview](../app/po-review.tsx). All three now use Input inside LabeledField.
- Existing consumers include setup, share controls, UploadProperties and the dynamic
  `Field` variable in DocumentUploaderFields. The static direct-tag count undercounts that variable.
- Differences: Journey uses 14px text, 6px radius and its own focus outline;
  PO uses 16px text, 4px radius and 44px minimum height. Shared Input has its own
  utility-based dimensions/focus styling. These are not identical shapes today.
- Implemented: Input is used at all three sites, preserving value, limits, disabled/readOnly,
  callbacks and labels. Define shared standard/compact visual roles if both are needed;
  remove per-page border/radius/font/focus ownership after matching the approved role.
- Verify: typing, selection, limits, disabled and read-only states; correct form data;
  no draft reset; equivalent keyboard focus and theme contrast across consumers.

### V02: Multiline Text Input

- Existing source: [Textarea](../components/ui/textarea.tsx).
- Previous direct implementations: three Journey fields and two PO decision
  fields. All five now use Textarea inside LabeledField.
- Differences: Journey has 76px minimum height; PO has 96px; both resize vertically.
  Shared Textarea uses content sizing and a different minimum-height baseline.
- Implemented: same Textarea primitive; preserve field size/resizing intent through
  approved standard/long-form roles. Keep assistant text entry a behavior variant owned
  by GuidedPrompt, not a global Enter override on every textarea.
- Verify: multiline Enter, Shift+Enter where relevant, long text, resizing without hiding
  actions, value retention on failed saves, max lengths, labels and disabled state.

### V03: Native Option Selector

- Existing reusable source available: [NativeSelect](../components/ui/native-select.tsx).
- Previous direct implementations: Journey prototype connection and recorded session;
  PO decision status; Results version and participant-group filters. All five now use
  NativeSelect inside LabeledField.
- Related, not identical: [Select](../components/ui/select.tsx) is the popup compound
  control already used in review, setup and comments.
- Differences: native browser popup versus custom popup, sizing, label association and
  event signatures (`onChange` vs `onValueChange`). Do not collapse their APIs blindly.
- Implemented: NativeSelect is used at these five sites; popup Select remains
  a separately named supported variant for its current use cases. Share visual tokens
  and naming conventions, not incompatible selection mechanics. NativeSelect adds a
  wrapper, so verify grid width and CSS selectors in each view.
- Verify: option order, selected value, keyboard selection, disabled state, labels,
  filter effects and persistence. No empty option should silently change stored values.

### V04: Icon-Only Click Button

- Existing sources: [Button](../components/ui/button.tsx) as atom;
  [IconButton](../components/icon-button.tsx) is the established accessible convenience composition.
- Other implementations: Journey Move earlier/Move later at lines 311/319 and anchored
  comment Open thread at line 87. Three direct sites.
- Shared Button icon variants also exist elsewhere. These are already shared atom
  uses, not independent button implementations simply because they omit IconButton.
- Differences: Journey owns 36px geometry, 4px radius, hover and disabled opacity;
  IconButton inherits shared sizing/focus/tooltip. Anchored reply has its own placement.
- Implemented: these controls use Button's `bare`/`auto` presentation with
  accessible labels and unchanged callbacks/disabled boundaries. IconButton
  remains the tooltip-bearing toolbar composition; both share the Button
  primitive. Check hit area and focus in context.
- Verify: tooltips on focus/hover, screen-reader names, boundary disabling, click once
  means one action, no position shift, no accidental form submission. Reordering keeps
  a predictable focus target. Drag handle excluded below.

## All Atom Families: Disposition

| Bible ID / family | Classification | Remedy or preservation rule |
| --- | --- | --- |
| A01 Button | V04 + S + E | All audited product buttons now use Button; `bare`/`auto` is the approved presentation for specialized rows/pins/grips. Verify every role and preserve test telemetry. |
| A02 Input | V01 | Implemented in Journey/PO; verify across themes and add help/error roles. |
| A03 Textarea | V02 | Implemented in Journey/PO with deliberate height/resizing policies. |
| A04 Selection | V03 + S | NativeSelect implemented in first slice; popup Select remains a separate semantic variant. |
| A05 Checkbox | S + C | Shared Checkbox already used. Keep consent explicit. Component fields use Checkbox in design and Switch in review for the same config flags; decide that semantic consistency separately, not as duplicate source. |
| A06 Switch | S | Shared Switch already used. Keep immediate preference persistence distinct from draft config updates. |
| A07 Label/help/error | S + C | Native label is valid shared HTML, not 30 duplicate atoms. Standardize label styling and ID associations. Setup SelectTrigger has aria-label, so it is not unnamed; link visible labels too. Field coordination belongs to the later molecule pass. |
| A08 Icon | S + E + C | Lucide is the source. Establish size/stroke roles and decorative aria-hidden rules. Connector SVG is a diagram, not a duplicated icon. User-requested flame emoji is deliberate. |
| A09 Link | S + E | Native anchors preserve URL behavior. Do not replace links with buttons for appearance; do not count inline anchors as separate implementations. |
| A10 Text/heading | S + C | Native semantics plus one stylesheet; tokenize repeated type roles and remove conflicting page overrides. Do not add a Text wrapper solely for taxonomy. |
| A11 Status marker | S + C | `.badge` already shares one CSS recipe. Repeated span markup is not enough reason to count a duplicated component. Optional thin Badge adoption later must preserve its current shape; library Badge is rounded-full and not a drop-in match. Outcomes, save states and step numbers retain separate domains. |
| A12 Identity/avatar | D01 resolved + E | Identical comment initials now use CommentAvatar. Keep assistant and demo product identity variants explicit. |
| A13 Separator/progress | S + E | CSS borders are not duplicate component implementations. Demo application progress, journey numbering and loading progress have different meanings. Preserve the shared Journey/state-number CSS rule. |
| A14 Loading indicator | S + C | Shared button disabled states, local loading text and one assistant spinner are not exact duplicate spinner implementations. Define shared pending text/spinner/focus policy; no need for a new component until repeated behavior warrants it. |

## Every Direct Button Accounted For

21 source sites total. No double-counting mapped rows as runtime instances.

| Sites / location | Count | Classification and remedy |
| --- | ---: | --- |
| Journey earlier/later; anchored comment reply | 3 | V04. Use shared icon-click primitive. |
| Journey drag grip | 1 | E. Pointer capture, touch-action and drag cursor; can reuse Button base only if gesture behavior is retained. Not the same action as an arrow click. |
| StateSelector strip branch | 1 | E/variant at molecule level. Already one StateSelector source used by consumers. Optionally use shared Button base with a supported strip treatment; preserve aria-pressed and numbered styling. Not a second StateSelector implementation. |
| DocumentUploader component/error annotation pins | 2 | E/variant. Same renderer and `.anchor-pin` style; position differs via error-pin. Potential future AnchorPin composition, not two cross-source button atoms. |
| Design layer rows | 5 | E/selection composition. Same local CSS recipe, different selection/focus targets. Future layer-item molecule; do not flatten to a default command button. |
| Design feedback preview row | 1 | E. Opens review for a comment's anchor/state; not same task as selecting a layer. |
| Journey step selection | 1 | E. Rich selectable item with aria-pressed; not an icon click or nav link. |
| Results session selection | 1 | E. Selects evidence; later selectable-item composition candidate, not identical to a journey step. |
| History version row; case-study iteration row | 2 | V deferred to molecule pass. Shared version-selection intent but different geometry/content. Preserve dirty/busy guard; use shared version-selection composition later if warranted. |
| PO section navigation | 1 | E. Navigation with aria-current, not a prototype state selector. |
| ReviewBrief evidence links | 2 | E/shared local recipe. Same layout expressed twice with results vs feedback destinations; later evidence-entry molecule, not a new atomic button category. |
| Comment context action | 1 | E. Anchor/state/viewport jump; contextual text action rather than an ordinary command. |

## Foundation and Behavior Cleanup, Not Duplicate Counts

- Field dimensions and focus rules differ in `.po-decision-form`, `.journey-view`
  and the shared controls. Resolve roles before swapping tags; otherwise reuse can
  regress appearance while technically improving imports.
- Global `.studio`/`.tester-shell` button overrides do not cover every PO/design control.
  Centralize intended size roles at the control level after checking all consumers.
- A shared CSS recipe is a legitimate source. Do not create a wrapper for every badge,
  label, separator or heading just to reduce raw HTML counts.
- Every non-submit command needs an explicit type=button at its owning boundary.
  Preserve real submit buttons and prevent accidental changes to Enter behavior.
- Instrumented DocumentUploader controls already use Button. They intentionally permit
  capture of unavailable attempts via aria-disabled while blocking the action handler.
  Do not replace this with disabled and lose test evidence.
- Focus treatment, label association and minimum touch targets need verification after
  consolidation, including disabled, pressed, invalid, read-only and busy states.

## Implementation Order After Plan Approval

1. Establish shared field/button visual roles against current light/dark views; document
   baseline dimensions before changing anything.
2. Migrate V01 and V02; preserve current forms and handlers. Test all existing consumers,
   including dynamic Field rendering and participant feedback, not only changed pages.
3. Migrate V03 using native-select variant. Verify wrapper sizing, keyboard behavior and filters.
4. Migrate V04; preserve ordering and reply callbacks. Do not touch drag behavior in this batch.
5. D01 is implemented; verify its two render locations and fallback during visual review.
6. Consolidate associated CSS overrides and complete C-items without inventing unnecessary wrappers.
7. Regenerate source audit, record remaining exceptions, run structure and targeted browser tests.
8. Then discuss molecules. Templates remain out of scope until that discussion.

## Definition of Done

- Every migration group has one documented primitive source and explicit variants.
- Native labels, links, disclosures and SVG geometry remain valid semantic HTML;
  zero native HTML is not a goal.
- All affected consumers pass keyboard, focus, long-content, light/dark and responsive checks.
- Clicking, typing, selection, draft saving and test-event behavior are unchanged unless separately approved.
- No change to shared-link permissions, stable IDs, stored states, demo replacement boundaries or APIs.
- The register changes from planned to implemented/verified with actual test evidence, not just import counts.

## Evidence and Limits

[Full source audit](atomic-source-audit.md) contains every native-control location.
[Design Bible](design-bible.md) defines the IDs above. This register refines the earlier
occurrence count into unique responsibilities and reviewed exclusions. Source inspection
covered the registered families; computed layout, hover/focus pixels and assistive-tech
behavior have not been compared in a browser during this planning pass.
