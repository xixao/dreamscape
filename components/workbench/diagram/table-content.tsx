"use client";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { MAX_CELL_LENGTH } from "@/lib/diagram/table";
import {
  cellKey,
  cellMerge,
  cellText,
  tableDocument,
  editAxis,
  formatCells,
  mergeCells,
  parseDelimited,
  pasteRows,
  remapTable,
  serializeDelimited,
  validTableDocument,
  type Cell,
  type CellStyle,
  type TableDocument,
  type TableMeta,
} from "@/lib/diagram/table-model";
import type { DiagramNode } from "@/lib/diagram/store";
import { exportTable } from "./table-transfer";
const MIME = "application/x-dreamscape-table";
const control =
  "rounded border border-line-soft bg-card px-2 py-1 text-xs text-foreground disabled:opacity-40";
export function TableContent({
  node,
  onChange,
  initialCell,
  active = true,
  onStickies,
  onHistory,
  onSelectTable,
  onDeleteTable,
}: {
  node: DiagramNode;
  onChange: (cells: string[][], meta?: TableMeta) => void;
  initialCell?: Cell;
  active?: boolean;
  onStickies?: (texts: string[]) => void;
  onHistory?: (redo: boolean) => void;
  onSelectTable?: () => void;
  onDeleteTable?: () => void;
}) {
  const doc = tableDocument(node),
    cells = doc.cells;
  const tableHandle = useRef<HTMLButtonElement>(null);
  const selectWholeOnClick = useRef(false);
  function selectWholeTable() {
    setSelection([]);
    setAxis(null);
    setTools(false);
    onSelectTable?.();
    tableHandle.current?.focus();
  }
  const root = useRef<HTMLDivElement>(null),
    cancelled = useRef(false);
  const [editing, setEditing] = useState<(Cell & { draft: string }) | null>(
    () =>
      initialCell
        ? {
            ...initialCell,
            draft: cells[initialCell.row]?.[initialCell.column] ?? "",
          }
        : null,
  );
  const [selection, setSelection] = useState<Cell[]>([]),
    [axis, setAxis] = useState<"row" | "column" | null>(null),
    [tools, setTools] = useState(false),
    [error, setError] = useState("");
  const [anchor, setAnchor] = useState<Cell>({ row: 0, column: 0 });
  const [dragging, setDragging] = useState<{
    axis: "row" | "column";
    indices: number[];
  } | null>(null);
  const [sizePreview, setSizePreview] = useState<TableDocument | null>(null);
  const sizing = useRef<{
    axis: "row" | "column";
    index: number;
    start: number;
    size: number;
    scale: number;
    doc: TableDocument;
  } | null>(null);
  const shown = sizePreview ?? doc;
  const selected = selection.filter(
    (p) => p.row < cells.length && p.column < cells[0].length,
  );
  const all = () =>
    cells.flatMap((row, r) => row.map((_, c) => ({ row: r, column: c })));
  const targets = selected.length ? selected : all();
  const chosen =
    doc.meta.styles?.[cellKey(targets[0].row, targets[0].column)] ?? {};
  function save(next: TableDocument) {
    if (validTableDocument(next)) {
      onChange(next.cells, next.meta);
      setError("");
    } else
      setError("Tables support up to 500 cells and 500 characters per cell.");
  }
  function focusCell(row: number, column: number) {
    root.current
      ?.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`)
      ?.focus();
  }
  function select(
    row: number,
    column: number,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
    mode: "row" | "column" | null = null,
  ) {
    const rr = mode === "column" ? cells.map((_, r) => r) : [row],
      cc = mode === "row" ? cells[0].map((_, c) => c) : [column];
    let next = rr.flatMap((r) => cc.map((c) => ({ row: r, column: c })));
    if (event.shiftKey) {
      const r0 = mode === "column" ? 0 : Math.min(anchor.row, row),
        r1 = mode === "column" ? cells.length - 1 : Math.max(anchor.row, row);
      const c0 = mode === "row" ? 0 : Math.min(anchor.column, column),
        c1 =
          mode === "row"
            ? cells[0].length - 1
            : Math.max(anchor.column, column);
      next = Array.from({ length: r1 - r0 + 1 }, (_, i) =>
        Array.from({ length: c1 - c0 + 1 }, (_, j) => ({
          row: r0 + i,
          column: c0 + j,
        })),
      ).flat();
    } else if (event.metaKey || event.ctrlKey) {
      const keys = new Set(next.map((p) => cellKey(p.row, p.column)));
      next = selected.some((p) => keys.has(cellKey(p.row, p.column)))
        ? selected.filter((p) => !keys.has(cellKey(p.row, p.column)))
        : [...selected, ...next];
    } else setAnchor({ row, column });
    setSelection(next);
    setAxis(mode);
  }
  function startEdit(row: number, column: number) {
    const m = cellMerge(doc, row, column);
    row = m?.row ?? row;
    column = m?.column ?? column;
    cancelled.current = false;
    setEditing({ row, column, draft: cellText(doc, row, column) });
  }
  function commit() {
    if (!editing || cancelled.current) return;
    const next = tableDocument(node);
    const m = cellMerge(next, editing.row, editing.column);
    if (m)
      for (let r = m.row; r < m.row + m.rows; r++)
        for (let c = m.column; c < m.column + m.columns; c++)
          next.cells[r][c] = "";
    next.cells[editing.row][editing.column] = editing.draft;
    save(next);
    setEditing(null);
  }
  function structural(
    operation: Parameters<typeof editAxis>[3],
    forced?: "row" | "column",
    destination?: number,
  ) {
    const a = forced ?? axis ?? "row";
    const indices = [
      ...new Set(targets.map((p) => (a === "row" ? p.row : p.column))),
    ];
    const next = editAxis(doc, a, indices, operation, destination);
    if (next === doc) {
      setError("Cannot remove the last row/column or exceed 500 cells.");
      return;
    }
    save(next);
    setSelection([]);
    setAxis(null);
  }
  function clear() {
    const next = tableDocument(node);
    targets.forEach((p) => {
      const m = cellMerge(next, p.row, p.column);
      if (m)
        for (let r = m.row; r < m.row + m.rows; r++)
          for (let c = m.column; c < m.column + m.columns; c++)
            next.cells[r][c] = "";
      else next.cells[p.row][p.column] = "";
    });
    save(next);
  }
  function copy(event: ClipboardEvent) {
    if (editing) return;
    event.preventDefault();
    event.stopPropagation();
    const rr = [...new Set(targets.map((p) => p.row))].sort((a, b) => a - b),
      cc = [...new Set(targets.map((p) => p.column))].sort((a, b) => a - b);
    const part = remapTable(doc, rr, cc);
    event.clipboardData.setData(
      "text/plain",
      serializeDelimited(part.cells, "\t"),
    );
    event.clipboardData.setData(MIME, JSON.stringify(part));
  }
  function paste(event: ClipboardEvent, row: number, column: number) {
    const text = event.clipboardData.getData("text/plain");
    if (editing && !/[\r\n\t]/.test(text)) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const custom = event.clipboardData.getData(MIME);
      let incoming: TableDocument;
      if (custom) {
        incoming = JSON.parse(custom);
        if (!validTableDocument(incoming))
          throw new Error("Invalid copied table.");
      } else
        incoming = {
          cells: parseDelimited(text, text.includes("\t") ? "\t" : "\u0000"),
          meta: {},
        };
      const next = pasteRows(doc, row, column, incoming);
      if (next === doc)
        throw new Error(
          "This paste would exceed 500 cells. Nothing was inserted.",
        );
      cancelled.current = true;
      setEditing(null);
      save(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to paste table.");
    }
  }
  function tab(event: React.KeyboardEvent, row: number, column: number) {
    event.preventDefault();
    event.stopPropagation();
    if (editing) commit();
    const visible = all().filter((p) => {
      const m = cellMerge(doc, p.row, p.column);
      return !m || (m.row === p.row && m.column === p.column);
    });
    const index = visible.findIndex(
      (p) => p.row === row && p.column === column,
    );
    const next =
      visible[
        Math.max(
          0,
          Math.min(visible.length - 1, index + (event.shiftKey ? -1 : 1)),
        )
      ];
    setSelection([next]);
    setAxis(null);
    focusCell(next.row, next.column);
  }
  function key(event: React.KeyboardEvent, row: number, column: number) {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z" &&
      !editing
    ) {
      event.preventDefault();
      event.stopPropagation();
      onHistory?.(event.shiftKey);
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "y" &&
      !editing
    ) {
      event.preventDefault();
      event.stopPropagation();
      onHistory?.(true);
      return;
    }
    event.stopPropagation();
    if (event.key === "Tab") {
      tab(event, row, column);
      return;
    }
    if (event.key === "Escape") {
      cancelled.current = true;
      setEditing(null);
      setSelection([]);
      setTools(false);
      return;
    }
    if (editing) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        commit();
      }
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "d" &&
      axis
    ) {
      event.preventDefault();
      structural("duplicate");
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (axis) structural("delete");
      else clear();
    } else if (event.key === "Enter") {
      event.preventDefault();
      startEdit(row, column);
    } else if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const r = Math.max(
          0,
          Math.min(
            cells.length - 1,
            row +
              (event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowUp"
                  ? -1
                  : 0),
          ),
        ),
        c = Math.max(
          0,
          Math.min(
            cells[0].length - 1,
            column +
              (event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0),
          ),
        );
      select(r, c, event);
      focusCell(r, c);
    }
  }
  function startSize(event: PointerEvent, a: "row" | "column", index: number) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const rect = root.current!.getBoundingClientRect();
    sizing.current = {
      axis: a,
      index,
      start: a === "row" ? event.clientY : event.clientX,
      size: (a === "row" ? doc.meta.heights : doc.meta.widths)![index],
      scale: rect.width / node.width,
      doc,
    };
  }
  function moveSize(event: PointerEvent) {
    const g = sizing.current;
    if (!g) return;
    event.stopPropagation();
    const value = Math.max(
      g.axis === "row" ? 24 : 40,
      Math.min(
        5000,
        g.size +
          ((g.axis === "row" ? event.clientY : event.clientX) - g.start) /
            g.scale,
      ),
    );
    const next = structuredClone(g.doc);
    next.meta[g.axis === "row" ? "heights" : "widths"]![g.index] = value;
    setSizePreview(next);
  }
  function finishSize(event: PointerEvent) {
    if (!sizing.current) return;
    event.stopPropagation();
    if (sizePreview) save(sizePreview);
    sizing.current = null;
    setSizePreview(null);
  }
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        sizing.current = null;
        setSizePreview(null);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  function patch(p: CellStyle) {
    save(formatCells(doc, targets, p));
  }
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return (
    <div
      ref={root}
      className="relative size-full"
      data-table-editor
      onCopy={copy}
    >
      <table
        aria-label="Diagram table"
        style={{
          width: sizePreview ? sum(shown.meta.widths!) : "100%",
          height: sizePreview ? sum(shown.meta.heights!) : "100%",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          textAlign: node.textAlign ?? "left",
        }}
      >
        <colgroup>
          {shown.meta.widths!.map((w, c) => (
            <col
              key={c}
              style={{ width: `${(w / sum(shown.meta.widths!)) * 100}%` }}
            />
          ))}
        </colgroup>
        <tbody>
          {cells.map((row, r) => (
            <tr
              key={r}
              style={{
                height: `${(shown.meta.heights![r] / sum(shown.meta.heights!)) * 100}%`,
              }}
            >
              {row.map((_, c) => {
                const m = cellMerge(doc, r, c);
                if (m && (m.row !== r || m.column !== c)) return null;
                const s = doc.meta.styles?.[cellKey(r, c)] ?? {},
                  isSelected =
                    active &&
                    selected.some((p) => p.row === r && p.column === c),
                  text = cellText(doc, r, c),
                  isEditing = editing?.row === r && editing.column === c;
                const display =
                  s.list === "bullet"
                    ? text
                        .split("\n")
                        .map((t) => `• ${t}`)
                        .join("\n")
                    : s.list === "number"
                      ? text
                          .split("\n")
                          .map((t, i) => `${i + 1}. ${t}`)
                          .join("\n")
                      : text;
                return (
                  <td
                    key={c}
                    data-cell={cellKey(r, c)}
                    tabIndex={0}
                    aria-label={`Row ${r + 1}, column ${c + 1}`}
                    aria-selected={isSelected}
                    rowSpan={m?.rows}
                    colSpan={m?.columns}
                    className="relative border border-current/30 px-2 focus:outline-2 focus:outline-(--acc) focus:outline-offset-[-2px]"
                    style={{
                      background: s.fill ?? (r === 0 ? "#34333b" : undefined),
                      color: s.color ?? (r === 0 ? "#ffffff" : undefined),
                      fontFamily: s.font,
                      fontSize: s.size,
                      fontWeight:
                        s.bold === undefined
                          ? r === 0
                            ? 600
                            : 400
                          : s.bold
                            ? 700
                            : 400,
                      textDecoration: s.strike ? "line-through" : undefined,
                      textAlign: s.align ?? node.textAlign ?? "left",
                      outline: isSelected ? "2px solid var(--acc)" : undefined,
                      outlineOffset: -2,
                    }}
                    onPointerDown={(e) => {
                      selectWholeOnClick.current = !active && !!onSelectTable;
                      if (active) e.stopPropagation();
                    }}
                    onClick={(e) => {
                      if (e.target instanceof HTMLTextAreaElement) return;
                      if (selectWholeOnClick.current) {
                        selectWholeOnClick.current = false;
                        selectWholeTable();
                        return;
                      }
                      select(r, c, e);
                      e.currentTarget.focus();
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startEdit(r, c);
                    }}
                    onPaste={(e) => paste(e, r, c)}
                    onKeyDown={(e) => key(e, r, c)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isSelected) select(r, c, e);
                      setTools(true);
                    }}
                  >
                    {isEditing ? (
                      <textarea
                        autoFocus
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        value={editing.draft}
                        maxLength={MAX_CELL_LENGTH}
                        className="w-full resize-none bg-transparent outline-none"
                        style={{
                          textAlign: s.align ?? node.textAlign ?? "left",
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setEditing({ ...editing, draft: e.target.value })
                        }
                        onBlur={commit}
                      />
                    ) : (
                      <div
                        className="whitespace-pre-wrap break-words py-1"
                        style={{
                          overflow: "hidden",
                          maxHeight:
                            sum(
                              shown.meta.heights!.slice(r, r + (m?.rows ?? 1)),
                            ) - 8,
                        }}
                      >
                        {s.stamp && <span>{s.stamp} </span>}
                        {s.href ? (
                          <a
                            href={s.href}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => {
                              if (!e.metaKey && !e.ctrlKey) e.preventDefault();
                            }}
                            className="underline"
                          >
                            {display || s.href}
                          </a>
                        ) : (
                          display || "\u00a0"
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {onSelectTable && (
        <button
          ref={tableHandle}
          aria-label="Select entire table"
          className={control}
          style={{ position: "absolute", top: -58, left: 0, whiteSpace: "nowrap" }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); selectWholeTable(); }}
          onKeyDown={(e) => {
            if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault(); e.stopPropagation(); onDeleteTable?.();
            }
          }}
        >Table</button>
      )}
      {active && (
        <>
          <button
            aria-label="Table actions and formatting"
            className={control}
            style={{
              position: "absolute",
              top: -58,
              right: 0,
              whiteSpace: "nowrap",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setTools(!tools);
            }}
          >
            Table •••
          </button>
          {(["row", "column"] as const).flatMap((a) =>
            (a === "row" ? shown.meta.heights! : shown.meta.widths!).map(
              (size, i, values) => {
                const offset = sum(values.slice(0, i)),
                  total = sum(values),
                  isRow = a === "row";
                return (
                  <div key={`${a}${i}`}>
                    <button
                      aria-label={`Select ${a} ${i + 1}`}
                      draggable
                      className="absolute rounded bg-card text-[10px] text-foreground hover:bg-accent"
                      style={
                        isRow
                          ? {
                              left: -22,
                              top: `${(offset / total) * 100}%`,
                              width: 20,
                              height: `${(size / total) * 100}%`,
                            }
                          : {
                              top: -22,
                              left: `${(offset / total) * 100}%`,
                              height: 20,
                              width: `${(size / total) * 100}%`,
                            }
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        select(isRow ? i : 0, isRow ? 0 : i, e, a);
                        focusCell(isRow ? i : 0, isRow ? 0 : i);
                      }}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        const indices =
                          axis === a
                            ? [
                                ...new Set(
                                  targets.map((p) =>
                                    isRow ? p.row : p.column,
                                  ),
                                ),
                              ]
                            : [i];
                        e.dataTransfer.setData(
                          "text/x-dreamscape-table-axis",
                          a,
                        );
                        setDragging({
                          axis: a,
                          indices: indices.includes(i) ? indices : [i],
                        });
                      }}
                      onDragOver={(e) => {
                        if (dragging?.axis === a) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragging?.axis === a) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const after = isRow
                            ? e.clientY > rect.top + rect.height / 2
                            : e.clientX > rect.left + rect.width / 2;
                          save(
                            editAxis(
                              doc,
                              a,
                              dragging.indices,
                              "move",
                              i + (after ? 1 : 0),
                            ),
                          );
                        }
                        setDragging(null);
                      }}
                      onDragEnd={() => setDragging(null)}
                    >
                      {isRow ? i + 1 : String.fromCharCode(65 + (i % 26))}
                    </button>
                    <div
                      role="separator"
                      aria-label={`Resize ${a} ${i + 1}`}
                      aria-orientation={isRow ? "horizontal" : "vertical"}
                      className="absolute z-10"
                      style={
                        isRow
                          ? {
                              top: `${((offset + size) / total) * 100}%`,
                              left: 0,
                              width: "100%",
                              height: 5,
                              transform: "translateY(-50%)",
                              cursor: "row-resize",
                            }
                          : {
                              left: `${((offset + size) / total) * 100}%`,
                              top: 0,
                              height: "100%",
                              width: 5,
                              transform: "translateX(-50%)",
                              cursor: "col-resize",
                            }
                      }
                      onPointerDown={(e) => startSize(e, a, i)}
                      onPointerMove={moveSize}
                      onPointerUp={finishSize}
                      onPointerCancel={() => {
                        sizing.current = null;
                        setSizePreview(null);
                      }}
                    />
                    {i < values.length - 1 && (
                      <button
                        aria-label={`Insert ${a} after ${i + 1}`}
                        className="absolute z-20 rounded-full bg-card text-xs text-foreground opacity-0 hover:opacity-100 focus:opacity-100"
                        style={
                          isRow
                            ? {
                                left: -30,
                                top: `${((offset + size) / total) * 100}%`,
                                transform: "translateY(-50%)",
                                width: 16,
                                height: 16,
                              }
                            : {
                                top: -30,
                                left: `${((offset + size) / total) * 100}%`,
                                transform: "translateX(-50%)",
                                width: 16,
                                height: 16,
                              }
                        }
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          save(editAxis(doc, a, [i], "insertAfter"));
                        }}
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              },
            ),
          )}
        </>
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-x-0 top-full z-30 rounded bg-card p-2 text-xs text-destructive"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {error}
          <button aria-label="Dismiss table error" onClick={() => setError("")}>
            {" "}
            ×
          </button>
        </div>
      )}
      {active &&
        tools &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-table-editor
            role="dialog"
            aria-label="Table actions"
            className="fixed z-[200] max-h-[70vh] overflow-auto rounded-xl border border-line-soft bg-card p-3 text-foreground shadow-xl"
            style={{
              top: 88,
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(620px,calc(100vw - 32px))",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setTools(false);
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">
                {selected.length
                  ? `${selected.length} ${selected.length === 1 ? "cell" : "cells"} selected`
                  : "Entire table"}
              </span>
              {onDeleteTable && <button className={control} onClick={onDeleteTable}>Delete table</button>}
              <button className={control} onClick={() => setTools(false)}>
                Done
              </button>
            </div>
            <div
              className="flex flex-wrap items-center gap-2"
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).tagName === "BUTTON")
                  e.preventDefault();
              }}
            >
              <label className="text-xs">
                Fill{" "}
                <input
                  aria-label="Cell background"
                  type="color"
                  value={chosen.fill ?? "#34333b"}
                  onChange={(e) => patch({ fill: e.target.value })}
                />
              </label>
              <label className="text-xs">
                Text{" "}
                <input
                  aria-label="Cell text color"
                  type="color"
                  value={chosen.color ?? "#ffffff"}
                  onChange={(e) => patch({ color: e.target.value })}
                />
              </label>
              <select
                aria-label="Cell font"
                className={control}
                value={
                  chosen.font ??
                  (node.textFont === "mono"
                    ? "monospace"
                    : node.textFont === "serif"
                      ? "serif"
                      : "sans-serif")
                }
                onChange={(e) =>
                  patch({ font: e.target.value as CellStyle["font"] })
                }
              >
                <option>sans-serif</option>
                <option>serif</option>
                <option>monospace</option>
              </select>
              <input
                aria-label="Cell font size"
                className={`${control} w-16`}
                type="number"
                min={8}
                max={96}
                value={
                  chosen.size ??
                  { small: 16, medium: 24, large: 40, xlarge: 64, huge: 96 }[
                    node.textSize ?? "medium"
                  ]
                }
                onChange={(e) => {
                  const size = Number(e.target.value);
                  if (size >= 8 && size <= 96) patch({ size });
                }}
              />
              <button
                className={control}
                aria-pressed={!!chosen.bold}
                onClick={() => patch({ bold: !chosen.bold })}
              >
                Bold
              </button>
              <button
                className={control}
                aria-pressed={!!chosen.strike}
                onClick={() => patch({ strike: !chosen.strike })}
              >
                Strikethrough
              </button>
              <select
                aria-label="Cell alignment"
                className={control}
                value={chosen.align ?? "left"}
                onChange={(e) =>
                  patch({ align: e.target.value as CellStyle["align"] })
                }
              >
                <option>left</option>
                <option>center</option>
                <option>right</option>
              </select>
              <select
                aria-label="Cell list"
                className={control}
                value={chosen.list ?? "none"}
                onChange={(e) =>
                  patch({ list: e.target.value as CellStyle["list"] })
                }
              >
                <option value="none">No list</option>
                <option value="bullet">Bullets</option>
                <option value="number">Numbered</option>
              </select>
              <select
                aria-label="Cell stamp"
                className={control}
                value={chosen.stamp ?? ""}
                onChange={(e) => patch({ stamp: e.target.value })}
              >
                <option value="">No stamp</option>
                {["👍", "❤️", "⭐", "✅", "❓", "🔥"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input
                key={`${selected.map((p) => cellKey(p.row, p.column)).join(",")}:${chosen.href}`}
                aria-label="Cell link"
                placeholder="https://…"
                className={control}
                defaultValue={chosen.href ?? ""}
                onBlur={(e) => {
                  const href = e.target.value.trim();
                  if (!href || /^(https?:\/\/|mailto:)/i.test(href))
                    patch({ href });
                  else setError("Use an https://, http://, or mailto: link.");
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
              <button
                className={control}
                onClick={() => {
                  const next = mergeCells(doc, targets);
                  if (next === doc)
                    setError(
                      "Select a complete rectangle of adjacent cells to merge.",
                    );
                  else save(next);
                }}
              >
                Merge cells
              </button>
              <button
                className={control}
                onClick={() =>
                  save({
                    ...doc,
                    meta: {
                      ...doc.meta,
                      merges: doc.meta.merges?.filter(
                        (m) =>
                          !targets.some(
                            (p) =>
                              p.row >= m.row &&
                              p.row < m.row + m.rows &&
                              p.column >= m.column &&
                              p.column < m.column + m.columns,
                          ),
                      ),
                    },
                  })
                }
              >
                Unmerge cells
              </button>
              <button className={control} onClick={clear}>
                Clear contents
              </button>
              <button
                className={control}
                onClick={() => {
                  setSelection(all());
                  setAxis(null);
                }}
              >
                Select all cells
              </button>
            </div>
            {(["row", "column"] as const).map((a) => (
              <div key={a} className="mt-3 flex flex-wrap gap-2">
                <span className="w-full text-xs text-muted-foreground">
                  {a === "row" ? "Rows" : "Columns"}
                </span>
                {(
                  [
                    "insertBefore",
                    "insertAfter",
                    "duplicate",
                    "delete",
                  ] as const
                ).map((op) => (
                  <button
                    key={op}
                    className={control}
                    onClick={() => structural(op, a)}
                  >
                    {
                      {
                        insertBefore: "Insert before",
                        insertAfter: "Insert after",
                        duplicate: "Duplicate",
                        delete: "Delete",
                      }[op]
                    }
                  </button>
                ))}
                <button
                  className={control}
                  onClick={() =>
                    structural(
                      "move",
                      a,
                      Math.max(
                        0,
                        Math.min(
                          ...targets.map((p) =>
                            a === "row" ? p.row : p.column,
                          ),
                        ) - 1,
                      ),
                    )
                  }
                >
                  Move {a === "row" ? "up" : "left"}
                </button>
                <button
                  className={control}
                  onClick={() =>
                    structural(
                      "move",
                      a,
                      Math.max(
                        ...targets.map((p) => (a === "row" ? p.row : p.column)),
                      ) + 2,
                    )
                  }
                >
                  Move {a === "row" ? "down" : "right"}
                </button>
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
              <label className={`${control} cursor-pointer`}>
                Import CSV
                <input
                  aria-label="Import CSV"
                  className="sr-only"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 2_000_000)
                        throw new Error(
                          "CSV is too large. Maximum size is 2 MB.",
                        );
                      const incoming = {
                        cells: parseDelimited(await file.text()),
                        meta: {},
                      };
                      const next = pasteRows(
                        doc,
                        selected[0]?.row ?? cells.length,
                        selected[0]?.column ?? 0,
                        incoming,
                      );
                      if (next === doc)
                        throw new Error("Import exceeds 500 cells.");
                      save(next);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {(["csv", "png", "svg", "pdf"] as const).map((format) => (
                <button
                  key={format}
                  className={control}
                  onClick={() => {
                    void exportTable(node, format).catch((e) =>
                      setError(e.message),
                    );
                  }}
                >
                  Export {format.toUpperCase()}
                </button>
              ))}
              {onStickies && (
                <button
                  className={control}
                  onClick={() => {
                    onStickies(
                      targets
                        .map((p) => doc.cells[p.row][p.column])
                        .filter(Boolean),
                    );
                    setTools(false);
                  }}
                >
                  Convert to stickies
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Shift-click selects a range. ⌘/Ctrl-click adds cells. Drag
              numbered row or lettered column handles to reorder. ⌘D duplicates
              selected rows or columns. Paste inserts rows.
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
