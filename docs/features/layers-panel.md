# Layers panel

Both the normal design editor and custom component editor show a left Layers panel. In the normal editor it follows the focused frame; in CC it follows the active preview. The panel shares the existing Craft editor state, so edits participate in the existing persistence and undo flows.

- Click a layer to select it; expand or collapse its children.
- Double-click a name, or use Rename, to change its layer name without changing button labels or other content.
- Drag near the top/bottom of a row to reorder; drag onto its middle to nest inside a frame or card content. Up/down controls provide a click alternative for sibling reordering.
- Duplicate copies the entire subtree, including linked card content, with fresh IDs.
- Delete removes the selected subtree. The root and structural linked content zones cannot be deleted, duplicated, or moved independently.

Layer names are stored in `custom.layerName`. The component type and canvas content are unchanged by renaming. Collapsed state is local to the panel session.

Duplicate and Delete appear on row hover/focus. The panel header collapses the panel to a thin rail. In CC, designers can drag an element from the Elements list onto a layer to nest it, or between layers to insert it. This Elements-to-Layers insertion is currently limited to CC.
