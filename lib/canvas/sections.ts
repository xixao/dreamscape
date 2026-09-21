import { z } from 'zod';
import { frameRect, type FrameRect } from './viewport';
import type { Screen } from '../files/validate';

export const SECTION_COLORS = {
  blue: { label: 'Blue', value: '#2563eb', foreground: '#ffffff' },
  violet: { label: 'Violet', value: '#7c3aed', foreground: '#ffffff' },
  pink: { label: 'Pink', value: '#db2777', foreground: '#ffffff' },
  red: { label: 'Red', value: '#dc2626', foreground: '#ffffff' },
  orange: { label: 'Orange', value: '#f97316', foreground: '#18181b' },
  yellow: { label: 'Yellow', value: '#eab308', foreground: '#18181b' },
  green: { label: 'Green', value: '#22c55e', foreground: '#18181b' },
  teal: { label: 'Teal', value: '#14b8a6', foreground: '#18181b' },
} as const;
export type SectionColor = keyof typeof SECTION_COLORS;

export const sectionSchema = z.object({
  color: z.enum(['blue', 'violet', 'pink', 'red', 'orange', 'yellow', 'green', 'teal']).optional(),
  id: z.string().length(10), name: z.string().trim().min(1).max(80),
  x: z.number().int().min(-1000000).max(1000000), y: z.number().int().min(-1000000).max(1000000),
  width: z.number().int().min(160).max(100000), height: z.number().int().min(120).max(100000),
});
export const sectionsSchema = z.array(sectionSchema).max(200).refine(items => new Set(items.map(s => s.id)).size === items.length, 'Section IDs must be unique');
export type CanvasSection = z.infer<typeof sectionSchema>;
export type FramePosition = { id: string; x: number; y: number };
export type SectionChange = { sections: CanvasSection[]; positions: FramePosition[]; diagramPositions?: FramePosition[]; screens?: Screen[]; diagram?: import('../diagram/store').DiagramData };
export function containsRect(outer: FrameRect, inner: FrameRect) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}
// Overlapping regions have one owner: the smallest containing section.
export function sectionFrames(section: CanvasSection, sections: CanvasSection[], screens: Screen[], heights?: ReadonlyMap<string, number>) {
  return screens.filter(screen => sections.filter(s => containsRect(s, frameRect(screen, heights))).sort((a,b) => a.width*a.height-b.width*b.height || a.id.localeCompare(b.id))[0]?.id === section.id);
}
export function fitSection(screens: Screen[], heights?: ReadonlyMap<string, number>): FrameRect | null {
  if (!screens.length) return null;
  const boxes=screens.map(s => frameRect(s, heights));
  const x=Math.floor(Math.min(...boxes.map(b=>b.x))-64), y=Math.floor(Math.min(...boxes.map(b=>b.y))-80);
  return { x, y, width: Math.max(160,Math.ceil(Math.max(...boxes.map(b=>b.x+b.width))+64-x)), height: Math.max(120,Math.ceil(Math.max(...boxes.map(b=>b.y+b.height))+64-y)) };
}
export function translateSection(section: CanvasSection, members: Screen[], dx: number, dy: number): { section: CanvasSection; positions: FramePosition[] } {
  dx=Math.round(dx);dy=Math.round(dy);
  return { section: {...section,x:section.x+dx,y:section.y+dy}, positions:members.map(s=>({id:s.id,x:(s.x??0)+dx,y:(s.y??0)+dy})) };
}

/** Fit diagram members crossing the boundary as well as fully contained objects. */
export function fitSectionObjects(section: CanvasSection, sections: CanvasSection[], screens: Screen[], nodes: (FrameRect & {id?:string})[], heights?: ReadonlyMap<string, number>, edges: import('../diagram/store').DiagramEdge[] = []): FrameRect | null {
  const intersects=(box:FrameRect)=>box.x<section.x+section.width&&box.x+box.width>section.x&&box.y<section.y+section.height&&box.y+box.height>section.y;
  const belongsElsewhere=(box:FrameRect)=>sections.some(other=>other.id!==section.id&&!containsRect(section,other)&&containsRect(other,box)&&!containsRect(other,section));
  const members=new Set(nodes.filter(n=>intersects(n)&&!belongsElsewhere(n)));
  let changed=true;
  while(changed){changed=false;for(const edge of edges){const source=nodes.find(n=>n.id===edge.source.nodeId),target=nodes.find(n=>n.id===edge.target.nodeId);if(!source||!target)continue;for(const [from,to] of [[source,target],[target,source]])if(members.has(from)&&!members.has(to)&&!belongsElsewhere(to)){members.add(to);changed=true;}}}
  const boxes = [...screens.map(s => frameRect(s, heights)), ...sections.filter(s => s.id !== section.id)].filter(box => containsRect(section, box));
  boxes.push(...members);
  if (!boxes.length) return null;
  const x=Math.floor(Math.min(...boxes.map(b=>b.x))-64),y=Math.floor(Math.min(...boxes.map(b=>b.y))-80);
  return {x,y,width:Math.max(160,Math.ceil(Math.max(...boxes.map(b=>b.x+b.width))+64-x)),height:Math.max(120,Math.ceil(Math.max(...boxes.map(b=>b.y+b.height))+64-y))};
}

/** Expand existing diagram sections without shrinking or capturing unrelated canvas objects. */
export function growDiagramSections(
  sections: CanvasSection[],
  previous: import('../diagram/store').DiagramData,
  next: import('../diagram/store').DiagramData,
): CanvasSection[] {
  if (!sections.length) return sections;
  const ordered = [...sections].sort((a, b) => a.width * a.height - b.width * b.height || a.id.localeCompare(b.id));
  const owners = new Map<string, string>();
  const oldNodes = new Map(previous.nodes.map(node => [node.id, node]));
  const overlaps = (a: FrameRect, b: FrameRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const node of next.nodes) {
    const old = oldNodes.get(node.id);
    const owner = ordered.find(section => old ? containsRect(section, old) : overlaps(section, node));
    if (owner) owners.set(node.id, owner.id);
  }
  // Newly connected shapes inherit the section of the existing diagram.
  // Iterate to cover a pasted chain regardless of connector ordering.
  for (let pass = 0; pass < next.nodes.length; pass++) {
    let changed = false;
    for (const edge of next.edges) {
      for (const [from, to] of [[edge.source.nodeId, edge.target.nodeId], [edge.target.nodeId, edge.source.nodeId]]) {
        if (!from || !to || (oldNodes.has(to) && previous.edges.some(old => old.id === edge.id)) || owners.has(to) || !owners.has(from)) continue;
        owners.set(to, owners.get(from)!); changed = true;
      }
    }
    if (!changed) break;
  }
  const expanded = new Map<string, CanvasSection>();
  function include(section: CanvasSection, box: FrameRect): CanvasSection {
    if (containsRect(section, box)) return section;
    const x = Math.max(-1000000, Math.floor(Math.min(section.x, box.x - 64)));
    const y = Math.max(-1000000, Math.floor(Math.min(section.y, box.y - 80)));
    return { ...section, x, y,
      width: Math.min(100000, Math.ceil(Math.max(section.x + section.width, box.x + box.width + 64) - x)),
      height: Math.min(100000, Math.ceil(Math.max(section.y + section.height, box.y + box.height + 64) - y)) };
  }
  for (const original of ordered) {
    let section = original;
    for (const node of next.nodes) {
      if (owners.get(node.id) === original.id) section = include(section, node);
    }
    for (const child of ordered) {
      if (child.id !== original.id && containsRect(original, child) && expanded.has(child.id)) {
        section = include(section, expanded.get(child.id)!);
      }
    }
    expanded.set(original.id, section);
  }
  const result = sections.map(section => expanded.get(section.id)!);
  return result.every((section, index) => section === sections[index]) ? sections : result;
}
