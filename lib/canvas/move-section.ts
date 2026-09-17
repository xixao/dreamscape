import type { Page, Screen } from '../files/repository';
import type { EdgeEndpoint } from '../diagram/store';
import { containsRect } from './sections';
import { frameRect } from './viewport';

/** Transfer one spatial group atomically, keeping ids and relative positions. */
export function moveSectionToPage(pages: Page[], screens: Screen[], sourceId: string, sectionId: string, targetId: string, heights?: ReadonlyMap<string, number>) {
  const source = pages.find(p => p.id === sourceId), target = pages.find(p => p.id === targetId);
  const section = source?.sections?.find(s => s.id === sectionId);
  if (!source || !target || !section || sourceId === targetId) return null;
  const sections = (source.sections ?? []).filter(s => s.id === sectionId || containsRect(section, s));
  if ((target.sections?.length ?? 0) + sections.length > 200) return null;
  const movedScreens = screens.filter(s => s.pageId === sourceId && containsRect(section, frameRect(s, heights)));
  const nodes = (source.diagram?.nodes ?? []).filter(n => containsRect(section, n));
  const screenIds = new Set(movedScreens.map(s => s.id)), nodeIds = new Set(nodes.map(n => n.id)), sectionIds = new Set(sections.map(s => s.id));
  const boxes = [...(target.sections ?? []), ...(target.diagram?.nodes ?? []), ...screens.filter(s => s.pageId === targetId).map(s => frameRect(s, heights))];
  const dx = boxes.length ? Math.ceil(Math.max(...boxes.map(b => b.x + b.width)) + 120 - section.x) : -section.x;
  const dy = boxes.length ? Math.floor(Math.min(...boxes.map(b => b.y)) - section.y) : -section.y;
  const moved = (end: EdgeEndpoint) => Boolean(end.nodeId && nodeIds.has(end.nodeId) || end.screenId && screenIds.has(end.screenId));
  const edges = source.diagram?.edges ?? [];
  const nextPages = pages.map(page => page.id === sourceId ? {
    ...page, sections: (page.sections ?? []).filter(s => !sectionIds.has(s.id)),
    ...(page.diagram ? { diagram: { nodes: page.diagram.nodes.filter(n => !nodeIds.has(n.id)), edges: edges.filter(e => !moved(e.source) && !moved(e.target)) } } : {}),
  } : page.id === targetId ? {
    ...page, sections: [...(page.sections ?? []), ...sections.map(s => ({ ...s, x: s.x + dx, y: s.y + dy }))],
    ...(nodes.length || edges.some(e => moved(e.source) && moved(e.target)) ? { diagram: {
      nodes: [...(page.diagram?.nodes ?? []), ...nodes.map(n => ({ ...n, x: n.x + dx, y: n.y + dy }))],
      edges: [...(page.diagram?.edges ?? []), ...edges.filter(e => moved(e.source) && moved(e.target))],
    } } : {}),
  } : page);
  const nextScreens = screens.map(screen => {
    if (screen.pageId !== sourceId && screen.pageId !== targetId) return screen;
    // Page-local undo snapshots must not later restore objects to the old Page.
    let layout = screen.layout;
    try { const data = JSON.parse(layout); if (data.ROOT?.custom && (data.ROOT.custom.canvasSections || data.ROOT.custom.inspectorScreens)) { delete data.ROOT.custom.canvasSections; delete data.ROOT.custom.inspectorScreens; layout = JSON.stringify(data); } } catch { /* Preserve malformed legacy layouts. */ }
    return { ...screen, layout, ...(screenIds.has(screen.id) ? { pageId: targetId, x: (screen.x ?? 0) + dx, y: (screen.y ?? 0) + dy } : {}) };
  });
  return { pages: nextPages, screens: nextScreens, section: { ...section, x: section.x + dx, y: section.y + dy }, screenIds, dx, dy };
}
