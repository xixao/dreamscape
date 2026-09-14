# Flow Review Style Guide

Current review: **shared baseline, before screen redesign**. The
[Component Standard and Conformance](component-standards.md) is the adopted
review gate for atoms, molecules, domain families, templates and overlays.
Start with [Atom Specifications](atom-specifications.md)
for the concrete size, state and token decisions, then [Atom Catalog](atoms.md). Each entry has
purpose, existing source, current implementation, proposed product variants, behavior,
accessibility and adoption work. [Source locations](../atomic-source-audit.md) and
[specific remedies](../atom-remediation.md) support the decisions.

The shared [CSS and layout baseline](layout-and-patterns.md) defines spacing usage,
scroll/action ownership and repeated interaction patterns. The
[navigation and selection rules](navigation.md) distinguish workspace destinations,
panel tabs, mode controls, filters and guided steps. The
[right-panel family](right-panels.md) defines the shared shell, its four variants,
and the atom ownership inside each one. The
[screen audit queue](../page-audit.md) applies it to each of the 14 screens and two
overlays after this baseline review.

[Content and behavior](content-and-behavior.md) settles names, tooltips, errors and
feedback. [Change and handoff rules](governance.md) define how a guide decision
becomes shared code and how Figma/MCP mappings are recorded.

This guide adopts the documentation structure of IBM Carbon's [Button usage](https://carbondesignsystem.com/components/button/usage/),
[Style](https://carbondesignsystem.com/components/button/style/), and
[Accessibility](https://carbondesignsystem.com/components/button/accessibility/) pages.
Carbon is a reference for documentation rigor; the Flow Review code, visual language,
and behavior contracts remain ours.

## Status Key

- **Observed:** verified in current source.
- **Proposed:** a design-system rule for discussion. It is not implemented or approved.
- **Adopted:** approved product rule, with canonical source identified.
- **Verified:** adopted and checked across its consumers and supported states.

No proposed variant should be described as already working. Existing primitive APIs
are listed as implementation facts, not automatically sanctioned product choices.

## Atom Inventory

| ID | Atom | Current source | Decision status |
| --- | --- | --- | --- |
| A01 | Button | `components/ui/button.tsx` | Observed; size/emphasis rules proposed |
| A02 | Text input | `components/ui/input.tsx` | Observed; sizing consolidation proposed |
| A03 | Textarea | `components/ui/textarea.tsx` | Observed; sizing consolidation proposed |
| A04 | Option selector | `components/ui/native-select.tsx`, `components/ui/select.tsx` | Observed; two explicit variants proposed |
| A05 | Checkbox | `components/ui/checkbox.tsx` | Observed; use rules proposed |
| A06 | Switch | `components/ui/switch.tsx` | Observed; use rules proposed |
| A07 | Label/help/error text | Native label; `components/ui/label.tsx`, `components/ui/field.tsx` available | Label associations and hierarchy proposed |
| A08 | Icon | `lucide-react` | Observed; icon roles proposed |
| A09 | Link | Native anchor | Observed; navigation semantics proposed |
| A10 | Text and heading | Semantic HTML; `app/globals.css` | Observed; type roles proposed |
| A11 | Status marker | `.badge` and outcome styles in `app/globals.css`; library Badge available | Domain mapping proposed |
| A12 | Avatar | `components/comment-avatar.tsx` and `.avatar` style; library Avatar available | Shared comment initial implemented; visual verification pending |
| A13 | Separator/progress | CSS borders and demo progress; library primitives available | Semantic rules proposed |
| A14 | Loading indicator | Local text/spinner; library Spinner/Skeleton available | Pending-state rules proposed |

This catalog stops at atoms. Action groups, form fields, comments, navigation, and
templates will be discussed after atom variants are settled.

## Review Checklist

The specifications now define target values and ownership. Compare rendered examples
in light/dark, desktop/mobile, keyboard focus and 200% zoom before marking them
implemented and verified. A source audit alone cannot verify visual or
assistive-technology behavior. Content/tooltip rules and molecule composition follow
in later reviews.
