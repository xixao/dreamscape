import type { DiagramNode } from './store';

export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLUMNS = 10;
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
    cells.every(row => Array.isArray(row) && row.length === cells[0].length && row.every(cell => typeof cell === 'string' && cell.length <= MAX_CELL_LENGTH));
}
export function resizeTable(cells: string[][], rows: number, columns: number): string[][] {
  return Array.from({ length: Math.max(1, Math.min(MAX_TABLE_ROWS, rows)) }, (_, r) =>
    Array.from({ length: Math.max(1, Math.min(MAX_TABLE_COLUMNS, columns)) }, (_, c) => cells[r]?.[c] ?? ''));
}
