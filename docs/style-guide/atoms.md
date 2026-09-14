# Atom Catalog

Review status: **proposed product contracts; current implementations are described as
observed**. These entries cover only primitives and their variants. Molecules and page
templates have their own planning documents and are not decided here. The current source
and every native bypass are linked in [the audit](../atomic-source-audit.md).

Concrete dimensions, required states and semantic token ownership are defined in
[Atom Specifications](atom-specifications.md). Where this catalog describes current
source sizes or says a role is proposed, the specifications set the target contract;
the current code has not yet been migrated.

## Shared Rules

**Appearance.** Color, type, border and focus use semantic light/dark tokens from
`app/globals.css`. Avoid page-specific primitive overrides once an atom role is approved.
Existing `--primary`, `--foreground`, `--muted-foreground`, `--destructive`, `--border`,
`--input`, and `--ring` are the starting tokens; status domains need explicit mappings.

**Interaction.** Every actionable atom has a visible keyboard focus state, a correct
accessible name, and distinct disabled/pending behavior. All clickable control targets
should be inspected at touch sizes; the inner icon may be smaller. Hover is supplemental.
Native semantics take precedence over visual uniformity.

**Variant syntax.** Variants describe one axis at a time: purpose/emphasis, size, and
state. Page name, audience or feature name is not a primitive variant. No variant may
silently change persistence, permissions, telemetry or navigation.

### A01. Button

**Purpose.** Run an action. Navigation to an address uses A09 Link. The canonical
action primitive is [Button](../../components/ui/button.tsx); icon-only labeled
commands currently use [IconButton](../../components/icon-button.tsx), which wraps it.

| Axis | Observed | Proposed product rule |
| --- | --- | --- |
| Emphasis | `default`, `secondary`, `outline`, `ghost`, `link`, `destructive` in source | Name product roles `primary`, `secondary`, `quiet`, `danger`; map them to current variants without changing public API casually. One dominant action per local action group. |
| Size | `xs`, `sm`, `default`, `lg`, `icon-xs`, `icon-sm`, `icon`, `icon-lg` | Document `compact`, `standard`, `touch` roles, mapping to existing sizes; avoid arbitrary per-page button dimensions. |
| Content | Text, icon+text, icon-only | Icon-only requires an accessible name; tooltip is supporting help, not the sole name. |
| State | Base source has hover/focus/disabled/invalid styles; consumers implement pressed/busy | Specify default, hover, focus-visible, pressed/selected where meaningful, disabled, busy and destructive confirmation as needed. |

**Behavior.** Commands outside a form use `type="button"`; submit is explicit. Repeated
clicks while a request is pending must not create duplicate actions. Pressed state uses
`aria-pressed` only for toggles. A visually disabled participant-test target may remain
instrumented through `aria-disabled` so attempts can be recorded; its handler must not
complete the action. The drag grip is a gesture control, not an ordinary icon click.

**Adoption.** Every audited product button now uses Button. `bare`/`auto`
preserves the distinct row, pin, drag, selection and navigation presentations
without a second primitive. Live Journey and Results alignment has been checked;
other roles, themes and keyboard states remain for verification.

### A02. Single-Line Text Input

**Purpose.** Enter one line of editable text. Source: [Input](../../components/ui/input.tsx).

| Axis | Observed | Proposed product rule |
| --- | --- | --- |
| Size | Shared `h-9`; Journey and PO custom heights/typography | Standard and compact only when a real density need exists; text remains readable on mobile. |
| Content | Text, number-like strings, file-like values via native props | Match HTML type to data. Version numbers and counts presented as text should not masquerade as editable inputs. |
| State | Focus/invalid/disabled classes in source | Default, focused, filled, placeholder, invalid, read-only, disabled, busy only if the field is truly waiting. |

**Behavior.** Keep label association, helper and error IDs, selection, max length and
controlled draft value. Read-only permits selection; disabled removes interaction.
Do not clear a draft when save fails.

**Adoption.** The three Journey/PO sites now use Input inside LabeledField.
Existing component fields also select Input dynamically. Cross-theme/browser
verification and a help/error field variant remain open.

### A03. Textarea

**Purpose.** Edit multiple lines. Source: [Textarea](../../components/ui/textarea.tsx).

| Axis | Observed | Proposed product rule |
| --- | --- | --- |
| Height | Shared content sizing with 64px minimum; Journey 76px, PO 96px | Short and long-form minimum-height roles; allow content/resize without covering the page action area. |
| Content | Helper/error, prompt, journey copy, decision text, participant feedback | The atom remains generic; character limits and submission belong to the owning field/form. |
| State | Focus/invalid/disabled in source | Default, focused, filled, invalid, read-only, disabled. |

**Behavior.** Enter inserts a newline by default. GuidedPrompt may intentionally use
Enter to submit and Shift+Enter for a newline; that is its own higher-level behavior,
not the baseline atom. Preserve long text and failed-save drafts.

**Adoption.** The five Journey/PO sites now use Textarea inside LabeledField.
Participant feedback, comments and prompts already import Textarea. Verify the
different heights and resizing in context.

### A04. Option Selector

**Purpose.** Choose one option from a finite list. Two observed sources are
[NativeSelect](../../components/ui/native-select.tsx) and
[Select](../../components/ui/select.tsx).

| Variant | Use | States |
| --- | --- | --- |
| Native | Straightforward forms and filters where platform keyboard/popup behavior is useful | Default, focused, selected, disabled, invalid |
| Popup | Existing richer option presentations and controlled application menus | Closed, open, focused option, selected, disabled, invalid, empty |

**Behavior.** Both need an associated visible label, stable option values, correct
selected value, keyboard operation and clear empty/no-option handling. They have
different event APIs and popup mechanics. Keep the distinction explicit. A filter
change can change visible evidence; it does not change saved data.

**Adoption.** The five Journey/PO/Results selectors now use NativeSelect inside
LabeledField. Verify wrapper width, keyboard behavior and filtering in context.
Existing compound Select consumers stay on Select.

### A05. Checkbox

**Purpose.** Explicitly mark one or more independent choices or consent.
Source: [Checkbox](../../components/ui/checkbox.tsx).

**Variants.** Unchecked, checked, indeterminate when a real mixed selection exists.
Current source supports checked/disabled/invalid styles. A consent checkbox starts
unchecked and is not replaced by a switch. The associated label enlarges the hit area.

**Adoption.** Participant consent and design-property fields already use the source.
Two upload configuration flags use Checkbox in the mock designer and Switch in review;
that is a semantic decision to revisit before calling the views consistent.

### A06. Switch

**Purpose.** Turn a binary setting on or off. Source:
[Switch](../../components/ui/switch.tsx).

**Variants.** Current API `sm` and `default`; states on, off, focused, disabled and
pending where saving occurs. A switch should name the setting, and any delayed-save
policy must be clear in the surrounding UI. Do not use it to indicate consent or a
multi-option choice.

**Adoption.** Notification settings and review property fields already use the source.
Visual tokens are shared; persistence differs by owner.

### A07. Label, Help and Error Text

**Purpose.** Name a control and explain or correct an input. Native `<label>` is a
valid semantic source; [Label](../../components/ui/label.tsx) and
[Field](../../components/ui/field.tsx) are available but not adopted as one product
recipe. A shared field composition belongs to the later molecule review.

**Variants.** Label required/optional, helper text, error text, character count when
needed. Required status must be present in text/semantics, not only an asterisk color.
Error text identifies the issue and how to recover. Labels stay visible after entry.

**Behavior.** `htmlFor`/`id`, wrapping label or group semantics bind text to the
correct control. `aria-describedby` links help/error text when relevant. SelectTrigger
has aria-label at current setup sites, but visible labels should also be associated.

**Adoption.** Thirty native labels are legitimate markup, not thirty duplicates.
Spacing, font size and field association vary across Journey, PO, setup and property
fields; audit the relationships before introducing a wrapper.

### A08. Icon

**Purpose.** Reinforce a command, state or object. Source: `lucide-react` icons
already imported directly. This is the canonical icon library for the app.

| Role | Proposed rule |
| --- | --- |
| Action | Meaning is supplied by button/link name; icon-only control needs an accessible label and optional tooltip. |
| Informative | Give an adjacent text equivalent or accessible name for the information represented. |
| Decorative | `aria-hidden="true"`; never repeat an adjacent text label to a screen reader. |
| Status | Pair icon with text; keep the same mapping in light/dark. |
| Expressive Fuego | Keep the explicitly requested flame treatment as a product exception, including toast meaning and accessible name. |

**Sizes.** Current usage ranges by context. Propose role sizes for inline text, action
buttons, panel headings and status indicators after visual specimens. Do not introduce
a new SVG icon because a Lucide glyph is close enough. The connector SVG in anchored
comments conveys geometry, so it is not an icon-library violation.

### A09. Link

**Purpose.** Navigate to a URL or resource. Native `<a>` is the current primitive.
Use a button for an in-place command, including changing an unsaved local selection.

**Variants.** Inline, standalone/action link, external link when destination differs.
State: default, hover, focus-visible, visited when appropriate, disabled only through
a documented pattern. Avoid `href="#"` placeholders. Copy-link is a button command;
opening the shared URL is a link.

**Adoption.** Three native anchors appear in the static source audit. Navigation-like
buttons need semantic review at the molecule stage because not all change a URL.

### A10. Text and Heading

**Purpose.** Establish hierarchy and readable body content. Source: native headings,
paragraphs and spans plus tokens in `app/globals.css`. No Text wrapper is required
merely to satisfy the catalog.

**Roles proposed.** Page title, section title, panel title, body, supporting text,
caption/data label and tabular metric. Use one dominant page title and real heading
order. An icon beside a heading sits on the same line; icon position cannot change
the heading semantics. Labels and muted text remain legible in light/dark modes.

**Adoption.** Typography is page-specific today, with repeated declarations in the
single stylesheet. A type scale and role tokens should be agreed before consolidating
CSS. Preserve content wrapping and browser zoom.

### A11. Status Marker

**Purpose.** Give a compact, noninteractive state cue. Current `.badge`, `.outcome-label`
and numbered-state styles live in `app/globals.css`; [Badge](../../components/ui/badge.tsx)
is available but its rounded-full default does not match every current status marker.

**Domains proposed.** Save state (unsaved/saving/saved/failed), prototype state
(ready/error/complete), session outcome (started/completed/abandoned), review decision
(open/approved/blocked), and availability (not connected/not permitted/no data).
Use explicit domain+value pairs; do not share a single `success` boolean across them.

**Variants.** Neutral, positive, warning, critical, informational; every color also
has a word or distinguishable shape. Numbered journey/state markers are ordered
identifiers, not generic success badges. No `Button` semantics unless clickable.

**Adoption.** `.badge` styling is already shared by CSS. Repeated spans are not
proof of duplicate implementations. Do not switch to the library Badge without
checking current geometry and accessible text.

### A12. Avatar

**Purpose.** Distinguish who authored feedback or a response. Shared
[CommentAvatar](../../components/comment-avatar.tsx) now renders the initial in
ReviewComments and AnchoredComments using one `.avatar` CSS recipe. The richer
[Avatar](../../components/ui/avatar.tsx) source is available but unused by this flow.

**Variants proposed.** Person initial, person image with deterministic fallback,
assistant identity and aggregate count only where actually needed. These have
different meanings. The two comment initials share `CommentAvatar`; the full Avatar
library becomes useful if images enter the product.

**States.** Image loaded, fallback, missing/empty name. A full name remains visible
beside the avatar; an initial alone should not be the only identity cue. Avoid
announcing the initial twice to assistive tech.

**Adoption.** D01 was the one exact markup duplicate found in the atom review and
is now consolidated. The assistant avatar and fictional product identity are
intentional exceptions.

### A13. Separator and Progress

**Separator purpose.** Separate content without implying interaction. CSS borders
are acceptable; [Separator](../../components/ui/separator.tsx) is available for a
semantic separation, default decorative. Horizontal and vertical are its current
variants. Pure decoration does not need a new component at every line.

**Progress purpose.** Communicate a measured process. [Progress](../../components/ui/progress.tsx)
is available, with a value-based indicator. Use determinate progress only when a
meaningful percentage exists; otherwise use an indeterminate pending indicator.
State/step numbers in Journey and the fictional product's application steps are not
interchangeable with participant task completion or real upload progress.

**Adoption.** No exact duplicated progress implementation established. Keep demo
progress labelled as a demo, and avoid implying the mock upload transfers a real file.

### A14. Loading Indicator

**Purpose.** Show that work is pending without shifting controls. [Spinner](../../components/ui/spinner.tsx)
and [Skeleton](../../components/ui/skeleton.tsx) are available. Current app uses
busy text/disabled buttons and a local assistant `LoaderCircle`.

**Variants proposed.** Inline spinner for bounded command waits; skeleton for
initial structure loading when the approximate shape is known; plain status text
when motion adds nothing. Respect reduced motion. Do not show a spinner forever on
a blocked or empty state.

**Behavior.** Keep button dimensions stable, prevent duplicate submission, expose
pending status once, and provide success/error recovery. Distinguish loading from
not permitted, no sessions, failed fetch and completed with zero results.

**Adoption.** No repeated spinner rendering proven. Establish a pending-state policy
before replacing local indicators.

## Atom Decisions to Close

| Decision | Current proposal | Why it matters |
| --- | --- | --- |
| Button roles | Primary, secondary, quiet, danger; compact/standard/touch sizing | Prevents page-specific shapes and competing primary commands. |
| Form field dimensions | Standard and compact text inputs; short and long textareas | Allows Journey/PO to share sources without abrupt layout changes. |
| Select split | Native and popup both supported | Preserves platform keyboard behavior and existing rich menus. |
| Binary controls | Checkbox for consent/independent choice; Switch for settings | Current upload config uses different controls across views. |
| Status domains | Domain-specific value map plus text and color | Prevents “saved” from describing the wrong draft/version. |
| Avatar source | Shared CommentAvatar for comment initials | Exact duplicate removed without adopting unused image machinery; inspect appearance in both placements. |
| Icon sizes | Define role sizes from visual specimens | Avoids conflicting sizes without a large icon wrapper. |
| Type scale | Named text roles in both themes | Reduces competing headings and inconsistent labels. |

The [Atom Specifications](atom-specifications.md) set the target values;
[Content and Behavior](content-and-behavior.md) supplies the remaining atom rules.
Visual and keyboard specimens are still needed before marking code variants verified.
Molecule composition and template placement follow from this baseline.
