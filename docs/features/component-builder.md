# Component Builder

Local implementation; GitHub publication, Vercel deployment, and production migrations require the owner's approval.

## Designer workflow

Elements starts with a Create component card. The builder composes existing elements in one resizable component frame, with optional Compare widths previews. The shared tree updates across widths. The right floating panel exposes searchable Elements and Design together; the left floating Layers panel supports selection, nesting, reordering, renaming, duplication, and deletion. Both panels use the main editor styling; Layers can collapse to a thin rail.

New components start at 320px wide with content-fitting height (400px when empty). Width and height controls sit together. Resize handles and zoom support inspecting intermediate widths. Layout edits default to All widths; This width range allows overrides. Existing components autosave. New drafts use Add to Components once to join the Custom category. Clicking a custom component's name or icon opens its editor; dragging it inserts an instance.

Instances expose content overrides and can be detached into ordinary elements. Definition updates preserve instance content. Deleting a definition confirms detaching existing instances. Keyboard Delete/Backspace removes selected editable nodes, while typing in fields remains protected. Clicking empty workspace deselects.

## Data and integration

- `files.components`: array of `{ id, name, layout }` definitions. `layout` is Craft JSON. Migration `0004_familiar_puma.sql` adds this column with an empty-array default. Run it against the target database only as part of an approved release.
- The existing PATCH API and file saver accept `components`. Definition and instance layout updates are queued together with `screens`. Optimistic conflict detection remains in place.
- `CustomComponent` is a registered Craft block. Props contain `componentId`, `name`, `layout`, and `overrides`. The layout is a published snapshot, so Play mode does not need a separate library fetch.
- Overrides are keyed by stable source node id and property name. Removed source nodes are ignored when rendering overrides. New nodes take their definition defaults.
- Drafts are device-local, per file and component, under `assembly-workbench:component-draft:<fileId>:<componentId|new>`. Leaving the builder retains a draft. Publishing removes it. Drafts are not shared with colleagues.
- Tablet is 768–1023px. Legacy values without a tablet key fall back to their former desktop value, preserving existing layouts at these widths.
- Existing responsive fields use the mobile/tablet/desktop map. Additional LayoutBox size-specific fields use `sizeStyles`; `componentShared` retains the reset value for responsive fields in builder drafts.
- Definitions accept only connected, acyclic trees of registered built-in blocks. Custom components cannot currently nest inside other custom components. Instance layouts are validated at the API boundary.
- Component/library operations are independent of chat. The chat transport is unchanged.

## Verification

Model tests cover invalid definitions, shared updates, preserved overrides, detachment, and legacy tablet fallback. Persistence tests cover save/reload and file duplication. Builder tests mount three real Craft editors and verify shared insertion, nested composition, responsive overrides, reset, save, undo, and redo. Chrome verification covered selected inspector interactions, border side changes, visibility, undo, and the compact controls. Full cross-preview drag/drop and Play-mode release review remain separate checks.

## Release review

Before approving deployment, review the local builder visually, including cross-preview drag/drop and a component placed in Play mode. Apply the additive database migration to the intended environment before deploying the code. Do not deploy an older client against a file containing custom component nodes.

## Width-based previews

The builder opens one 320px-wide component frame. Height fits content and grows or shrinks; an empty frame starts at 400px. Choosing Fixed or dragging a height/corner handle fixes the height. Compare widths reveals Narrow, Medium, and Wide samples with editable pixel widths; returning to Single frame retains the active sample and dimensions. Shared layout edits remain the default. Width-range overrides use the existing under-768px, 768–1023px, and 1024px-and-up ranges. Placed custom components resolve those ranges against their own measured container width rather than the surrounding page width. This uses the existing React responsive resolver, not CSS container queries.
