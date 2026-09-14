# Layout and Interaction Baseline

Status: target rules for the upcoming screen-by-screen review. Shared CSS tokens
are now defined in `app/globals.css`; existing layouts have not yet been migrated.
This document records the rules a screen must satisfy, not a claim that it already does.

## CSS Ownership

1. `app/globals.css` remains the sole application stylesheet. The downloadable
   `style.css` in developer handoff is a generated scenario artifact.
2. Semantic light/dark colors and the spacing, type, control and radius scales live
   in `:root`; theme-specific colors are overridden in `.dark`. See
   [Atom Specifications](atom-specifications.md) for exact values and owners.
3. Atoms own their internal dimensions, color pairs, focus, border, radius and
   required states. Pattern classes own relationships among atoms. Templates own
   the page grid, content width and scroll region. A page does not restyle an atom's
   internals to compensate for a missing variant.
4. Reuse existing UI primitives. Add a CSS class only for a real pattern with multiple
   consumers or a named template slot. Avoid long selectors such as `.role .page
   .section button` that override shared component behavior.
5. Keep design-system tokens semantic. A product meaning such as warning uses a
   paired background/text/border in each theme. Do not reuse a hue to imply that a
   saved draft, completed upload, test completion and approval are the same event.
6. Dynamic canvas coordinates and zoom transforms remain runtime style values.
   They are not failures to use CSS tokens. Do not turn content-dependent sizes into
   hard-coded pixels merely to match a screenshot.

## Layout Geometry

| Region | Rule |
| --- | --- |
| Window/workspace | Occupies available viewport; no accidental horizontal page scroll. Height constraints use `min-height: 0` on grid/flex children so inner scrolling works. |
| Project context | Compact, persistent identity: project/component, saved version, role. The shared workspace chrome keeps it visible above the scrolling work region. It does not compete with page title. |
| Navigation | The workspace tabs or design toolbar stay in that same sticky chrome so they never pass under the header, including when the header wraps. One active destination. Local tabs/selectors remain inside the relevant page or panel. Do not mix routing, mode selection and filtering in one control group. |
| Page header | One h1 with brief supporting context. Align icon and title on the same line. Actions relate to that page; one local primary command. |
| Work region | Main content has a defined reading path. A side panel holds secondary detail without hiding the core task. No card inside another card. |
| Footer/action region | Previous/Next, Save/Discard, Begin/Submit live outside variable-height content where the workflow needs them. Controls do not bounce as content changes. |
| Inspector/composer | Inspector body scrolls independently when there is room. A 72px assistant input region anchors at the bottom of its panel; suggestion content may use the region above. |
| Bounded canvas | Pan/zoom affects the canvas only. Canvas state and annotation anchors use the same coordinate system. Visible controls allow zoom, fit and reset without gestures. |
| Journey node map | Step order is the source of connections. Auto sync lays out nodes from order; manual drag persists coordinates as journey draft data. Node grips and earlier/later buttons are separate move and reorder actions. At a 720px desktop height, the selected-step heading and initial fields remain visible beside the map; its heading stays put while detail scrolls. The recorded test path remains read-only. |
| Modal/sheet | Title and Close visible; only body scrolls where the viewport permits. Test setup keeps Create link in a fixed action region while settings and active links scroll together; once created, the ready state and link lead the scroll region while Try test becomes the fixed participant action. Focus enters and returns appropriately. |

The stable layout is a target for ordinary desktop heights, not a promise of no
scrolling. At narrow widths, short heights, on-screen keyboards, 200%/400% zoom or
large text, regions may stack and the document may scroll. No fixed footer may cover
the last field, error or primary action. Reflow at a 320 CSS-pixel equivalent width
is an explicit verification target, following [W3C's reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow).

## Spacing Usage

| Relationship | Token | Examples |
| --- | --- | --- |
| Icon to label / tightly related glyphs | `--space-1` or `--space-2` | Inline heading icon, button icon, status icon |
| Within one control/row | `--space-2` or `--space-3` | File name and metadata, adjacent actions |
| Between related fields/items | `--space-4` | Form fields, finding rows, step details |
| Section padding / major groups | `--space-5` | Work region and panel sections |
| Distinct sections | `--space-6` | Summary to findings, major narrative shifts |

Spacing reflects relationship; it is not a command to give every section 32px.
Compact and comfortable density can map to different choices from this same scale.
Atom hit targets never shrink with density. At 320px, reduce outer padding before
reducing readable type or controls.

## Typography and Copy Placement

Review panels use the compact title role (16px) and readable supporting text
(14px) for evidence, checks, comments and assistant responses. Metadata may use
13px. Editable text remains 16px so composing does not trigger mobile zoom.

- Use the text roles in Atom Specifications. One page title; section and panel
  headings use the role that matches their container, not the page role.
- Body and editable text remain readable at mobile size. Metadata is never the sole
  carrier of a task requirement or error. Long names, comments and file names wrap
  or truncate only when their full value remains accessible.
- The page header communicates **where the user is**. A local heading communicates
  **what this section is**. Repeating “User journey” above another “User journey”
  heading or showing competing large actions fails this rule.
- Status copy identifies scope: “Journey draft has unsaved changes” and “Component
  version 1 saved” are separate facts. Do not display an unqualified “Saved” when
  part of the current work is unsaved.

## Patterns to Reuse

| Pattern | Core behavior | Variants and exceptions |
| --- | --- | --- |
| Page context and actions | One active page, one h1, local command priority and scoped save/version status | Designer/Engineer/PO views differ in permitted actions; participant removes workspace chrome |
| Action row | Primary action, optional lower-emphasis adjacent action, stable busy/error region | Destructive/abandon action is distinct and does not take primary color by default |
| Form field | Visible label, associated control, optional help, invalid text, value and save state | Input, textarea, native select and popup select are explicit variants; use no invisible label only for space |
| Status/empty/error | State label, explanation, recovery command when possible | Loading, zero data, unavailable, permission denied and request failure are distinct |
| Selection/filter | Selection changes a local value; filter changes visible data and scope; navigation changes destination | Selected appearance and keyboard behavior depend on the semantic pattern, not only a mint border |
| Evidence entry | Finding + count + direct session link | PO gets concise presentation; designer can inspect full event detail; calculations share source |
| Comment entry | Author, content, version/state/viewport context, reactions/reply | Position can be anchored or in a thread; permission rules remain server-owned |
| Save/version | Draft, saving, saved, failed and conflict are explicit | Save a journey, save component revision and save test setup have different data owners |
| Test runner | Neutral goal and visible task reminder; actual prototype actions drive completion | Abandon always reachable; completed and abandoned are distinct outcomes |
| Code/file handoff | Component identity, file tabs, read-only source and copy/download | Generated demo code labelled as integration example until real source mapping exists |
| Product review | Compact version context and five local sections in one bounded shell | Overview uses a full-width 30/70 desktop split: decision context and evidence at left, full-width interactive saved preview at right, with an expanded page/component view. Stack on narrow screens. Tests and Proposals expose details on demand; Implementation separates prototype checks from production readiness; Decision requires rationale and follow-up. Comments, print, share and present remain review-level actions. |

These are **pattern contracts**, not new exported components. Extraction occurs when
two real consumers need the same behavior and the API stays simpler than duplicated
markup. See [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/)
for the semantic keyboard expectations of buttons, tabs and dialogs.

## Theme, State and Motion

- Every atom is rendered in light/dark against its actual surface. Do not assume
  token contrast because the token has a familiar name. Success, warning, error and
  focus states need text/icon semantics as well as color.
- Every actionable state is considered: normal, hover, focus-visible, pressed or
  selected where applicable, disabled, pending and failure. The atom state matrix
  defines what is required; page review tests the relevant states in context.
- Maintain a visible focus outline on controls, links and disclosure triggers.
  Preserve focus after list changes, save errors and navigation. Dialogs manage entry
  and return focus; page transitions focus the new title or main region as appropriate.
- User motion preferences apply to decorative animation. Canvas movement and test
  telemetry stay functional; zoom/pan controls have non-gesture alternatives.
- Our 44px coarse-pointer target is a **product choice**. WCAG 2.2 AA's target-size
  minimum is 24 CSS pixels with exceptions; see [W3C's target-size explanation](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## Data and Handoff Rules

- State in a rendered demo component comes from the same saved configuration in
  designer, PO and participant views. An owner can inspect without generating test
  evidence; a participant session can record actions only through its authorized
  session path.
- Metric numerator, denominator, version, audience and loading status travel
  together. “No evidence,” “not yet loaded” and “not permitted” render differently.
- Local rule passes are not an overall readiness score. Lead with the open
  verification/integration work, and derive the PO snapshot and inspector
  status from the same verification list.
- One shared pattern change must be inspected in every consuming role and view.
  Stable IDs, telemetry action names and share permissions are integration contracts.
- External Design System MCP and Matt's real design canvas are future adapters.
  Preserve their boundary in handoff; do not suggest that a demo renderer or code
  export already provides production integration.

## CSS Migration Approach

The existing stylesheet has page-specific rules and legacy literal colors. The new
tokens are available now, but no old rule was removed in this baseline pass. During
page review, migrate one approved pattern at a time, remove superseded selectors,
then verify every consumer. The generated [source audit](../atomic-source-audit.md)
points to direct controls, literal colors and repeated selector groups; each finding
needs review before modification.
