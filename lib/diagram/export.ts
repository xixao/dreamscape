// PNG/SVG export of a page's diagram (spec docs/superpowers/specs/2026-09-13-
// diagrams-design.md section 8): `renderDiagramSvg` is a pure, fully
// unit-tested renderer that turns nodes, edges and the frames connectors
// attach to into a standalone SVG string mirroring what
// components/workbench/diagram/diagram-layer.tsx draws on screen in every
// case - the same geometry, the same fills, strokes and theme tokens
// translated to hex/rgba, the same edge paths from lib/diagram/geometry.ts,
// the same arrowhead marker, connectors beneath shapes; `svgToPngBlob` is
// the thin browser-only wrapper that rasterises that string at 2x through
// an Image and a canvas. Text is native <text>/<tspan> (never foreignObject,
// which PNG rasterisation and most viewers drop), wrapped with a pluggable
// text measurer so the pure part never touches the DOM. The UI hookup
// (Cmd+A, menu entries, Design panel buttons, the download) is a follow-on
// task; nothing here imports React or reads a store.

import { annotationMeta, annotationFields, stampLabel } from '@/lib/accessibility/kit';
import { tableCells } from './table';
import {
  anchorOnBox,
  bezierControlPoints,
  bounds,
  getBezierPath,
  getHandlePosition,
  getSmoothStepPath,
  getStepPoints,
  getStraightPath,
  sideFromPoint,
  type Box,
  type PathResult,
  type Point,
  type Side,
} from './geometry';
import type { DiagramColor, DiagramEdge, DiagramNode, DiagramSelection, EdgeEndpoint, TextColor, TextFont, TextSize } from './store';

/** A frame (screen) on the page, in canvas coordinates, with the name the export writes inside its outline. */
export interface ExportFrame extends Box {
  id: string;
  name: string;
}

export interface ExportTextFont {
  size: number;
  family: string;
  weight?: number;
}

/**
 * Width in px of `text` set in `font` - canvas `measureText` in the browser
 * (`ctx.font = `${weight} ${size}px ${family}``), a deterministic stub in
 * tests. Wrapping and label chips are sized through this and nothing else.
 */
export type MeasureText = (text: string, font: ExportTextFont) => number;

export interface RenderDiagramSvgInput {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  frames: ExportFrame[];
  // Omitted: everything is exported. Given: the selected nodes, plus every
  // connector that is selected itself, joins two exported nodes, or joins
  // an exported node to a frame - see the filter in renderDiagramSvg.
  selection?: DiagramSelection;
  measureText: MeasureText;
  padding?: number;
}

export interface RenderedDiagramSvg {
  svg: string;
  width: number;
  height: number;
}

// --- Theme ------------------------------------------------------------------
// The screen's tokens (app/globals.css `:root`), mirrored by value so the
// SVG stands alone outside the app; lib/diagram/export.test.ts reads that
// CSS from disk and fails if any of these drift.

// The canvas surface the diagram sits on: `--canvas`, painted by
// components/workbench/canvas.tsx's `bg-canvas` root (not `--background`,
// which is the workbench shell around it).
export const EXPORT_BACKGROUND = '#14121B';
// Spec section 8: "32 px padding around the selection bounds".
export const DEFAULT_EXPORT_PADDING = 32;
// `--acc`: the on-screen marker is `fill-(--acc)` (diagram-layer.tsx).
const ARROWHEAD_FILL = '#8C97DB';
// The CHIP surface a label sits in (components/workbench/chrome.ts CHIP:
// `bg-(--chip)`, border `--bevel-line`) and the `--foreground` its text
// inherits from body.
const LABEL_CHIP_FILL = 'rgba(34,33,46,0.95)';
const LABEL_CHIP_STROKE = 'rgba(255,255,255,0.6)';
const LABEL_TEXT_FILL = '#EAE8F0';

// The app's font stacks (app/layout.tsx loads Archivo and IBM Plex Mono via
// next/font) with generic fallbacks; no font files are embedded, so a
// viewer without the fonts falls back gracefully.
export const SHAPE_FONT: ExportTextFont = { size: 24, family: "Archivo, 'Helvetica Neue', Arial, sans-serif", weight: 400 };
export const LABEL_FONT: ExportTextFont = { size: 10.5, family: "'IBM Plex Mono', ui-monospace, Menlo, monospace", weight: 400 };

// On-screen equivalents: the shape text is a 24 px flex-centred div with
// 6 px padding (`p-1.5`) and overflow hidden whose `text-[24px]` sets only
// the font size, so it inherits body's `line-height: 1.45`
// (app/globals.css); the label a `font-mono text-[10.5px]` CHIP; strokes
// 1.5 px at zoom 1.
const SHAPE_LINE_HEIGHT = 1.45;
const SHAPE_TEXT_INSET = 6;
const SHAPE_STROKE_WIDTH = 1.5;
const TEXT_FILL = '#ffffff';
const EDGE_STROKE = 'rgba(255,255,255,0.6)';
const EDGE_STROKE_WIDTH = 1.5;
// Spec section 14: the on-screen dashed pattern (diagram-layer.tsx) at
// zoom 1, i.e. with no /zoom scaling - that scaling is a canvas-only
// runtime concern this standalone export never has.
const EDGE_DASH_ON = 4;
const EDGE_DASH_OFF = 3;
const LABEL_PADDING_X = 8;
function connectorFont(edge: DiagramEdge): ExportTextFont { return {size: edge.textSize ? SHAPE_FONT_SIZES[edge.textSize] : LABEL_FONT.size, family: edge.textFont ? SHAPE_FONT_FAMILIES[edge.textFont] : LABEL_FONT.family, weight: edge.textBold ? 700 : 400}; }
const LABEL_HEIGHT = 20;
const LABEL_RADIUS = 0;
// A frame is live HTML, never rasterised: an attached one is drawn as a 1 px
// outline carrying its name, nothing else (spec section 8).
const FRAME_STROKE = 'rgba(255,255,255,0.5)';
const FRAME_STROKE_WIDTH = 1;
const FRAME_NAME_SIZE = 12;
const FRAME_NAME_INSET = 8;
const ARROWHEAD_ID = 'diagram-export-arrowhead';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/**
 * What diagram-layer.tsx's COLOR_CLASSES (`fill-zinc-800 stroke-zinc-400`,
 * `fill-blue-500/25 stroke-blue-400`, ...) resolve to on screen, as
 * concrete values an SVG viewer understands. The hex values are the sRGB
 * rendering of Tailwind 4's oklch tokens in node_modules/tailwindcss/
 * theme.css (CSS Color 4 OKLab maths, per-channel clipped to the sRGB gamut
 * - the same numbers Tailwind's own colour reference lists), converted once
 * with a throwaway script and hard-coded here; a `/25` fill is that colour
 * at alpha 0.25.
 */
export const DIAGRAM_EXPORT_COLORS: Record<DiagramColor, { fill: string; stroke: string }> = {
  // Opaque neutral shapes remain visible over light frames too.
  neutral: { fill: '#27272a', stroke: '#9f9fa9' },
  // --color-blue-500 oklch(62.3% 0.214 259.815) = #2b7fff; --color-blue-400 oklch(70.7% 0.165 254.624) = #51a2ff
  blue: { fill: 'rgba(43,127,255,0.25)', stroke: '#51a2ff' },
  // --color-green-500 oklch(72.3% 0.219 149.579) = #00c950; --color-green-400 oklch(79.2% 0.209 151.711) = #05df72
  green: { fill: 'rgba(0,201,80,0.25)', stroke: '#05df72' },
  // --color-amber-500 oklch(76.9% 0.188 70.08) = #fe9a00; --color-amber-400 oklch(82.8% 0.189 84.429) = #ffb900
  amber: { fill: 'rgba(254,154,0,0.25)', stroke: '#ffb900' },
  // --color-red-500 oklch(63.7% 0.237 25.331) = #fb2c36; --color-red-400 oklch(70.4% 0.191 22.216) = #ff6467
  red: { fill: 'rgba(251,44,54,0.25)', stroke: '#ff6467' },
  // --color-violet-500 oklch(60.6% 0.25 292.717) = #8e51ff; --color-violet-400 oklch(70.2% 0.183 293.541) = #a684ff
  violet: { fill: 'rgba(142,81,255,0.25)', stroke: '#a684ff' },
};

// Spec section 9 ("give the diagram shapes a font selection like small,
// medium, large... a monospaced font, a serif font, and a sans serif
// font... let me change the color of the fonts independently from the
// shape's colors"): a shape's own optional textSize/textFont/textColor
// (lib/diagram/store.ts), mirrored here the same way DIAGRAM_EXPORT_COLORS
// above mirrors the shape's own fill/stroke - defaulted (medium/sans/
// default) to exactly SHAPE_FONT/TEXT_FILL's own former fixed values, so a
// node with none of the three set (every file exported before this
// feature) renders identically to before.
// Matt, 2026-09-14: first widened from the original 11/13/16 to 10/14/20
// (a clearer step between each size), then replaced outright with five
// explicit sizes and labels he gave directly ("the font sizes for the
// diagramming text element should be: 16, 24, 40, 64, 96" /
// "use the labels: small, medium, large, extra large, huge").
export const SHAPE_FONT_SIZES: Record<TextSize, number> = { small: 16, medium: 24, large: 40, xlarge: 64, huge: 96 };
// The three family strings the Design panel's Font select offers: sans is
// SHAPE_FONT's own stack (the app's default, app/layout.tsx's Archivo), a
// system serif stack for serif, and LABEL_FONT's own IBM Plex Mono stack
// for mono - one string, not a duplicated literal, for whichever of the
// two already-existing fonts is reused.
export const SHAPE_FONT_FAMILIES: Record<TextFont, string> = {
  sans: SHAPE_FONT.family,
  serif: "Georgia, 'Times New Roman', serif",
  mono: LABEL_FONT.family,
};
// 'default' and 'black' bracket the six DIAGRAM_EXPORT_COLORS stroke tones
// (the same *-400 hex already used for a shape's OWN stroke, reused rather
// than duplicated) - 'neutral' is its own literal gray here rather than
// DIAGRAM_EXPORT_COLORS.neutral.stroke's zinc shade, since shape
// text needs an actual visible tone regardless of the shape's own fill.
export const SHAPE_TEXT_COLORS: Record<TextColor, string> = {
  default: TEXT_FILL,
  // --color-neutral-400 oklch(70.8% 0 none) = #a1a1a1
  neutral: '#a1a1a1',
  blue: DIAGRAM_EXPORT_COLORS.blue.stroke,
  green: DIAGRAM_EXPORT_COLORS.green.stroke,
  amber: DIAGRAM_EXPORT_COLORS.amber.stroke,
  red: DIAGRAM_EXPORT_COLORS.red.stroke,
  violet: DIAGRAM_EXPORT_COLORS.violet.stroke,
  black: '#000000',
};

/** The concrete font a shape's own optional textSize/textFont resolve to, defaulting to medium/sans - today's only look - when absent. */
function shapeFont(node: DiagramNode): ExportTextFont {
  return {
    size: SHAPE_FONT_SIZES[node.textSize ?? 'medium'],
    family: SHAPE_FONT_FAMILIES[node.textFont ?? 'sans'],
    weight: 400,
  };
}

// --- XML assembly ---------------------------------------------------------

/** Numbers as attribute text: at most three decimals, no floating-point noise, no "-0". */
function fmt(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * Path data with every number written through fmt: geometry.ts hands back
 * raw floats (a bezier control point at -24.000000000000007), the export
 * writes -24. Only M/L/C/Q coordinates ever appear, so every number in the
 * string is a coordinate.
 */
function formatPath(d: string): string {
  return d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => fmt(Number(n)));
}

const XML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/**
 * Every piece of user text (shape text, labels, frame names, ids) goes
 * through this: the five XML-special characters become entities, and
 * anything that is not an XML character at all is dropped - the C0
 * controls other than tab, newline and carriage return, lone surrogates
 * (iterating by code point, a surrogate that failed to pair comes through
 * as a single unit in D800-DFFF) and the two non-characters U+FFFE and
 * U+FFFF - so text from a corrupted file can never produce a document a
 * parser rejects.
 */
function escapeXml(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    if (code >= 0xd800 && code <= 0xdfff) continue;
    if (code === 0xfffe || code === 0xffff) continue;
    out += XML_ENTITIES[char] ?? char;
  }
  return out;
}

type AttributeValue = string | number | undefined;

function attributes(values: Record<string, AttributeValue>): string {
  let out = '';
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    out += ` ${name}="${typeof value === 'number' ? fmt(value) : escapeXml(value)}"`;
  }
  return out;
}

/** `children` is already-serialised markup or already-escaped text: callers escape user text themselves. */
function element(tag: string, values: Record<string, AttributeValue>, children?: string): string {
  const open = `<${tag}${attributes(values)}`;
  return children === undefined ? `${open}/>` : `${open}>${children}</${tag}>`;
}

// --- Text wrapping ---------------------------------------------------------

/**
 * Greedy word wrap to `maxWidth` px, the way the on-screen
 * `whitespace-pre-wrap break-words` div lays text out: explicit newlines
 * always break (a blank line stays a blank line), words fill each line
 * while they fit, and a single word wider than the whole line is broken
 * character by character. Always makes progress - a width too narrow for
 * even one character still yields one character per line.
 */
function wrapText(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') {
        lines.push(line);
        line = '';
      }
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = '';
      for (const char of word) {
        const next = chunk + char;
        if (chunk !== '' && measure(next) > maxWidth) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }
    lines.push(line);
  }
  return lines;
}

// --- Elements ----------------------------------------------------------------

function center(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function pointBox(point: Point): Box {
  return { x: point.x, y: point.y, width: 0, height: 0 };
}

function shapeText(box: Box, node: DiagramNode, measureText: MeasureText): string {
  if (node.text === '') return '';
  const font = shapeFont(node);
  const fill = SHAPE_TEXT_COLORS[node.textColor ?? 'default'];
  const innerWidth = box.width - 2 * SHAPE_TEXT_INSET;
  const innerHeight = box.height - 2 * SHAPE_TEXT_INSET;
  const lineHeight = font.size * SHAPE_LINE_HEIGHT;
  // Lines past the inner height are dropped from the END - a deliberate
  // deviation from the screen, where the overflow-hidden flex block stays
  // centred and clips its first and last lines equally: an export that
  // keeps the opening lines reads better than one that shows the middle of
  // a paragraph. The first line always survives so a tiny box is never
  // blank.
  const maxLines = Math.max(1, Math.floor(innerHeight / lineHeight));
  const lines = wrapText(node.text, innerWidth, (line) => measureText(line, font)).slice(0, maxLines);
  const { x: centerX, y: centerY } = center(box);
  const textX = node.textAlign === 'left' ? box.x + SHAPE_TEXT_INSET : node.textAlign === 'right' ? box.x + box.width - SHAPE_TEXT_INSET : centerX;
  const top = centerY - (lines.length * lineHeight) / 2;
  const spans = lines
    .map((line, index) => element('tspan', { x: textX, y: top + (index + 0.5) * lineHeight }, escapeXml(line)))
    .join('');
  return element(
    'text',
    {
      x: textX,
      fill,
      'font-family': font.family,
      'font-size': font.size,
      'text-anchor': node.textAlign === 'left' ? 'start' : node.textAlign === 'right' ? 'end' : 'middle',
      'dominant-baseline': 'central',
      'xml:space': 'preserve',
    },
    spans,
  );
}

function renderAnnotation(node: DiagramNode, box: Box, measureText: MeasureText): string {
  const a = node.annotation!;
  const color = annotationMeta(a).color;
  const title = a.format === 'summary' ? 'Annotation Summary' : a.format === 'card' ? `${a.number}  ${a.values.title || annotationMeta(a).label}` : `${stampLabel(a)}${a.showNumber ? `  ${a.number}` : ''}`;
  const font = {family:'Arial, sans-serif',size:14,weight:400};
  const text = (value:string,x:number,y:number,fill='#202020',bold=false) => element('text', {x,y,fill,'font-family':font.family,'font-size':14,'font-weight':bold?700:400},escapeXml(value));
  let output = '';
  if (a.format === 'card' || a.format === 'summary' || a.format === 'sticky') {
    output += element('rect',{...box,rx:5,fill:a.format==='sticky'?'#FFF1B8':'#fff',stroke:color});
    output += element('rect',{x:box.x,y:box.y,width:box.width,height:34,fill:a.library==='designer'?(a.format==='sticky'?'#FFF1B8':'#fff'):color});
    output += text(title,box.x+12,box.y+22,a.library==='designer'?'#202020':'#fff',true);
    let y=box.y+56;
    if(a.format==='card') {output+=text(`Audience: ${a.audience}`,box.x+12,y);y+=24;}
    for(const field of annotationFields(a)) {
      if(!a.values[field.key])continue;
      if(y>box.y+box.height-36)break;
      output+=text(field.label,box.x+12,y,'#202020',true);y+=18;
      for(const line of wrapText(a.values[field.key],box.width-24,l=>measureText(l,font))) {
        if(y>box.y+box.height-36)break;
        output+=text(line,box.x+12,y);y+=18;
      }
      y+=12;
    }
    if(a.format==='card')output+=text(a.resolved?'Resolved':'Not resolved',box.x+12,box.y+box.height-12);
  } else {
    const horizontal=a.position==='left'||a.position==='right';
    const reverse=a.position==='right'||a.position==='below';
    const pillWidth=Math.min(box.width,measureText(title,font)+24);
    const px=horizontal?(reverse?box.x+box.width-pillWidth:box.x):box.x+(box.width-pillWidth)/2;
    const py=horizontal||a.position==='center'?box.y+(box.height-32)/2:reverse?box.y+box.height-32:box.y;
    if(a.position!=='center') {
      const x1=horizontal?(reverse?px: px+pillWidth):px+pillWidth/2;
      const y1=horizontal?py+16:reverse?py:py+32;
      const x2=horizontal?(reverse?box.x:box.x+box.width):x1;
      const y2=horizontal?y1:reverse?box.y:box.y+box.height;
      output+=element('line',{x1,y1,x2,y2,stroke:color,'stroke-width':2,opacity:.45});
      if(a.format==='pin')output+=element('circle',{cx:x2,cy:y2,r:4,fill:color});
      else output+=element('rect',{x:horizontal?(reverse?box.x:px+pillWidth+16):box.x,y:horizontal?box.y:reverse?box.y:py+48,width:horizontal?Math.max(20,box.width-pillWidth-16):box.width,height:horizontal?box.height:Math.max(20,box.height-48),fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':a.format==='bracket'?'none':'4 4'});
    }
    output+=element('rect',{x:px,y:py,width:pillWidth,height:32,rx:16,fill:color});
    output+=text(title,px+12,py+21,'#fff',true);
  }
  return element('g',{'data-node':node.id,'data-annotation':a.category,opacity:a.resolved?.6:1},output);
}

function renderNode(node: DiagramNode, box: Box, measureText: MeasureText): string {
  if (node.annotation) return renderAnnotation(node, box, measureText);
  const colors = DIAGRAM_EXPORT_COLORS[node.color];
  const paint = { fill: colors.fill, stroke: colors.stroke, 'stroke-width': SHAPE_STROKE_WIDTH };
  let shape = '';
  if (node.kind === 'decision') {
    const points = [
      `${fmt(box.x + box.width / 2)},${fmt(box.y)}`,
      `${fmt(box.x + box.width)},${fmt(box.y + box.height / 2)}`,
      `${fmt(box.x + box.width / 2)},${fmt(box.y + box.height)}`,
      `${fmt(box.x)},${fmt(box.y + box.height / 2)}`,
    ].join(' ');
    shape = element('polygon', { points, ...paint });
  } else if (node.kind !== 'text') {
    const rx = node.kind === 'terminal' ? box.height / 2 : node.kind === 'rounded' ? 12 : node.kind === 'note' ? 2 : 0;
    shape = element('rect', { x: box.x, y: box.y, width: box.width, height: box.height, rx, ...paint });
  }
  if (node.kind === 'table') {
    const cells = tableCells(node);
    const width = box.width / cells[0].length;
    const height = box.height / cells.length;
    let content = '';
    cells.forEach((row, r) => row.forEach((text, c) => {
      const cell = { x: box.x + c * width, y: box.y + r * height, width, height };
      content += element('rect', { ...cell, fill: r === 0 ? 'rgba(255,255,255,0.1)' : 'none', stroke: colors.stroke, 'stroke-width': 1 });
      const font = shapeFont(node);
      let label = text.replace(/\s+/g, ' ');
      while (label.length && measureText(label, font) > width - 16) label = label.slice(0, -1);
      content += element('text', { x: node.textAlign === 'right' ? cell.x + width - 8 : node.textAlign === 'center' ? cell.x + width / 2 : cell.x + 8, 'text-anchor': node.textAlign === 'right' ? 'end' : node.textAlign === 'center' ? 'middle' : 'start', y: cell.y + height / 2, fill: SHAPE_TEXT_COLORS[node.textColor ?? 'default'], 'font-family': font.family, 'font-size': font.size, 'font-weight': r === 0 ? 600 : 400, 'dominant-baseline': 'central' }, escapeXml(label));
    }));
    return element('g', { 'data-node': node.id, 'data-kind': node.kind }, shape + content);
  }
  return element('g', { 'data-node': node.id, 'data-kind': node.kind }, shape + shapeText(box, node, measureText));
}

function renderFrame(frame: ExportFrame, box: Box): string {
  const outline = element('rect', {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fill: 'none',
    stroke: FRAME_STROKE,
    'stroke-width': FRAME_STROKE_WIDTH,
  });
  const name = element(
    'text',
    {
      x: box.x + FRAME_NAME_INSET,
      y: box.y + FRAME_NAME_INSET + FRAME_NAME_SIZE / 2,
      fill: FRAME_STROKE,
      'font-family': SHAPE_FONT.family,
      'font-size': FRAME_NAME_SIZE,
      'dominant-baseline': 'central',
    },
    escapeXml(frame.name),
  );
  return element('g', { 'data-frame': frame.id }, outline + name);
}

/**
 * The side an edge leaves or arrives on: the stored one when present,
 * otherwise whichever side of `box` faces the OTHER endpoint's centre -
 * the same fallback diagram-layer.tsx's resolveEndpoint uses for an edge
 * saved before a side was chosen. The anchorOnBox round trip is that
 * function's own (sideFromPoint of a side's handle is that side again, so
 * this equals sideFromPoint(box, center(other))); kept as written there so
 * the two stay line-for-line comparable.
 */
function resolveSide(endpoint: EdgeEndpoint, box: Box, other: Box): Side {
  if (endpoint.side && (SIDES as readonly string[]).includes(endpoint.side)) return endpoint.side;
  return sideFromPoint(box, anchorOnBox(box, center(other)));
}

interface ResolvedEdge {
  route: PathResult;
  chip: Box | null;
  // Everything the connector draws outside its two endpoint boxes, for the
  // export's bounds: a curve's control points and a step's corners (each
  // path lies inside the hull of those points), plus the label chip.
  extent: Box[];
}

/** The path, chip rect and extent of `edge` between two boxes, in whichever space the boxes are in. */
function resolveEdge(edge: DiagramEdge, sourceBox: Box, targetBox: Box, chipWidth: number | undefined): ResolvedEdge {
  const sourceSide = resolveSide(edge.source, sourceBox, targetBox);
  const targetSide = resolveSide(edge.target, targetBox, sourceBox);
  const sourcePoint = getHandlePosition(sourceBox, sourceSide);
  const targetPoint = getHandlePosition(targetBox, targetSide);
  let route: PathResult;
  let extent: Box[];
  if (edge.kind === 'straight') {
    route = getStraightPath(sourcePoint, targetPoint);
    extent = [];
  } else if (edge.kind === 'curve') {
    route = getBezierPath(sourcePoint, sourceSide, targetPoint, targetSide);
    const { c1, c2 } = bezierControlPoints(sourcePoint, sourceSide, targetPoint, targetSide);
    extent = [pointBox(c1), pointBox(c2)];
  } else {
    route = getSmoothStepPath(sourcePoint, sourceSide, targetPoint, targetSide);
    extent = getStepPoints(sourcePoint, sourceSide, targetPoint, targetSide).map(pointBox);
  }
  if (edge.labelPosition !== undefined && typeof document !== 'undefined') {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', route.path);
    if (typeof path.getTotalLength === 'function') {
      const point = path.getPointAtLength(path.getTotalLength() * edge.labelPosition);
      route = {...route, labelX: point.x, labelY: point.y};
    }
  }
  const chip =
    chipWidth === undefined
      ? null
      : { x: route.labelX - chipWidth / 2, y: route.labelY - (edge.textSize ? connectorFont(edge).size * 1.6 + 8 : LABEL_HEIGHT) / 2, width: chipWidth, height: edge.textSize ? connectorFont(edge).size * 1.6 + 8 : LABEL_HEIGHT };
  if (chip) extent.push(chip);
  return { route, chip, extent };
}

function renderEdge(edge: DiagramEdge, resolved: ResolvedEdge): string {
  const marker = `url(#${ARROWHEAD_ID})`;
  const path = element('path', {
    d: formatPath(resolved.route.path),
    fill: 'none',
    stroke: EDGE_STROKE,
    'stroke-width': EDGE_STROKE_WIDTH,
    // Spec section 14: the same dash pattern the canvas uses at zoom 1
    // (diagram-layer.tsx's `${4 / zoom} ${3 / zoom}`), written in plain,
    // unscaled canvas units through the same fmt() every other number here
    // goes through - /zoom is a canvas-only runtime concern, not something
    // a standalone export file has.
    'stroke-dasharray': edge.lineStyle === 'dashed' ? `${fmt(EDGE_DASH_ON)} ${fmt(EDGE_DASH_OFF)}` : undefined,
    'marker-end': edge.arrow === 'end' || edge.arrow === 'both' ? marker : undefined,
    'marker-start': edge.arrow === 'both' ? marker : undefined,
  });
  let chip = '';
  if (edge.label && resolved.chip) {
    chip =
      element('rect', {
        x: resolved.chip.x,
        y: resolved.chip.y,
        width: resolved.chip.width,
        height: resolved.chip.height,
        rx: LABEL_RADIUS,
        fill: LABEL_CHIP_FILL,
        stroke: LABEL_CHIP_STROKE,
        'stroke-dasharray': '1 3',
      }) +
      element(
        'text',
        {
          x: resolved.route.labelX,
          y: resolved.route.labelY,
          fill: LABEL_TEXT_FILL,
          'font-family': connectorFont(edge).family,
          'font-size': connectorFont(edge).size,
          'font-weight': connectorFont(edge).weight,
          'font-style': edge.textItalic ? 'italic' : 'normal',
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        },
        escapeXml(edge.label),
      );
  }
  return element('g', { 'data-edge': edge.id }, path + chip);
}

// The on-screen marker (diagram-layer.tsx `#diagram-arrowhead`) verbatim,
// filled with the accent colour it uses there.
const ARROWHEAD_DEFS = element(
  'defs',
  {},
  element(
    'marker',
    { id: ARROWHEAD_ID, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
    element('path', { d: 'M0,0 L10,5 L0,10 z', fill: ARROWHEAD_FILL }),
  ),
);

// --- Entry points --------------------------------------------------------------

function boxFor(endpoint: EdgeEndpoint, nodeBoxes: ReadonlyMap<string, Box>, frameBoxes: ReadonlyMap<string, Box>): Box | undefined {
  return endpoint.nodeId ? nodeBoxes.get(endpoint.nodeId) : endpoint.screenId ? frameBoxes.get(endpoint.screenId) : undefined;
}

/**
 * The SVG document for a diagram (or the selected part of it) plus its
 * pixel size, or `null` when nothing is exportable. Canvas units at zoom 1,
 * translated so the padded bounds of everything drawn start at 0,0;
 * deterministic for the same input. Drawn in the screen's own order: the
 * frame outlines, then the connectors, then the shapes (each in array
 * order), so a connector passes beneath a shape and an arrowhead tucks
 * under a border exactly as in diagram-layer.tsx.
 */
export function renderDiagramSvg(input: RenderDiagramSvgInput): RenderedDiagramSvg | null {
  const padding = input.padding ?? DEFAULT_EXPORT_PADDING;
  const selectedNodeIds = input.selection ? new Set(input.selection.filter((item) => item.type === 'node').map((item) => item.id)) : null;
  const selectedEdgeIds = input.selection ? new Set(input.selection.filter((item) => item.type === 'edge').map((item) => item.id)) : null;

  const nodes = input.nodes.filter((node) => selectedNodeIds === null || selectedNodeIds.has(node.id));
  const nodeBoxes = new Map<string, Box>(nodes.map((node) => [node.id, node]));
  const frameBoxes = new Map<string, Box>(input.frames.map((frame) => [frame.id, frame]));

  // Which connectors come along - the export mirrors the screen, where a
  // connector shows whenever both of its ends are visible. An end resolves
  // when it is an exported node or an existing frame; a connector whose
  // two ends resolve is exported when there is no selection, when it is
  // itself selected, when it joins two exported nodes, or when it joins an
  // exported node to a frame. So Shift+clicking two connected shapes
  // exports the connector between them, while a selected connector whose
  // node end is not exported is dropped (and no frame is drawn for it), and
  // an unselected frame-to-frame connector never drags frames in on its
  // own.
  const exportedEdges: { edge: DiagramEdge; source: Box; target: Box }[] = [];
  for (const edge of input.edges) {
    const source = boxFor(edge.source, nodeBoxes, frameBoxes);
    const target = boxFor(edge.target, nodeBoxes, frameBoxes);
    if (!source || !target) continue;
    const selected = selectedEdgeIds === null || selectedEdgeIds.has(edge.id);
    const joinsAnExportedNode = Boolean(edge.source.nodeId || edge.target.nodeId);
    if (!selected && !joinsAnExportedNode) continue;
    exportedEdges.push({ edge, source, target });
  }
  const attachedFrameIds = new Set<string>();
  for (const { edge } of exportedEdges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!endpoint.nodeId && endpoint.screenId) attachedFrameIds.add(endpoint.screenId);
    }
  }
  const frames = input.frames.filter((frame) => attachedFrameIds.has(frame.id));

  if (nodes.length === 0 && exportedEdges.length === 0) return null;

  const chipWidths = new Map<string, number>();
  for (const { edge } of exportedEdges) {
    if (edge.label) chipWidths.set(edge.id, input.measureText(edge.label, connectorFont(edge)) + 2 * LABEL_PADDING_X);
  }

  // Canvas-space pass: the bounds cover the shapes, the attached frames and
  // everything the connectors draw (control points, step corners, label
  // chips), so the padding is measured from what actually lands on the
  // page and nothing is clipped.
  const extent = bounds([
    ...nodes,
    ...frames,
    ...exportedEdges.flatMap(({ edge, source, target }) => resolveEdge(edge, source, target, chipWidths.get(edge.id)).extent),
  ]);
  if (!extent) return null;

  const width = Number(fmt(extent.width + 2 * padding));
  const height = Number(fmt(extent.height + 2 * padding));
  const offsetX = padding - extent.x;
  const offsetY = padding - extent.y;
  const shift = (box: Box): Box => ({ x: box.x + offsetX, y: box.y + offsetY, width: box.width, height: box.height });

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    ARROWHEAD_DEFS,
    element('rect', { x: 0, y: 0, width, height, fill: EXPORT_BACKGROUND }),
  ];
  for (const frame of frames) parts.push(renderFrame(frame, shift(frame)));
  for (const { edge, source, target } of exportedEdges) {
    parts.push(renderEdge(edge, resolveEdge(edge, shift(source), shift(target), chipWidths.get(edge.id))));
  }
  for (const node of nodes) parts.push(renderNode(node, shift(node), input.measureText));
  parts.push('</svg>');

  return { svg: parts.join('\n'), width, height };
}

function readSvgSize(svg: string): { width: number; height: number } {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const read = (name: 'width' | 'height'): number => {
    const match = new RegExp(`\\s${name}="([^"]+)"`).exec(root);
    return match ? Number(match[1]) : Number.NaN;
  };
  const width = read('width');
  const height = read('height');
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('The SVG root needs numeric width and height attributes to be rasterised.');
  }
  return { width, height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The SVG could not be loaded as an image for the PNG export.'));
    image.src = url;
  });
}

/**
 * Browser-only: rasterises an SVG string (from renderDiagramSvg, or any SVG
 * whose root carries numeric width/height attributes) to a PNG Blob at
 * `scale` x (default 2, spec section 8: "at 2x"). The SVG travels through an
 * object URL that is always revoked, success or failure; the background
 * rect is part of the drawing, so the PNG is opaque.
 */
export async function svgToPngBlob(svg: string, options: { scale?: number } = {}): Promise<Blob> {
  const scale = options.scale ?? 2;
  const { width, height } = readSvgSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser gave no 2D canvas context for the PNG export.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser produced no PNG data.'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
