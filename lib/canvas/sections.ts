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

/** Bounds of all objects fully contained by a section, including nested sections. */
export function fitSectionObjects(section: CanvasSection, sections: CanvasSection[], screens: Screen[], nodes: FrameRect[], heights?: ReadonlyMap<string, number>): FrameRect | null {
  const boxes = [...screens.map(s => frameRect(s, heights)), ...nodes, ...sections.filter(s => s.id !== section.id)].filter(box => containsRect(section, box));
  if (!boxes.length) return null;
  const x=Math.floor(Math.min(...boxes.map(b=>b.x))-64),y=Math.floor(Math.min(...boxes.map(b=>b.y))-80);
  return {x,y,width:Math.max(160,Math.ceil(Math.max(...boxes.map(b=>b.x+b.width))+64-x)),height:Math.max(120,Math.ceil(Math.max(...boxes.map(b=>b.y+b.height))+64-y))};
}
