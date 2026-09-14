# Pre-Build Design Practice

Status: adopted project workflow. Template designs and proposed components still require discussion.

## Purpose

Understand what we are building, what belongs together, and what can be reused before
assembling prototype screens. Prepare handoff as the design evolves, not after delivery.
Use this for this app and copy it deliberately into future projects; it does not alter
other projects automatically.

## Gates

| Gate | Questions | Required output |
| --- | --- | --- |
| 1. Frame | Who is acting? What job and outcome? What is real versus demo? | Brief; roles; success and failure criteria; scope exclusions |
| 2. Inventory | Which screens, states and entry/exit paths exist? | Page/state map, permission and version context |
| 3. Atoms | Which primitive sources already exist? Where are they bypassed? | Source audit; canonical source list; reviewed exceptions |
| 4. Molecules | Which controls accomplish one coherent task together? | Composition recipes; keyboard, validation, loading and persistence contracts |
| 5. Organisms | Which compositions own a complete responsibility? | Ownership/data boundaries; integration contracts; demo adapters |
| 6. Templates | Which responsibilities share spatial and navigation rules? Are visible controls owned, prioritized and free of duplicate outcomes? | Slot diagrams; scroll/focus rules; role/device variants; control inventory; open decisions |
| 7. Prototype | Is the intended flow agreed and implementable? | Small end-to-end slice; realistic states; no unexplained dead actions |
| 8. Verify | Does reuse actually cascade without changing semantics? | Cross-consumer checks; mobile/zoom/theme/keyboard evidence; updated handoff |

Do not gate every small edit on a meeting. Record established decisions and proceed;
ask when a choice changes workflow, data access, persistence or the user's stated intent.

## Feature Brief Template

```text
Feature / owner:
User and job:
Success outcome / measurable evidence:
Entry / exit / abandonment:
Screens and states affected:
Existing atoms and source paths:
Molecules and ordered actions:
Visible-control budget by experience/workspace/page/preview/panel/item:
Duplicated outcomes removed or justified:
Organism owning state and requests:
Template candidate and fixed/scrolling slots:
Role and permission differences:
Draft / saved version / test-session context:
Keyboard, focus, reduced motion, zoom and small-screen behavior:
Loading / empty / error / success / permission-denied states:
Demo fixtures / real integrations / future adapter:
Reuse exceptions and rationale:
Acceptance tests and handoff changes:
Open decisions:
```

## Handoff Record Per Composition

Record ID, purpose, canonical source, consumers, variant axis, atom recipe, action order,
controlled values, callbacks, data owner, persistence boundary, accessibility contract,
failure/retry behavior, demo ID, test coverage and status. Status is one of observed,
proposed, approved, implemented or verified; do not conflate those states.

## Reuse Rules

- Same semantic action uses the same primitive and interaction contract.
- Same visual shape does not imply the same action, data model or permission.
- A variant changes a documented axis, not an arbitrary collection of booleans.
- A primitive owns control behavior; a molecule owns coordination; an organism owns
  the workflow responsibility. Backend authorization remains authoritative.
- Share metric calculations as well as metric presentation. An inaccessible data source
  is not an empty dataset; zero, unknown and not permitted remain distinct.
- Use shared tokens for visual decisions. Runtime position/transform values are legitimate
  data, not an excuse for hard-coded visual styling.
- Do not create generic infrastructure for a single speculative use. Reuse can begin as
  composition inside a file and be extracted when there is an actual second consumer.
- Apply the [navigation control budget](style-guide/navigation.md#control-budget-before-building)
  before placing new controls. Progressive disclosure is for secondary choices,
  never the primary task, safety actions or unsaved-work recovery.

## Maintenance

Regenerate the source audit after source/CSS changes. Review new native sites and
changed dependencies; update exceptions rather than suppressing them. Run the existing
structure checks and appropriate behavior tests. A snapshot is evidence of source shape,
not proof of usability or accessibility. Keep pending template decisions visible until
the designer/product conversation resolves them.
