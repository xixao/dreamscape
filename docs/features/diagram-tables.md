# Diagram tables

Tables live in the Diagrams panel, separately from screen-design table components.

## Create and populate

- Select Table or press Shift+T. Drag on the canvas to choose the grid; release to create it. Escape cancels. A click creates a blank 2×2 table.
- Right-click a text element and choose Create table from text. Nonempty lines become rows under an Item header, with a second empty column. Source text stays intact.
- Paste a spreadsheet block or copied Dreamscape table on the canvas to create a new table. Use Import table from CSV in the Diagrams panel for CSV files.
- Select a destination cell and paste to INSERT full rows starting there. Existing rows shift down; additional columns are created if needed. Single-line paste while editing text uses ordinary text editing.
- Maximum 500 cells and 500 characters per cell. Oversized CSV imports are rejected, never truncated.

## Edit and structure

- Click the Table label above the grid to select the whole table, then press Delete/Backspace; Table ••• also offers Delete table. Undo restores deletion.
- Diagram shape text uses Return for new lines. Click outside or press Command/Ctrl+Return to save; Escape cancels. This makes multiline lists easy to prepare for table conversion or paste.

- Double-click a cell or press Enter to edit. Shift+Enter adds a line. Tab/Shift+Tab navigates visible cells, including merged grids.
- Shift-click selects rectangular ranges. Command/Ctrl-click toggles items. Numbered/lettered handles select rows/columns; drag handles to reorder them.
- Drag cell borders to resize individual rows/columns. Corner handles resize the table.
- Add row/Add column buttons append. Hover the small insertion points between headers to insert in the middle. Table actions also offers insertion before/after, deletion, duplication and movement.
- Delete removes selected rows/columns; with cell selection it clears contents. Command/Ctrl+D duplicates selected rows/columns.
- Table ••• (or right-click a cell) opens formatting and structural actions. Fill, automatic contrasting text, text color, typeface, size, bold, strikethrough, alignment, links, bullet/number lists and stamps apply to the current selection or whole table.
- Merge a rectangular selection; Unmerge restores the source cells. Editing a merged cell replaces its combined content. Structural operations split a merge if its cells cease to be a contiguous rectangle; text is retained.
- Convert to stickies creates note shapes from selected nonempty cells and preserves the original table.

## Transfer and persistence

- Dreamscape clipboard data preserves cell formatting and merges. Plain-text clipboard data uses tab/newline-separated values for spreadsheet interoperability.
- CSV export contains cell text; PNG/SVG/PDF include formatting and merged geometry. PDF is a raster export paginated to A4. PNG dimensions are bounded to avoid browser canvas exhaustion; SVG remains resolution-independent.
- Cell contents remain in `DiagramNode.table` for compatibility. Optional `tableMeta` stores cell styles, row heights, column widths and merged regions. Reducer updates save these together in a single history entry, with server-side validation.
- No collaboration, live spreadsheet connection, formulas or calculation engine are included.
