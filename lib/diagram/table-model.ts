import { z } from "zod";
import type { DiagramNode } from "./store";
import { tableCells, validTable, MAX_TABLE_CELLS } from "./table";
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const cellStyleSchema = z.object({
  fill: hex.optional(),
  color: hex.optional(),
  font: z.enum(["sans-serif", "serif", "monospace"]).optional(),
  size: z.number().min(8).max(96).optional(),
  bold: z.boolean().optional(),
  strike: z.boolean().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  list: z.enum(["none", "bullet", "number"]).optional(),
  href: z
    .string()
    .max(2048)
    .refine((v) => !v || /^(https?:\/\/|mailto:)/i.test(v))
    .optional(),
  stamp: z.string().max(16).optional(),
});
export const tableMetaSchema = z.object({
  widths: z.array(z.number().finite().min(40).max(5000)).max(500).optional(),
  heights: z.array(z.number().finite().min(24).max(5000)).max(500).optional(),
  styles: z
    .record(z.string().regex(/^\d+:\d+$/), cellStyleSchema)
    .refine((v) => Object.keys(v).length <= 500)
    .optional(),
  merges: z
    .array(
      z.object({
        row: z.number().int().nonnegative(),
        column: z.number().int().nonnegative(),
        rows: z.number().int().positive(),
        columns: z.number().int().positive(),
      }),
    )
    .max(250)
    .optional(),
});
export type CellStyle = z.infer<typeof cellStyleSchema>;
export type TableMeta = z.infer<typeof tableMetaSchema>;
export type TableDocument = { cells: string[][]; meta: TableMeta };
export type Cell = { row: number; column: number };
export const cellKey = (r: number, c: number) => `${r}:${c}`;
export function tableDocument(node: DiagramNode): TableDocument {
  const cells = tableCells(node);
  const meta = node.tableMeta ?? {};
  const scale = (
    values: number[] | undefined,
    count: number,
    total: number,
    min: number,
  ) => {
    const weights = values?.length === count ? values : Array(count).fill(1);
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((v) => Math.max(min, (v / sum) * total));
  };
  return {
    cells: cells.map((r) => [...r]),
    meta: {
      ...meta,
      widths: scale(meta.widths, cells[0].length, node.width, 40),
      heights: scale(meta.heights, cells.length, node.height, 24),
      styles: { ...meta.styles },
      merges: [...(meta.merges ?? [])],
    },
  };
}
export function validTableDocument(doc: TableDocument): boolean {
  if (!validTable(doc.cells) || !tableMetaSchema.safeParse(doc.meta).success)
    return false;
  const rows = doc.cells.length,
    cols = doc.cells[0].length;
  if (
    (doc.meta.widths && doc.meta.widths.length !== cols) ||
    (doc.meta.heights && doc.meta.heights.length !== rows)
  )
    return false;
  if (
    Object.keys(doc.meta.styles ?? {}).some((k) => {
      const [r, c] = k.split(":").map(Number);
      return r >= rows || c >= cols;
    })
  )
    return false;
  const occupied = new Set<string>();
  for (const m of doc.meta.merges ?? []) {
    if (m.row + m.rows > rows || m.column + m.columns > cols) return false;
    for (let r = m.row; r < m.row + m.rows; r++)
      for (let c = m.column; c < m.column + m.columns; c++) {
        const k = cellKey(r, c);
        if (occupied.has(k)) return false;
        occupied.add(k);
      }
  }
  return true;
}
export function cellMerge(doc: TableDocument, r: number, c: number) {
  return doc.meta.merges?.find(
    (m) =>
      r >= m.row &&
      r < m.row + m.rows &&
      c >= m.column &&
      c < m.column + m.columns,
  );
}
export function cellText(doc: TableDocument, r: number, c: number): string {
  const m = cellMerge(doc, r, c);
  if (!m) return doc.cells[r][c];
  return doc.cells
    .slice(m.row, m.row + m.rows)
    .flatMap((row) => row.slice(m.column, m.column + m.columns))
    .filter(Boolean)
    .join("\n");
}
export function contrastText(fill: string): string {
  const rgb = fill
    .match(/\w\w/g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? "#111111"
    : "#FFFFFF";
}
export function formatCells(
  doc: TableDocument,
  selected: Cell[],
  patch: CellStyle,
): TableDocument {
  const styles = { ...doc.meta.styles };
  for (const { row, column } of selected) {
    const key = cellKey(row, column);
    styles[key] = {
      ...styles[key],
      ...patch,
      ...(patch.fill && !patch.color
        ? { color: contrastText(patch.fill) }
        : {}),
    };
  }
  return { ...doc, meta: { ...doc.meta, styles } };
}
// Reindex content, sizes and formatting together. A merge that becomes noncontiguous
// is split; its source cell content is retained, so reordering cannot lose text.
export function remapTable(
  doc: TableDocument,
  rows: number[],
  columns: number[],
): TableDocument {
  const cells = rows.map((r) =>
    columns.map((c) => (r < 0 || c < 0 ? "" : doc.cells[r][c])),
  );
  const styles: Record<string, CellStyle> = {};
  rows.forEach((r, ri) =>
    columns.forEach((c, ci) => {
      const source =
        doc.meta.styles?.[
          cellKey(
            r < 0 ? Math.max(0, rows[ri - 1] ?? 0) : r,
            c < 0 ? Math.max(0, columns[ci - 1] ?? 0) : c,
          )
        ];
      if (source) styles[cellKey(ri, ci)] = { ...source };
    }),
  );
  const merges = (doc.meta.merges ?? []).flatMap((m) => {
    const rr = rows.flatMap((r, i) =>
        r >= m.row && r < m.row + m.rows ? [i] : [],
      ),
      cc = columns.flatMap((c, i) =>
        c >= m.column && c < m.column + m.columns ? [i] : [],
      );
    return rr.length === m.rows &&
      cc.length === m.columns &&
      rr.at(-1)! - rr[0] + 1 === rr.length &&
      cc.at(-1)! - cc[0] + 1 === cc.length
      ? [{ row: rr[0], column: cc[0], rows: rr.length, columns: cc.length }]
      : [];
  });
  return {
    cells,
    meta: {
      styles,
      merges,
      widths: columns.map(
        (c, i) =>
          doc.meta.widths?.[c < 0 ? Math.max(0, columns[i - 1] ?? 0) : c] ??
          160,
      ),
      heights: rows.map(
        (r, i) =>
          doc.meta.heights?.[r < 0 ? Math.max(0, rows[i - 1] ?? 0) : r] ?? 48,
      ),
    },
  };
}
export function editAxis(
  doc: TableDocument,
  axis: "row" | "column",
  indices: number[],
  operation: "insertBefore" | "insertAfter" | "delete" | "duplicate" | "move",
  destination?: number,
): TableDocument {
  const rows = doc.cells.map((_, i) => i),
    columns = doc.cells[0].map((_, i) => i);
  let order = axis === "row" ? rows : columns;
  const selected = [...new Set(indices)]
    .sort((a, b) => a - b)
    .filter((i) => i >= 0 && i < order.length);
  if (!selected.length) return doc;
  if (operation === "delete")
    order = order.filter((i) => !selected.includes(i));
  else if (operation === "move") {
    const dest = Math.max(0, Math.min(order.length, destination ?? 0));
    const before = order.slice(0, dest).filter((i) => !selected.includes(i));
    order = [
      ...before,
      ...selected,
      ...order.slice(dest).filter((i) => !selected.includes(i)),
    ];
  } else {
    const at =
      operation === "insertBefore" ? selected[0] : selected.at(-1)! + 1;
    order = [
      ...order.slice(0, at),
      ...(operation === "duplicate"
        ? selected
        : Array(selected.length).fill(-1)),
      ...order.slice(at),
    ];
  }
  if (
    !order.length ||
    order.length * (axis === "row" ? columns.length : rows.length) >
      MAX_TABLE_CELLS
  )
    return doc;
  return remapTable(
    doc,
    axis === "row" ? order : rows,
    axis === "column" ? order : columns,
  );
}
export function mergeCells(
  doc: TableDocument,
  selected: Cell[],
): TableDocument {
  if (!selected.length) return doc;
  const rr = selected.map((c) => c.row),
    cc = selected.map((c) => c.column),
    row = Math.min(...rr),
    column = Math.min(...cc),
    rows = Math.max(...rr) - row + 1,
    columns = Math.max(...cc) - column + 1;
  if (rows * columns !== selected.length) return doc;
  const overlaps = (m: NonNullable<TableMeta["merges"]>[number]) =>
    m.row < row + rows &&
    m.row + m.rows > row &&
    m.column < column + columns &&
    m.column + m.columns > column;
  if (
    doc.meta.merges?.some(
      (m) =>
        overlaps(m) &&
        (m.row < row ||
          m.column < column ||
          m.row + m.rows > row + rows ||
          m.column + m.columns > column + columns),
    )
  )
    return doc;
  return {
    ...doc,
    meta: {
      ...doc.meta,
      merges: [
        ...(doc.meta.merges ?? []).filter((m) => !overlaps(m)),
        { row, column, rows, columns },
      ],
    },
  };
}
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || !value) quoted = !quoted;
      else value += ch;
    } else if (ch === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else value += ch;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (value || row.length) rows.push([...row, value]);
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const result = rows.map((r) =>
    Array.from({ length: cols }, (_, c) => r[c] ?? ""),
  );
  if (!validTable(result))
    throw new Error(
      "Tables support up to 500 cells and 500 characters per cell. Nothing was imported.",
    );
  return result;
}
export function serializeDelimited(cells: string[][], delimiter = ","): string {
  return cells
    .map((row) =>
      row
        .map((v) => (/["\r\n,\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
        .join(delimiter),
    )
    .join("\r\n");
}
export function pasteRows(
  doc: TableDocument,
  row: number,
  column: number,
  incoming: TableDocument,
): TableDocument {
  if (
    !validTableDocument(incoming) ||
    row < 0 ||
    row > doc.cells.length ||
    column < 0
  )
    return doc;
  const columns = Math.max(
    doc.cells[0].length,
    column + incoming.cells[0].length,
  );
  if ((doc.cells.length + incoming.cells.length) * columns > MAX_TABLE_CELLS)
    return doc;
  const order = [
    ...doc.cells.slice(0, row).map((_, i) => i),
    ...incoming.cells.map(() => -1),
    ...doc.cells.slice(row).map((_, i) => i + row),
  ];
  const next = remapTable(
    doc,
    order,
    Array.from({ length: columns }, (_, i) =>
      i < doc.cells[0].length ? i : -1,
    ),
  );
  incoming.cells.forEach((rr, r) =>
    rr.forEach((text, c) => {
      next.cells[row + r][column + c] = text;
      const style = incoming.meta.styles?.[cellKey(r, c)];
      if (style) next.meta.styles![cellKey(row + r, column + c)] = { ...style };
    }),
  );
  next.meta.merges!.push(
    ...(incoming.meta.merges ?? []).map((m) => ({
      ...m,
      row: m.row + row,
      column: m.column + column,
    })),
  );
  return next;
}
export function drawnTable(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const columns = Math.min(
    50,
    Math.max(1, Math.ceil(Math.abs(end.x - start.x) / 160)),
  );
  const rows = Math.min(
    Math.floor(500 / columns),
    Math.max(1, Math.ceil(Math.abs(end.y - start.y) / 48)),
  );
  return {
    x: end.x < start.x ? start.x - columns * 160 : start.x,
    y: end.y < start.y ? start.y - rows * 48 : start.y,
    width: columns * 160,
    height: rows * 48,
    cells: Array.from(
      { length: rows },
      () => Array(columns).fill("") as string[],
    ),
  };
}
