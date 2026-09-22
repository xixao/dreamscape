import type { DiagramNode } from './store';

export const MAX_TABLE_ROWS = 500;
export const MAX_TABLE_CELLS = 500;
export const MAX_TABLE_COLUMNS = 500;
export const MAX_CELL_LENGTH = 500;
export function defaultTable(): string[][] {
  return [['Column 1', 'Column 2', 'Column 3'], ['', '', ''], ['', '', '']];
}
export function tableCells(node: DiagramNode): string[][] {
  return node.table ?? defaultTable();
}
export function validTable(cells: unknown): cells is string[][] {
  return Array.isArray(cells) && cells.length > 0 && cells.length <= MAX_TABLE_ROWS &&
    Array.isArray(cells[0]) && cells[0].length > 0 && cells[0].length <= MAX_TABLE_COLUMNS &&
    cells.length * cells[0].length <= MAX_TABLE_CELLS &&
    cells.every(row => Array.isArray(row) && row.length === cells[0].length && row.every(cell => typeof cell === 'string' && cell.length <= MAX_CELL_LENGTH));
}
export function resizeTable(cells: string[][], rows: number, columns: number): string[][] {
  return Array.from({ length: Math.max(1, Math.min(MAX_TABLE_ROWS, rows)) }, (_, r) =>
    Array.from({ length: Math.max(1, Math.min(MAX_TABLE_COLUMNS, columns)) }, (_, c) => cells[r]?.[c] ?? ''));
}

/** Blank lines are separators, not empty items. Never silently truncate a list. */
export function listItems(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map(item => item.trim()).filter(Boolean);
}
export function tableFromText(text: string): string[][] | null {
  const items = listItems(text);
  const cells = [['Item', 'Column 2'], ...items.map(item => [item, ''])];
  return items.length && validTable(cells) ? cells : null;
}
export function insertTextRows(cells: string[][], row: number, column: number, text: string): string[][] | null {
  const items = listItems(text);
  if (!items.length || row < 0 || row >= cells.length || column < 0 || column >= cells[0].length) return null;
  const inserted = items.map(item => cells[0].map((_, c) => c === column ? item : ''));
  const next = [...cells.slice(0, row), ...inserted, ...cells.slice(row)].map(r => [...r]);
  return validTable(next) ? next : null;
}
