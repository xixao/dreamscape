# Component Standard and Conformance

Status: **adopted documentation and review standard**. Individual components are
not automatically approved or visually verified. Carbon's component documentation
structure is the external reference: usage, style and accessibility are reviewed
together. Flow Review retains its own tokens, source code and product semantics.

Reference: [Carbon component overview](https://carbondesignsystem.com/components/overview/components/)
and [Carbon component contribution guidance](https://v10.carbondesignsystem.com/contributing/component/).

## What Counts as One Component

- A component family solves one user-interface problem and has one canonical source
  or one small set of named, cooperating parts. Exported subparts are anatomy, not
  separate library entries. `Tabs`, `TabsList`, `TabsTrigger` and `TabsContent`
  constitute one Tabs family.
- A variant changes size, emphasis, presentation or a documented semantic mode
  while retaining the family's core contract. Role or page name alone is not a
  valid variant axis. A genuinely different data owner, permission or telemetry
  contract can justify a separate composition.
- An atom is the smallest shared control or visual token. A molecule combines
  atoms into a repeatable task. A domain family combines molecules and data
  behavior. A feature/screen composition is not automatically a library component.
- Prefer the existing canonical source. Do not create a second Button, input,
  avatar, tab or comment-reaction implementation for a new screen.

## Required Record for Every Family

| Field | Required decision/evidence |
| --- | --- |
| Purpose and non-use | User problem solved and the nearest family it must not replace |
| Anatomy | Required parts and which are optional or repeated |
| Variants | Named axes, defaults and reasons; responsive layout is usually one variant reflowing |
| States | Default, hover, focus-visible, selected/pressed, disabled, pending, error and empty as relevant |
| Tokens and CSS | Semantic color pairs, type role, spacing, radius, icon size and CSS owner |
| Behavior | Controlled value, action order, keyboard/touch, focus, scroll and announcements |
| Data boundary | Persistence, permissions, telemetry and demo/production status |
| Consumers and checks | All source consumers and light/dark, narrow, zoom, keyboard and failure-state evidence |

Approval levels: **Observed** (exists), **Adopted** (contract and owner accepted),
**Implemented** (all consumers use the source), **Verified** (recorded cross-consumer
checks). A family may be implemented but still fail this standard. New families
require a record before code or Figma variants are added.

## Reusable Family Audit

Use the [generated inventory](../component-inventory.md) for the current source
count, imports, and consumers. Domain families contain cooperating JSX
implementations, not duplicate top-level components. `app/globals.css` is the sole application stylesheet;
the CSS owner below names a category, not a second file.

| Family | Level and canonical source | Variants/anatomy | Current verdict and CSS owner |
| --- | --- | --- | --- |
| Button | Atom, `components/ui/button.tsx` | Emphasis and size variants share 4/8/12/16px spacing tokens, 40px standard, 32px compact, 40px icon and 44px coarse targets. `bare`/`auto` has zero internal padding for bespoke rows, pins and grips. | **Implemented, not fully verified**: all product buttons use this source; live Journey and Results alignment checked. Other variants still need role/theme/keyboard checks. |
| Input | Atom, `components/ui/input.tsx` | text value, disabled, invalid, read-only | **Implemented in first slice, not verified**: Journey and PO fields now use the source. Atom field recipe owns label/error association. |
| Textarea | Atom, `components/ui/textarea.tsx` | multiline, invalid, disabled | **Implemented in first slice, not verified**: Journey and PO fields now use the source; prompt Enter behavior is a molecule rule. |
| Select | Atom family, `components/ui/select.tsx` and `components/ui/native-select.tsx` | trigger/content/item/value or native select | **Implemented in first slice, not verified**: Journey, Results and PO use the native variant for persistent filters/forms. Popup Select remains for menu-like choices. |
| Checkbox | Atom, `components/ui/checkbox.tsx` | checked, unchecked, indeterminate when appropriate | **Implemented, not verified**: consent and field consumers share source. Consent is not a Switch. |
| Switch | Atom, `components/ui/switch.tsx` | on/off, disabled | **Implemented, not verified**: setting consumers share source; persistence policy belongs to the parent. |
| Tooltip | Molecule primitive, `components/ui/tooltip.tsx` | trigger/content/provider parts | **Implemented, not verified**: icon-control guidance needed for keyboard and touch; subparts count as one family. |
| Tabs | Molecule primitive, `components/ui/tabs.tsx` | list/trigger/content; inspector and code panels | **Implemented, partly verified**: triggers have associated content panels; workspace navigation, modes, filters and step navigation are not Tabs by appearance alone. |
| Dialog | Overlay primitive, `components/ui/dialog.tsx` | content/header/title/description | **Implemented, not verified**: setup/notification content uses shared primitive; focus and short-height behavior need browser checks. |
| Dropdown menu | Overlay primitive, `components/ui/dropdown-menu.tsx` | trigger/content/item | **Implemented, not verified**: selection menus share source; do not use for a persistent page navigation bar. |
| Empty | Feedback primitive, `components/ui/empty.tsx` | empty title/body/action | **Partial**: many local no-data/unavailable states. Preserve distinct loading, permission and zero-data semantics. |
| Toaster | Feedback primitive, `components/ui/sonner.tsx` | success/error/Fuego message | **Implemented, not verified**: global source exists; participant Fuego and comment Magic remain different product events. |
| CommentAvatar | Atom, `components/comment-avatar.tsx` | initials or comment-icon variant | **Implemented, browser-checked**: the comment-icon variant leads thread, pin and placed cards; the author's name remains readable beside it. Atom CSS `.avatar`. |
| CommentPin | Anchor molecule, `components/comment-pin.tsx` | empty/add versus existing/preview; hover, focus, pinned open | **Implemented, browser-checked**: uses shared Button, NumberMarker, CommentAvatar, CommentReactions and Popover. The current saved version/state/viewport determines visible comments; reactions and full thread remain reachable. CSS `.anchor-comment-*`. |
| LabeledField | Form molecule, `components/labeled-field.tsx` | label + input/textarea/native select | **Implemented in first slice, not verified**: Journey, Results and PO share markup and `.form-field`; error/help variants are still pending. |
| IconButton | Button molecule, `components/icon-button.tsx` | icon, name, tooltip, active/disabled | **Implemented, not verified**: wraps shared Button rather than creating a second button primitive. Molecule CSS, if needed. |
| StateSelector | Selection molecule, `components/state-selector.tsx` | strip/compact/numbered | **Implemented, not fully verified**: both modes use Button. Preserve `aria-pressed`, numbering and state-only inspection. Molecule CSS `.state-strip`. |
| CheckRow | Status molecule, `components/check-row.tsx` | passed/needs-work/manual/unavailable with one icon/title/type/detail anatomy | **Implemented, not fully verified**: review Checks uses one source for local results, human review and disconnected integration. Only local results enter the pass count; no variant certifies accessibility. Molecule CSS `.check-row`. |
| GuidedPrompt | Prompt molecule, `components/guided-prompt.tsx` | suggestion, inline completion, Tab/ArrowRight accept, Escape dismiss; optional single-row preset carousel with arrow, touch and trackpad scrolling | **Implemented**: Design Agent and Flow Assistant accept a partial prompt with Tab; without a match, Tab moves focus normally. Flow Assistant and test setup share the carousel. The compact Design Agent variant hides presets. Browser-check carousel controls and narrow-width overflow. Molecule CSS `.guided-prompt`. |
| PromptVoiceControls | Prompt-input molecule, `components/prompt-voice-controls.tsx` | speech-to-text fills the current prompt; voice chat submits the same prompt path and speaks the scripted reply; both have stop, permission-error and unsupported-browser states | **Implemented, browser UI checked; live microphone not verified**: Design Agent and Flow Assistant share one source. The app does not store or send audio to its backend; the browser's speech-recognition service may process microphone audio under its own terms. CSS `.prompt-voice-*`. |
| PhoneModelSelect | Device-choice molecule, `components/phone-model-select.tsx` with `lib/preview-devices.ts` | iPhone, Android and Duo; Duo posture controls stay with the preview template | **Implemented, browser-checked**: design and review use the same labels and widths. These are simulation presets, not claims of hardware fidelity. CSS owner is the consuming toolbar. |
| Specification dialogs | Domain overlay family, `app/design-specification-dialog.tsx` | one sticky title/close shell and scrollable body; design guide has a live component preview, POC guide has presentation path, role views, evidence and demo boundaries | **Implemented**: both prompt surfaces open either guide. The design guide was browser-checked at desktop and narrow viewport; the POC guide was browser-checked at desktop, including its sticky header while scrolling. Distinct demo markers identify replaceable content. CSS `.design-spec-*`. |
| Document uploader | Domain family, `app/demo/document-uploader.tsx` + fields | ready/error/success; desktop/mobile presentation; edit fields | **Implemented demo, not production**: one renderer across roles. Preserve demo IDs, anchors and instrumented actions. Domain CSS `.product`, `.upload-*`. |
| Comments | Domain family, `app/review-comments.tsx`, `app/anchored-comments.tsx`, `app/comment-reactions.tsx` | thread/anchor presentation, reaction/reply | **Implemented, not verified**: one reaction behavior and shared avatar; placement and permission differ by surface. Domain CSS `.comment-*`, `.anchor-*`. |
| Preview canvas | Domain family, `app/preview-canvas.tsx` | device framing, pan/zoom/fit | **Implemented, not verified**: shared designer/review canvas; PO and participant presentation remain read-only. Domain CSS `.pan-canvas`, `.canvas-*`. |

The first connected slice also uses `.action-group` in Journey and Results
headers and PO actions/navigation. PO section content now scrolls independently
of its 72px action footer. This is a shared CSS recipe, not a new JSX component.
Browser verification across all audiences, themes and short viewports remains open.

The 16 other product JSX declarations are **feature or screen compositions**. They
must use these families where the contract matches, but are not collapsed into a
generic page component solely to reduce the count. `POReview`, `ParticipantTest`
and `SharedReview` in particular have distinct permission and telemetry ownership.

## CSS Categories and Migration Rule

The stylesheet's top ownership index and section comments classify the current
rules without changing specificity or cascade. Categories are:

1. **Foundations:** `:root`, `.dark`, type, spacing, color, radius, density.
2. **Atoms:** control internals, avatar, badge/status, focus/disabled states.
3. **Molecules:** state selector, prompt, reaction/action groups, local tabs.
4. **Domain families:** uploader, comments, preview canvas.
5. **Templates and screens:** PO, results, journey, designer/review and participant layouts.
6. **Responsive/state overrides:** breakpoint, reduced motion and dark-mode
   refinements, grouped with the owner during staged migration.

Existing blocks are historically interleaved. Their section labels are an
ownership map, **not** a claim that every rule has been migrated. New shared
styles go next to their canonical family; screen rules cannot redefine shared
atom internals. Move or consolidate old rules only with before/after checks in
every consumer. The [atomic source audit](../atomic-source-audit.md) records
repeated selectors and literal colors for that staged work.

## Review Gate for Anything Else

Apply the same record to molecules, domain organisms, templates, screens and
overlays. Before approving a new implementation: identify existing family and
variant candidates, CSS owner, all consumers, state/data boundary, and tests.
Record a genuine exception with reason and owner. A lower file count is not a
health metric; one source of truth with correct behavior is.
