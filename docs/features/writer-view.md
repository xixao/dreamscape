# Writer view

Enter **Writer** beside Develop in the Design toolbar. The same file remains loaded and uses its existing autosave/version-conflict mechanism. `?mode=writer` restores Writer after reload. Design returns to the current page and root frame.

## Editing contract

Writer edits authored text and applicable accessibility props only. The component schema supplies fields; the mutation boundary rejects unknown fields, styles, sizes, structural props, and values of the wrong type. Components render with Craft editing disabled, so Design's keyboard/drag/context-menu actions are not mounted. This is a workspace, not an authorization boundary.

Double-click Text, button labels, card/alert headings and descriptions, avatar initials, form labels, or dialog preview text for inline editing. Enter commits; Shift+Enter inserts a line break; Escape cancels. The inspector covers all registered authored text slots, including placeholders, choices, and table data. Those collection fields retain their existing string separators. Numeric state values and table filter-column configuration are not writer fields.

Inspector text commits on blur or Cmd/Ctrl+Enter. Native text undo applies while typing; the toolbar and Cmd/Ctrl+Z outside fields undo committed Writer changes. Writer undo history is local to the open Writer session and is not shared with Design's per-screen Craft history. Leaving Writer starts a fresh Design history. Shared-component content goes into the selected instance's overrides, never the definition.

Writer preserves layout props. Text may wrap or change natural content height. The selected component's clipped overflow is advisory; intentional clipping and unmounted states still require visual review. Viewport and zoom selectors only affect Writer preview, not saved screen dimensions.

## Coverage

| Component | Writer content | Accessibility |
| --- | --- | --- |
| Text, Badge | Text | Semantic role remains designer-controlled |
| Button | Visible label | Existing accessible label |
| Image | Placeholder label | Alternative text, explicit Decorative setting |
| Avatar | Initials | Accessible name |
| Card, Alert | Title, description | Existing component semantics |
| Dialog | Trigger label, title, description | Existing dialog title/description semantics; closed content remains editable in inspector |
| Input, Textarea | Label, placeholder, help text; textarea preview text | Accessible name when no visible label; associated label/help IDs |
| Select | Label, placeholder, options, help text | Accessible name and associated label/help IDs |
| Checkbox, Switch | Label | Associated visible label or accessible name |
| Radio group | Label, options | Group name and option names |
| Slider, Progress | Label (numeric value excluded) | Accessible name |
| Tabs | Tab-label list | Existing tab semantics |
| Table | Column labels, row data, search placeholder | Existing table semantics |
| Frame, Separator, zones | No authored copy | Not exposed as editable content |
| Custom component | Registered fields of internal nodes | Instance-only overrides for the same accessibility props |

The missing-text filter is deterministic drafting guidance, not axe-core or an accessibility certification. Decorative images are intentionally unnamed; missing alt on an informative image remains missing. Setting Decorative preserves previously authored alt for restoration.

## Shared Design inspector and export

Accessibility fields live in each component schema and are available in Design and the custom-component inspector. Rendering, serialization, prototype playback and exported Craft previews use these same props. Handoff includes `writer-content.json` with authored text and missing-accessibility-text flags. No AI generation is included.

## Verification

Use a disposable file to test inline edits, inspector edits, Undo/Redo, page/screen changes, save/reload, custom instance isolation, alt/decorative behavior, and actual accessible form names. Automated tests cover mutation boundaries and rendered semantics. Preserve users' original files while testing.

## Canvas-first editing

Writer has no permanent right inspector. Double-click visible copy to edit in place. Selecting a component shows non-inline content and accessibility fields in a dismissible anchored popover. The popover avoids the selected element and floating chrome, follows scrolling and zoom, and scrolls internally when height is limited. When no safe space exists, the toolbar asks the writer to zoom out. Preview and zoom controls live in the top toolbar.

## Secondary state previews

States & messages lists the current screen's table states and field errors, plus linked overlay screens. State preview is held in Writer context and does not modify saved component state. Inline edits still update the original component's message properties. Back to default clears the preview. Toasts and confirmation dialogs remain authored overlay frames linked from their triggering action. Overlay roots use content height instead of the normal screen minimum height.
