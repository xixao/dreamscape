'use client';
import { useRef, useState } from 'react';
import { tableCells, MAX_CELL_LENGTH } from '@/lib/diagram/table';
import type { DiagramNode } from '@/lib/diagram/store';

export function TableContent({ node, onChange, initialCell }: { node: DiagramNode; initialCell?: { row: number; column: number }; onChange: (cells: string[][]) => void }) {
  const cells = tableCells(node);
  const [editing, setEditing] = useState<{ row: number; column: number; draft: string } | null>(() => initialCell ? { ...initialCell, draft: cells[initialCell.row]?.[initialCell.column] ?? '' } : null);
  const cancelled = useRef(false);
  function commit() {
    if (!editing || cancelled.current) return;
    const next = cells.map(row => [...row]);
    if (next[editing.row]?.[editing.column] !== undefined) {
      next[editing.row][editing.column] = editing.draft;
      onChange(next);
    }
    setEditing(null);
  }
  return <table style={{textAlign: node.textAlign ?? 'left'}} aria-label="Diagram table" className="size-full table-fixed border-collapse text-left">
    <tbody>{cells.map((row, r) => <tr key={r} style={{ height: `${100 / cells.length}%` }}>
      {row.map((cell, c) => <td key={c} className={`overflow-hidden border border-current/30 px-2 ${r === 0 ? 'bg-white/10 font-semibold' : ''}`}
        onDoubleClick={event => { event.stopPropagation(); cancelled.current = false; setEditing({ row: r, column: c, draft: cell }); }}>
        {editing?.row === r && editing.column === c ? <input autoFocus aria-label={`Row ${r + 1}, column ${c + 1}`} value={editing.draft} maxLength={MAX_CELL_LENGTH}
          style={{textAlign: node.textAlign ?? 'left'}} className="w-full min-w-0 bg-transparent outline-none" onPointerDown={event => event.stopPropagation()}
          onFocus={event => event.currentTarget.select()} onChange={event => setEditing({ ...editing, draft: event.target.value })}
          onBlur={commit} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); commit(); } else if (event.key === 'Escape') { cancelled.current = true; setEditing(null); } }}
        /> : <div className="truncate" title={cell}>{cell || '\u00a0'}</div>}
      </td>)}
    </tr>)}</tbody>
  </table>;
}
