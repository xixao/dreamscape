# Screen-by-Screen Baseline Audit

Purpose: inspect the existing application against the [Style Guide](style-guide/README.md)
and [Layout and Interaction Baseline](style-guide/layout-and-patterns.md) before
changing each page. One row is a workflow screen, not a route or every device variant.
This is the worklist; no row is marked complete without actual browser and behavior
evidence.

## Review Card for Every Screen

Record:

1. Role, entry/exit, current page identity and selected saved version/draft.
2. Which template/pattern owns each region, the scroll owner, and the primary action.
3. Atom sources and variants; local overrides to remove or document.
4. The states visible here: default, empty, loading, error, disabled, pending, success,
   selected, dirty, no-access, complete and abandoned as applicable.
5. What a first-time user understands in five seconds: where they are, what changed,
   what to do next, and where details live. Check names, tooltips, errors and feedback
   against [Content and Behavior](style-guide/content-and-behavior.md).
6. Keyboard path and focus return; small-screen, 200%/400% zoom, light/dark and
   coarse-pointer behavior. Content may scroll; actions may not overlap or disappear.
7. Data authority, scope and telemetry: generated demo versus saved version versus
   recorded participant event; owner versus shared-link permissions.
8. Before/after evidence, affected consumers, test result and decision status.

## Queue

| ID | Screen / family | First review question | Related screens to regression-check |
| --- | --- | --- | --- |
| S01 | Mock design workspace | Does the selected layer/component use the same atom roles as Review and Edit? | S02, S04, S09 |
| S02 | Design review | Is one page title and one local primary action clear; can users inspect without losing canvas state? | S01, S05, S09 |
| S03 | Journey | Do step selection, editing and Save stay stable while details change? | S05, S10 |
| S04 | Edit component | Do identical fields use identical source, state and save feedback as S01? | S01, S02 |
| S05 | Test results | Is the outcome understandable first, with evidence one action away and all denominators scoped? | S03, S10 |
| S06 | Case study | Can a reader see the problem, iteration, evidence and open decision without repeated headers? | S08, S10, S11 |
| S07 | Code | Are component identity, saved version, file choice and copy/download stable and honest about generated code? | S04, S06 |
| S08 | PO Update | Is progress presentation-ready and anchored section navigation steady? | S06, S09, S10, S11 |
| S09 | PO Experience | Is the same prototype rendered read-only with the correct comments and no editable tools? | S01, S02, S13 |
| S10 | PO Findings | Are summary facts identical to permitted S05 data, with a clear route to detail? | S05, S08, S11 |
| S11 | PO Decisions | Is approval distinct from saving a design, and are conditions visible? | S08, S10 |
| S12 | Participant Welcome | Are task, consent, data notice and Begin clear without workspace chrome? | S13, S14 |
| S13 | Participant Active | Are task reminder, real completion path and Abandon always reachable? | S09, S12, S14 |
| S14 | Participant Finish | Are completed and abandoned outcomes distinct; can feedback be submitted once? | S05, S10, S12 |
| X01 | Test setup/share overlay | Are task goal, audience, success condition, readiness, share link and Try distinct? | S12, S13 |
| X02 | Notification overlay | Are setting state and save feedback clear, including focus return? | S02, S08 |

Start with S02 → S05 → S10 as one connected slice. When its atoms/patterns pass,
carry those shared pieces to other consumers in this queue. Review the mock design
workspace's adapter separately because Matt's real canvas is expected to replace it.

## Evidence Gate

A page is conformant only after:

- One clear title and primary workflow, with secondary detail discoverable.
- Its actions stay reachable as content, errors and comments expand.
- It uses documented atom variants and semantic tokens, or records an exception.
- It survives light/dark, small width, zoom, keyboard, and touch-target checks.
- It preserves API, data scoping, test-event ordering and share permissions.
- Every page that consumes a changed shared component is checked.

No page is currently certified against this baseline by this document.

## Targeted Regression Checks

- 2026-09-13: The signed-out design workspace now reports Preview only after
  loading fails instead of remaining in Loading. The signed-out Journey view
  shows an unavailable state and a visible Sign in action instead of a blank
  content area. Checked in a real browser at desktop and 390px width. This
  verifies those error paths only, not the full S01 or S03 screen contracts.
