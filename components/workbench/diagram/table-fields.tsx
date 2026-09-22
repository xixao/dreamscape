'use client';
import { tableCells, resizeTable, MAX_CELL_LENGTH } from '@/lib/diagram/table';
import type { DiagramNode } from '@/lib/diagram/store';
import { Input } from '@/components/ui/input';
import { LABEL } from '../chrome';

export function TableFields({ node, onChange }: { node: DiagramNode; onChange: (cells: string[][]) => void }) {
  const cells = tableCells(node);
  return <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 gap-2">
      <label className={LABEL}>Rows<Input aria-label="Rows" type="number" min={1} max={Math.floor(500/cells[0].length)} value={cells.length} onChange={event => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 1 && n <= Math.floor(500/cells[0].length)) onChange(resizeTable(cells, n, cells[0].length)); }} /></label>
      <label className={LABEL}>Columns<Input aria-label="Columns" type="number" min={1} max={Math.floor(500/cells.length)} value={cells[0].length} onChange={event => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 1 && n <= Math.floor(500/cells.length)) onChange(resizeTable(cells, cells.length, n)); }} /></label>
    </div>
    <p className="text-xs text-muted-foreground">Double-click cells to edit. Use Table ••• on the canvas for formatting, merging, import, and export. Up to 500 cells.</p>
    <div className="max-h-72 space-y-3 overflow-auto">
      {cells.map((row, r) => <div key={r} className="space-y-1"><div className={LABEL}>{r === 0 ? 'Header' : `Row ${r + 1}`}</div>
        {row.map((cell, c) => <Input key={`${c}:${cell}`} aria-label={`Row ${r + 1}, column ${c + 1}`} placeholder={`Column ${c + 1}`} defaultValue={cell} maxLength={MAX_CELL_LENGTH}
          onBlur={event => { if (event.target.value === cell) return; const next = cells.map(row => [...row]); next[r][c] = event.target.value; onChange(next); }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />)}
      </div>)}
    </div>
  </div>;
}
