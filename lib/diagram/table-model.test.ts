import { describe, it, expect } from "vitest";
import { createDiagramNode } from "./insertion";
import { diagramReducer, createInitialDiagramState } from "./store";
import { validateDiagram } from "../files/validate";
import {
  tableDocument,
  editAxis,
  formatCells,
  mergeCells,
  cellText,
  parseDelimited,
  serializeDelimited,
  pasteRows,
  drawnTable,
  validTableDocument,
} from "./table-model";
const node = () => ({
  ...createDiagramNode("table", { x: 0, y: 0 }),
  table: [
    ["Name", "Status"],
    ["Apple", "Ready"],
    ["Banana", "Pending"],
  ],
});
describe("rich diagram tables", () => {
  it("preserves text and formatting through insert, move, duplicate and delete", () => {
    const doc = formatCells(tableDocument(node()), [{ row: 1, column: 0 }], {
      fill: "#ffffff",
      bold: true,
    });
    expect(doc.meta.styles?.["1:0"].color).toBe("#111111");
    const moved = editAxis(doc, "row", [1], "move", 3);
    expect(moved.cells[2]).toEqual(["Apple", "Ready"]);
    expect(moved.meta.styles?.["2:0"].bold).toBe(true);
    const copied = editAxis(moved, "row", [2], "duplicate");
    expect(copied.cells[3]).toEqual(["Apple", "Ready"]);
    const inserted = editAxis(doc, "row", [1], "insertAfter");
    expect(inserted.cells[2]).toEqual(["", ""]);
    expect(inserted.meta.styles?.["2:0"].bold).toBe(true);
    expect(editAxis(inserted, "row", [2], "delete").cells).toEqual(doc.cells);
  });
  it("merges reversibly, rejects partial rectangles and invalid merges", () => {
    const doc = tableDocument(node()),
      merged = mergeCells(doc, [
        { row: 1, column: 0 },
        { row: 1, column: 1 },
      ]);
    expect(cellText(merged, 1, 0)).toBe("Apple\nReady");
    expect(merged.cells).toEqual(doc.cells);
    expect(validTableDocument(merged)).toBe(true);
    expect(
      mergeCells(doc, [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
      ]),
    ).toBe(doc);
    expect(
      validTableDocument({
        ...doc,
        meta: { merges: [{ row: 2, column: 0, rows: 2, columns: 1 }] },
      }),
    ).toBe(false);
  });
  it("round-trips CSV quoting, embedded newlines and empty cells", () => {
    const cells = [
      ["A,B", 'Say "hi"'],
      ["Line\nTwo", ""],
    ];
    expect(parseDelimited(serializeDelimited(cells))).toEqual(cells);
    expect(parseDelimited("A\tB\r\n1\t2", "\t")).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
    expect(() => parseDelimited('"unfinished')).toThrow();
    expect(() => parseDelimited(Array(501).fill("a").join("\n"))).toThrow(
      /500/,
    );
  });
  it("inserts formatted blocks and extra columns without overwriting rows", () => {
    const doc = tableDocument(node()),
      incoming = formatCells(
        { cells: [["x", "y"]], meta: {} },
        [{ row: 0, column: 0 }],
        { bold: true },
      );
    const pasted = pasteRows(doc, 1, 1, incoming);
    expect(pasted.cells).toEqual([
      ["Name", "Status", ""],
      ["", "x", "y"],
      ["Apple", "Ready", ""],
      ["Banana", "Pending", ""],
    ]);
    expect(pasted.meta.styles?.["1:1"].bold).toBe(true);
  });
  it("draws whole cells in either direction and bounds the preview to 500 cells", () => {
    expect(drawnTable({ x: 10, y: 20 }, { x: 331, y: 117 }).cells).toHaveLength(
      3,
    );
    expect(
      drawnTable({ x: 10, y: 20 }, { x: 331, y: 117 }).cells[0],
    ).toHaveLength(3);
    const backwards = drawnTable({ x: 500, y: 500 }, { x: 170, y: 390 });
    expect(backwards.x + backwards.width).toBe(500);
    const huge = drawnTable({ x: 0, y: 0 }, { x: 100000, y: 100000 });
    expect(huge.cells.length * huge.cells[0].length).toBe(500);
  });
  it("saves rich metadata, undoes it atomically and rejects unsafe links", () => {
    const n = node(),
      initial = createInitialDiagramState({ nodes: [n], edges: [] });
    const doc = editAxis(
      formatCells(tableDocument(n), [{ row: 0, column: 0 }], {
        size: 24,
        font: "serif",
      }),
      "column",
      [0],
      "insertAfter",
    );
    const changed = diagramReducer(initial, {
      type: "setTable",
      id: n.id,
      cells: doc.cells,
      meta: doc.meta,
    });
    expect(validateDiagram({ nodes: changed.nodes, edges: [] })).toMatchObject({
      ok: true,
    });
    expect(diagramReducer(changed, { type: "undo" }).nodes).toEqual(
      initial.nodes,
    );
    expect(
      validTableDocument({
        ...doc,
        meta: { styles: { "0:0": { href: "javascript:alert(1)" } } },
      }),
    ).toBe(false);
  });
});
