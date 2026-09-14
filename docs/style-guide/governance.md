# Design-System Change and Handoff Rules

Status: working agreement for Flow Review. It governs the baseline without
pretending the current prototype is already fully migrated.

## Source of Truth

| Concern | Source |
| --- | --- |
| Product atom rules and variants | `docs/style-guide/atoms.md`, `atom-specifications.md` |
| Component-family approval and CSS category | `docs/style-guide/component-standards.md` |
| Shared CSS token values | `app/globals.css` (`:root` and `.dark`) |
| Repeated layout/interaction patterns | `docs/style-guide/layout-and-patterns.md` |
| Wording and feedback behavior | `docs/style-guide/content-and-behavior.md` |
| Actual React implementation | `components/ui/`, `components/`, then workflow owners in `app/` |
| Existing usage and exceptions | `docs/atomic-source-audit.md`, `docs/atom-remediation.md` |
| Screen conformance status | `docs/page-audit.md` with test evidence added during page review |
| Demo identity/telemetry | `lib/demo/registry.ts`, scenario model and API tests |

The documentation contract and code values must agree. When they differ, record
the discrepancy, decide the intended behavior, and update both in the same change.
The generated audit is evidence of source use, not an approved design rule.

## Change Process

1. Name the user problem, affected atom/pattern and all consumers from the source
   audit. Include at least one realistic long-content and one failure state.
2. Decide whether the change alters an existing variant, adds a new variant, or
   creates a genuinely different control. Avoid role/feature flags on a generic
   primitive when the interaction has different semantics.
3. Update the appropriate style-guide contract and token mapping. Identify any
   implementation-only exception and its reason.
4. Change the shared source and remove obsolete page overrides. Keep CSS in the
   application stylesheet; do not edit synced project `sources/` files.
5. Verify all consumers, not only the example page. Test relevant keyboard,
   pointer/touch, light/dark, narrow layout, zoom, loading, error and permissions.
6. Regenerate the audit. Mark the rule implemented/verified only when evidence
   exists. Include any remaining exceptions in the handoff.

## Variant Acceptance

A variant needs a distinct purpose and a measurable difference in content,
behavior or placement. The record includes its name, anatomy, size and spacing,
state matrix, semantic tokens, accessible name/keyboard behavior, examples,
consumers and source. A variant is rejected when it only encodes the page or role
where it appears. One responsive rule should not fork a component into separate
desktop and mobile implementations when the same DOM can reflow.

## Figma, MCP and Code Handoff

- Figma components should use the same canonical names and approved variant axes
  as code. A visual Figma variant does not create a new runtime behavior by itself.
- The Design System MCP is a future source/integration boundary for mapping
  tokens, component metadata and code references. Record IDs and mappings when
  that connection is implemented; do not claim a live sync from this guide.
- Matt's eventual design canvas can replace the marked mock workspace. Keep the
  renderer, saved-version, review, comment and test contracts unless a migration
  plan changes them deliberately.
- `DocumentUploader` and its generated React/CSS handoff stay a named demo adapter.
  Generated example code is not asserted to be the application's exact source or
  production-ready upload implementation.

## Versioning and Exceptions

- Stable comment anchors, demo IDs, test actions and persisted state values are
  data contracts. A rename requires an explicit migration, not a CSS cleanup.
- Keep a short decision note for a rejected or deferred variant. Exceptions name
  the owner and reason; a page-specific override is not silently considered normal.
- When a shared component changes, compare the before/after behavior in Designer,
  Engineer, PO and Participant contexts where it appears. Shared access permissions
  remain enforced by the server, regardless of matching presentation.
- Review the guide when a new role, viewport mode, real editor integration, or
  new component type enters the application. Do not freeze rules against actual
  user evidence, but do not let an unexplained page override become the new rule.
