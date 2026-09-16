import { describe, expect, it } from 'vitest';
import { createDiagramNode } from './insertion';
import { tableCells, resizeTable, validTable } from './table';
import { createInitialDiagramState, diagramReducer } from './store';
import { validateDiagram } from '../files/validate';
import { renderDiagramSvg } from './export';

describe('diagram tables', () => {
  it('preserves cells when adding rows and columns and rejects ragged tables', () => {
    expect(resizeTable([['Name', 'Value'], ['A', 'B']], 3, 3)).toEqual([['Name', 'Value', ''], ['A', 'B', ''], ['', '', '']]);
    expect(validTable([['A'], ['B', 'C']])).toBe(false);
    expect(validTable([])).toBe(false);
  });
  it('edits, undoes, and redoes cells without changing the original snapshot', () => {
    const node = createDiagramNode('table', { x: 300, y: 200 });
    const initial = createInitialDiagramState({ nodes: [node], edges: [] });
    const cells = tableCells(node).map(row => [...row]);
    cells[1][0] = 'Requirements';
    const selected = diagramReducer(initial, { type: 'select', selection: [{ type: 'node', id: node.id }] });
    const edited = diagramReducer(selected, { type: 'setTable', id: node.id, cells });
    expect(edited.nodes[0].table?.[1][0]).toBe('Requirements');
    expect(node.table?.[1][0]).toBe('');
    const undone = diagramReducer(edited, { type: 'undo' });
    expect(undone.nodes[0].table?.[1][0]).toBe('');
    expect(undone.selection).toEqual([{ type: 'node', id: node.id }]);
    expect(diagramReducer(undone, { type: 'redo' }).nodes[0].table?.[1][0]).toBe('Requirements');
  });
  it('validates persisted cell data and exports a grid with escaped text', () => {
    const node = { ...createDiagramNode('table', { x: 300, y: 200 }), table: [['Name', 'Value'], ['<script>', 'A&B']] };
    const result = validateDiagram({ nodes: [node], edges: [] });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain('A&B');
    expect(validateDiagram({ nodes: [{ ...node, table: [['A'], []] }], edges: [] }).ok).toBe(false);
    const svg = renderDiagramSvg({ nodes: [node], edges: [], frames: [], measureText: text => text.length * 7 });
    expect(svg?.svg).toContain('&lt;script&gt;');
    expect(svg?.svg).toContain('A&amp;B');
  });
});
