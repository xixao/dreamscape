# Canvas annotation libraries

The main editor's Comment menu opens **Accessibility annotations** or **Designer annotations** in the right-hand Components panel. Ordinary comments remain available, and each library has a button for placing its existing text-comment counterpart.

## Sources and implementation scope

- Accessibility: [Accessibility Annotation Kit 2.0 (Copy)](https://www.figma.com/design/6JmxOQzvRPGAyw1CM5Nnfr/Accessibility-Annotation-Kit-2.0--Copy-). Landmark, Tab Order, Image, Page Title, Interactive Element, Heading, Reading Order, and Other, with pin stamps, lasso stamps, and cards; plus an annotation summary.
- Designer: [GitHub Annotation Toolkit](https://www.figma.com/design/vPHgOczm811vddElJa9irR/GitHub-Annotation-Toolkit?node-id=7474-22533). Basic Note, Button, Form Element, Heading, Landmark, Link, List, Mobile Annotation, Media, Metadata, Ordering, System Feedback, Table, User Interaction, Post-it, and UI Stamp. Pin, lasso, bracket, and card presentations share a common editable model; Post-it has its own presentation.

These are native Dreamscape adaptations inspected through Figma's visible component and property panels. They are not imported Figma instances or a pixel-exact replication of every nested variant. Source icon assets and exact variable values were not available through a direct Figma inspection tool. Canvas utility/documentation sheets and experimental Primer presets are not part of this component catalog. Existing diagram tools remain separate.

## Editing and persistence

Annotations are canvas overlays, stored in each page's `diagram.nodes[].annotation`. They are intentionally outside Craft's product component tree, so they don't become application UI or generated product code. Existing file saving, page duplication, diagram selection, movement, resize handles, keyboard deletion, duplication, undo/redo, and diagram export are reused. Existing files without annotation metadata remain compatible.

Click a catalog item to place it in the visible canvas center; drag one to place it precisely, including over frame iframes. Select an annotation to edit its fields in Design. Return to Components to continue with the same library. Opening the other annotation menu switches libraries. Done leaves the library, without deleting annotations. Escape exits annotation mode.

Text fields commit on blur or Command/Ctrl+Enter, providing an undo step for the whole field edit. Selects and checkboxes commit immediately. Optional card sections appear when populated. Designer cards with many properties put the later fields behind Additional properties. Card heights adapt to changed text unless the height was manually resized. Explicit width and height changes are also undoable.

A stamp and a card may share a manually assigned note number. They are independent annotations: editing one does not update the other. Pin endpoints/lasso bounds are free canvas geometry, not automatic attachments to underlying product elements. The annotation summary is manually authored, not an automatic report.

The Custom Component editor retains its existing note/comment workflow; these libraries are on the primary page canvas.

## Main implementation files

- `lib/accessibility/kit.ts`: metadata schema, accessibility catalog, sizing, constructors, drag payload parsing.
- `lib/accessibility/designer-kit.ts`: Designer categories and editable fields.
- `components/workbench/accessibility/`: library, content renderer, and shared inspector.
- `lib/diagram/store.ts`: atomic annotation-property edit action and history.
- `lib/files/http.ts`, `lib/files/validate.ts`: save and load validation.
- Existing diagram drop surface handles both annotation and ordinary diagram payloads.
