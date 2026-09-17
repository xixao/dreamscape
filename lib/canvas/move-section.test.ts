import { expect, it } from 'vitest';
import { moveSectionToPage } from './move-section';
import type { Page, Screen } from '../files/repository';
const section = { id: 'section001', name: 'Flow', x: 0, y: 0, width: 1000, height: 800, color: 'violet' as const };
const frame: Screen = { id: 'screen0001', name: 'One', pageId: 'page000001', x: 50, y: 60, stageWidth: 300, stageHeight: 400, layout: '{"ROOT":{"custom":{"prototypeName":"Flow"}}}' };
const node = { id: 'diagram001', kind: 'rect' as const, x: 400, y: 100, width: 100, height: 100, text: 'Note', color: 'neutral' as const };
const edge = { id: 'edge000001', source: { screenId: frame.id }, target: { nodeId: node.id }, kind: 'straight' as const, arrow: 'end' as const };
const pages: Page[] = [{ id: 'page000001', name: 'One', sections: [section, { ...section, id: 'section002', x: 10, y: 20, width: 500, height: 500 }], diagram: { nodes: [node, { ...node, id: 'diagram002', x: 2000 }], edges: [edge, { ...edge, id: 'edge000002', target: { nodeId: 'diagram002' } }] } }, { id: 'page000002', name: 'Two' }];
it('moves a section, nested section, frame and internal connector; leaves outside objects and removes cross-page connectors', () => {
  const result = moveSectionToPage(pages, [frame], pages[0].id, section.id, pages[1].id)!;
  expect(result.pages[0].sections).toEqual([]);
  expect(result.pages[0].diagram?.nodes.map(n => n.id)).toEqual(['diagram002']);
  expect(result.pages[0].diagram?.edges).toEqual([]);
  expect(result.pages[1].sections).toHaveLength(2);
  expect(result.pages[1].sections?.[0].color).toBe('violet');
  expect(result.pages[1].diagram?.edges).toEqual([edge]);
  expect(result.screens[0]).toEqual({ ...frame, pageId: pages[1].id });
  expect(pages[0].sections).toHaveLength(2);
});
it('places the complete group beyond destination content while preserving relative offsets', () => {
  const existing = { ...frame, id: 'screen0002', pageId: pages[1].id, x: 200, y: 50 };
  const result = moveSectionToPage(pages, [frame, existing], pages[0].id, section.id, pages[1].id)!;
  expect(result.section.x).toBe(620);
  expect(result.screens[0].x! - result.section.x).toBe(50);
  expect(result.screens[0].y! - result.section.y).toBe(60);
  expect(result.pages[1].diagram?.nodes[0].x).toBe(1020);
  expect(result.screens[1]).toEqual(existing);
});
it('moves empty sections, ignores invalid destinations, and clears stale page-local undo snapshots', () => {
  expect(moveSectionToPage(pages, [], pages[0].id, section.id, pages[1].id)?.pages[1].sections).toHaveLength(2);
  expect(moveSectionToPage(pages, [frame], pages[0].id, section.id, 'missing')).toBeNull();
  const screen = { ...frame, layout: JSON.stringify({ ROOT: { custom: { canvasSections: { sections: [section] }, prototypeName: 'Flow', interactions: [{ action: 'back' }] } } }) };
  const next = moveSectionToPage(pages, [screen], pages[0].id, section.id, pages[1].id)!;
  expect(JSON.parse(next.screens[0].layout).ROOT.custom).toEqual({ prototypeName: 'Flow', interactions: [{ action: 'back' }] });
});
