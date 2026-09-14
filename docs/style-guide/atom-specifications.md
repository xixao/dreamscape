# Atom Specifications, States and Token Ownership

Product design decision for the current atom review, 2026-09-13. These are the
**target contracts** for Flow Review. Button spacing and touch sizing are now
implemented in the canonical source; full browser verification remains pending.
[Atom Catalog](atoms.md) documents current sources and variants.

## Measurement Rules

- CSS pixel values below are intended component sizes at default browser zoom.
  Browser text zoom and user font settings must still work; do not lock text in
  fixed-height containers that clip it.
- The design scale is `4, 8, 12, 16, 24, 32` px. Use half steps only for 1px borders,
  focus offsets and optical icon alignment. Layout containers can use larger multiples.
- Fine-pointer controls may use compact dimensions. On coarse pointers, **every
  interactive target is at least 44 x 44px**, even if the visible icon or marker is
  smaller. If adjacent targets cannot each have that area, add spacing or stack them.
- A height is a **minimum** unless an atom requires a fixed square. Text, translated
  labels, browser zoom and error messages may increase the control's height.
- No atom uses viewport-width font scaling or negative letter spacing. The current
  global `letter-spacing: 0` remains the baseline.

## Typography and Geometry

| Role | Target | Use and constraint |
| --- | --- | --- |
| Page title | 26px / 34px, weight 650 | One dominant page title; wraps; no second competing title in the same view |
| Section title | 20px / 28px, weight 650 | Main content sections |
| Panel/compact title | 16px / 24px, weight 600 | Inspectors, cards, side panels |
| Body | 16px / 24px, weight 400 | Instructions, feedback, form content; editable text stays 16px on mobile |
| Control label | 14px / 20px, weight 600 | Buttons, field labels and selected option text |
| Supporting text | 14px / 21px, weight 400 | Hints, metadata that users must read |
| Dense caption | 13px / 18px, weight 400 or 600 | Timestamp, file size, secondary count; never critical instruction alone |
| Large metric | 28px / 34px, weight 650 | A value with adjacent 14px label and explicit denominator |
| Inline icon | 16px square | Paired with body or control text |
| Toolbar icon | 18px square | Visible glyph in an icon-only action |
| Section/status icon | 18px square | Alongside label, not on another heading line |
| Compact icon | 14px square | Dense list metadata; never used as sole meaning |
| Standard command | min-height 40px, horizontal padding 16px, radius 6px | Primary/secondary/quiet/danger map to one geometry |
| Compact command | min-height 32px, horizontal padding 12px, radius 6px | Dense desktop toolbars only; coarse target grows to 44px |
| Icon command | 40 x 40px visible control, radius 6px | 18px glyph; coarse target at least 44 x 44px |
| Single-line field/select | min-height 44px, horizontal padding 12px, radius 6px | 16px editable text; compact display density may reduce desktop height to 36px, not mobile text size |
| Textarea | min-height 80px short / 112px long, padding 12px, radius 6px | Both expand or resize without covering anchored actions |
| Checkbox visible square | 16 x 16px, radius 4px | Label and surrounding target make the interactive area at least 44px high on touch |
| Switch visible track | existing 32 x 18px default / 24 x 14px small | Track is smaller than the accessible touch target; state label is required |
| Avatar | 24px small / 32px default / 40px large | Initial or image stays centered; full name remains readable nearby |
| Status marker | min-height 24px, padding 4px 8px, radius 4px | Text label plus semantic color/icon where useful; not a button |
| Numbered circle marker | 20px progress / 24px anchor / 25px version / 32px state and journey | One `NumberMarker` source with context variants; centered tabular numeral, true circle, and semantic label on its parent. The marker itself is not a control; clickable parents keep a 44 x 44px coarse-pointer target. |
| Decorative separator | 1px | `--border`; no extra shadow or interaction |
| Determinate progress track | 8px high | Numeric value/label available; never infer progress from arbitrary steps |
| Spinner glyph | 16px square | Remains inside a stable control or content slot |
| Focus indicator | 3px solid ring, 3px offset | Visible on keyboard focus; never rely on color change alone |

Button maps `default` to the standard 40px role, `sm` to 32px compact,
`icon` to 40px square, and `bare`/`auto` to zero internal padding for
specialized rows and pins. `xs`, `lg` and icon-size variants remain explicit
options in the same source. Page-specific form dimensions are a separate audit.

## Radius and Spacing Ownership

| Token role | Target | Owner |
| --- | --- | --- |
| `--space-1` through `--space-6` | 4, 8, 12, 16, 24, 32px | Shared application tokens; templates decide which role to use |
| `--radius-control` | 6px | Buttons, inputs, selects, textareas; atom controls its own corners |
| `--radius-marker` | 4px | Status markers, checkbox, small count markers |
| `--radius-surface` | 8px | Dialog/card framing; not a nested-card mandate |
| `--control-height-standard` | 40px minimum | Button primitive, not page stylesheet |
| `--control-height-compact` | 32px minimum | Button primitive; desktop density only |
| `--field-height-standard` | 44px minimum | Input and select primitives |
| `--target-min-coarse` | 44px square | Interactive atom hit area on touch |

These sizing tokens exist in `app/globals.css`. Button now consumes the spacing,
radius, control-height and coarse-target tokens; other atoms and patterns still
need migration and verification where the source audit identifies local rules.

## State Matrix

`R` means required; `C` means conditional on use; `—` means not an atom state.
`Loading` belongs to a control only while its own action is pending. `Selected`
belongs to an option/toggle, not every command. All required visual states must be
checked in both themes and with keyboard focus.

| Atom | Default | Hover | Focus | Pressed / selected | Disabled | Loading | Invalid / error | Read-only | Success / complete |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| A01 Button | R | R | R | C | R | C | C | — | C |
| A02 Text input | R | C | R | — | R | C | R | R | C |
| A03 Textarea | R | C | R | — | R | C | R | R | C |
| A04 Option selector | R | R | R | R | R | C | R | C | — |
| A05 Checkbox | R | R | R | R | R | — | C | C | — |
| A06 Switch | R | R | R | R | R | C | C | C | — |
| A07 Label/help/error text | R | — | — | — | C | — | R | C | C |
| A08 Icon | R | C | C | C | C | C | C | — | C |
| A09 Link | R | R | R | C | C | — | C | — | — |
| A10 Text/heading | R | — | — | — | — | C | C | — | C |
| A11 Status marker | R | — | — | C | — | C | C | — | R |
| A12 Avatar | R | — | — | — | — | C | C | — | C |
| A13 Separator/progress | R | — | — | — | — | C | C | — | C |
| A14 Loading indicator | R | — | — | — | — | R | C | — | C |

Matrix notes:

- A01 `aria-pressed` is reserved for toggle actions. Ordinary click active/hover
  styles are not a persistent selected state. Busy buttons retain size and prevent
  duplicate requests.
- A02/A03 invalid includes an announced error associated with the field; success
  is only shown after an actual validation/save result, not merely nonempty text.
- A04 selected option and open popup are different states. A native selector uses
  browser popup behavior; a custom selector must preserve keyboard navigation.
- A05 checked, unchecked and indeterminate are distinct. A06 on/off is distinct
  from consent. Disabled controls retain sufficient label clarity.
- A07 text, A08 icons, A10 typography, A11 markers, A12 avatar, and A13 progress
  generally do not receive focus themselves; a containing interactive element owns
  focus and hover. Their `C` entries describe contextual appearance, not a command.
- A09 disabled links require a deliberate pattern; a missing URL should not render
  a fake navigable anchor. A11 status markers are not automatically clickable.
- A13 complete/invalid apply to real progress only. A14 completion means removing
  the loading indicator and announcing the result; never leave a spinner with a
  success icon as a permanent pseudo-state.

## Semantic Token Ownership

Current light/dark values live in `app/globals.css`. Atom rules consume semantic
variables; templates own spacing around atoms, not their foreground, border, focus,
or internal state color. The role map below is authoritative for future migrations.

| Role | Existing token(s) | Atom owner and rule |
| --- | --- | --- |
| Primary command | `--primary`, `--primary-foreground` | A01 fill/text; no page-level hard-coded green override |
| Secondary command | `--secondary`, `--secondary-foreground` | A01 lower emphasis; keep text contrast in both themes |
| Quiet action/hover | `--background`, `--foreground`, `--accent`, `--accent-foreground` | A01/A09; quiet default remains readable without hover |
| Destructive action | `--destructive`, `--background` / dedicated foreground if needed | A01 must use a tested text/fill pair. Current library uses white text for destructive; dark override differs. Do not assume `--destructive` alone supplies both. |
| Default text | `--foreground` | A02-A04, A07, A09-A12 |
| Supporting text | `--muted-foreground` | A07, A10-A12; not for essential task instructions if contrast is insufficient |
| Field surface/border | `--background`, `--input`, `--border` | A02-A04; one border policy for standard and compact roles |
| Focus | `--ring` | Every interactive atom; A01-A06 and A09 consume the same indicator role |
| Invalid/error | `--destructive`, `--error-bg`, `--error-border`, `--error-text` | Field/error and status variants; icon/text accompany color |
| Success | `--success-bg`, `--success-text` | Verified successful actions/status; no use before server confirmation |
| Warning/review | `--warning-bg`, `--warning-text`, `--warning-border` | A11. Paired theme values now exist; `.badge.amber` still uses literal colors until migration. |
| Rating | `--rating` | Participant star selected state only; does not automatically encode test success |
| Neutral surfaces | `--card`, `--popover`, `--border` | Avatar fallback, tooltip/popover support, status markers; keep component boundaries distinct |
| Decorative line/progress | `--border`, `--primary` | A13; progress fills represent actual numerical state |

Token pairs must be validated against their actual surfaces in both themes. Avoid
sharing a hue merely because two domains are both called “success”; the **meaning**
of upload completion, saved version, participant completion, and approval remains
separate. A11 defines the visible label and domain; token color supplements it.

## Atom Ownership by Source

| Atom | Canonical source for implementation | Styling responsibility |
| --- | --- | --- |
| A01 | `components/ui/button.tsx`; `components/icon-button.tsx` for named icon commands | Button size, focus, disabled, pressed and visual variant |
| A02 | `components/ui/input.tsx` | Input border, type size, focus, invalid/disabled |
| A03 | `components/ui/textarea.tsx` | Textarea border, sizing, focus, invalid/disabled |
| A04 | `components/ui/native-select.tsx`; `components/ui/select.tsx` | Native/popup appearance and focus; option data comes from owner |
| A05 | `components/ui/checkbox.tsx` | Checked/indeterminate/focus/disabled |
| A06 | `components/ui/switch.tsx` | Track/thumb states, focus/disabled |
| A07 | Native label; `components/ui/label.tsx` optional | Label and helper/error text roles; field composition later |
| A08 | `lucide-react` and shared role sizes | Icon role and optical size; button owns interaction |
| A09 | Native anchor | Link text/hover/focus; destination owner supplies href |
| A10 | Native heading/text + `app/globals.css` roles | Type scale and responsive wrapping |
| A11 | Existing `.badge`/outcome classes; potential product status primitive | Domain/value presentation; no automatic link/button behavior |
| A12 | `components/comment-avatar.tsx`; library Avatar only if images needed | Identity fallback and avatar size |
| A13 | Native/CSS separator or `ui/separator`; `ui/progress` for measured progress | Line/track/fill appearance; owner supplies progress value |
| A14 | `ui/spinner` or `ui/skeleton` where used | Indicator size/motion; owner supplies pending/result state |

## Check Before Marking Implemented

1. A shared atom change reaches every actual consumer without a page-level color,
   radius, padding or focus override defeating it.
2. Required states in the matrix are shown with real content: short and long labels,
   empty and invalid fields, selected/unselected options, pending and failed actions.
3. Verify light/dark contrast on the rendered surface, keyboard focus, coarse-pointer
   target spacing, mobile editable text, 200% zoom, and reduced motion where relevant.
4. Preserve participant telemetry and server-side permission boundaries. A visual
   refactor must not change action IDs or turn unavailable actions into successes.

This pass decides **specifications, states and token ownership**. Shared wording,
tooltip and feedback rules are now in [Content and Behavior](content-and-behavior.md).
Molecule composition and each screen's conformance are reviewed next.
