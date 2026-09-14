# Flow Review Working Agreement

## Design Before Prototype

For new features, redesigns and new prototype flows, begin with the practice in
`docs/pre-build-design-practice.md` and consult `docs/style-guide/README.md`,
`docs/design-bible.md` plus
`COMPONENTS.md`. This is a project-local working agreement, not a global setting.

1. Establish the user, job, outcome, scope and evidence/data boundaries.
2. Inventory actual screens and states. Audit existing atoms and canonical sources.
3. Identify molecules by purpose and behavior: which controls work together and why?
4. Compose organisms; propose template slots only after component contracts are clear.
5. Document reuse, variants, exceptions, accessibility, persistence and demo boundaries.
6. Agree on unresolved structural/behavioral decisions before substantial prototype UI work.
7. Implement approved contracts and verify every affected consumer, not just one page.
8. Before adding visible controls, inventory them by experience, workspace,
   page, preview, panel and item. Remove duplicate outcomes; keep the frequent
   path visible and place secondary choices in a labeled menu. Follow
   `docs/style-guide/navigation.md#control-budget-before-building`, and do not
   hide primary, safety or unsaved-work recovery actions to meet a numeric target.

Scale the process to the change. Small bug fixes need only the affected contract and
regression checks, not a full redesign workshop. Never silently expand a request to
inventory or plan into a UI refactor.

Run `node scripts/audit-design-system.mjs` after changes to scanned source/CSS, and
`node scripts/audit-design-system.mjs --check` to verify the committed inventory is current.
Do not claim that a current inventory certifies accessibility or eliminates duplication.
Keep application styles in `app/globals.css`. Preserve existing UI-library APIs, persisted
IDs, action names, permission boundaries and replaceable demo adapters.

Keep the bible's observed implementation distinct from proposed contracts. No new
wrapper merely to satisfy an Atomic Design category; reuse native semantics or the
existing primitive when sufficient. Record evidence for any deliberate exception.
