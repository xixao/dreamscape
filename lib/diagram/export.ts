// PNG/SVG export of a page's diagram (spec docs/superpowers/specs/2026-09-13-
// diagrams-design.md section 8): `renderDiagramSvg` is a pure, fully
// unit-tested renderer that turns nodes, edges and the frames connectors
// attach to into a standalone SVG string mirroring what
// components/workbench/diagram/diagram-layer.tsx draws on screen (same
// geometry, same fills and strokes translated to hex/rgba, same edge paths
// from lib/diagram/geometry.ts, same arrowhead marker); `svgToPngBlob` is
// the thin browser-only wrapper that rasterises that string at 2x through an
// Image and a canvas. Text is native <text>/<tspan> (never foreignObject,
// which PNG rasterisation and most viewers drop), wrapped with a pluggable
// text measurer so the pure part never touches the DOM. The UI hookup
// (Cmd+A, menu entries, Design panel buttons, the download) is a follow-on
// task; nothing here imports React or reads a store.

import {
  anchorOnBox,
  bounds,
  getBezierPath,
  getHandlePosition,
  getSmoothStepPath,
  getStraightPath,
  sideFromPoint,
  type Box,
  type Point,
  type Side,
} from './geometry';
import type { DiagramColor, DiagramEdge, DiagramNode, DiagramSelection, EdgeEndpoint } from './store';

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
  // Omitted: everything is exported. Given: the selected nodes, plus the
  // selected edges whose two ends are each a selected node or a frame
  // (spec: "Connectors are exported only when both ends are in the
  // selection or attach to a frame").
  selection?: DiagramSelection;
  measureText: MeasureText;
  padding?: number;
}

export interface RenderedDiagramSvg {
  svg: string;
  width: number;
  height: number;
}

// The canvas surface the diagram sits on (app/globals.css `--background`).
export const EXPORT_BACKGROUND = '#1B1922';
// Spec section 8: "32 px padding around the selection bounds".
export const DEFAULT_EXPORT_PADDING = 32;

// The app's font stacks (app/layout.tsx loads Archivo and IBM Plex Mono via
// next/font) with generic fallbacks; no font files are embedded, so a
// viewer without the fonts falls back gracefully.
export const SHAPE_FONT: ExportTextFont = { size: 13, family: "Archivo, 'Helvetica Neue', Arial, sans-serif", weight: 400 };
export const LABEL_FONT: ExportTextFont = { size: 10.5, family: "'IBM Plex Mono', ui-monospace, Menlo, monospace", weight: 400 };

// On-screen equivalents: the shape text is a 13 px flex-centred div with
// 6 px padding (`p-1.5`) and overflow hidden; the label a `font-mono
// text-[10.5px]` chip; strokes 1.5 px at zoom 1.
const SHAPE_LINE_HEIGHT = 1.25;
const SHAPE_TEXT_INSET = 6;
const SHAPE_STROKE_WIDTH = 1.5;
const TEXT_FILL = '#ffffff';
const EDGE_STROKE = 'rgba(255,255,255,0.6)';
const EDGE_STROKE_WIDTH = 1.5;
const LABEL_PADDING_X = 8;
const LABEL_HEIGHT = 20;
const LABEL_RADIUS = 4;
const LABEL_FILL = EXPORT_BACKGROUND;
const LABEL_STROKE = 'rgba(255,255,255,0.2)';
// A frame is live HTML, never rasterised: an attached one is drawn as a 1 px
// outline carrying its name, nothing else (spec section 8).
const FRAME_STROKE = 'rgba(255,255,255,0.5)';
const FRAME_STROKE_WIDTH = 1;
const FRAME_NAME_SIZE = 12;
const FRAME_NAME_INSET = 8;
const ARROWHEAD_ID = 'diagram-export-arrowhead';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/**
 * What diagram-layer.tsx's COLOR_CLASSES (`fill-white/10 stroke-white/50`,
 * `fill-blue-500/25 stroke-blue-400`, ...) resolve to on screen, as
 * concrete values an SVG viewer understands. The hex values are the sRGB
 * rendering of Tailwind 4's oklch tokens in node_modules/tailwindcss/
 * theme.css (CSS Color 4 OKLab maths, per-channel clipped to the sRGB gamut
 * - the same numbers Tailwind's own colour reference lists), converted once
 * with a throwaway script and hard-coded here; a `/25` fill is that colour
 * at alpha 0.25.
 */
export const DIAGRAM_EXPORT_COLORS: Record<DiagramColor, { fill: string; stroke: string }> = {
  // fill-white/10, stroke-white/50
  neutral: { fill: 'rgba(255,255,255,0.1)', stroke: 'rgba(255,255,255,0.5)' },
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

// --- XML assembly ---------------------------------------------------------

/** Numbers as attribute text: at most three decimals, no floating-point noise, no "-0". */
function fmt(value: number): string {
  return String(Number(value.toFixed(3)));
}

const XML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/**
 * Every piece of user text (shape text, labels, frame names, ids) goes
 * through this: the five XML-special characters become entities, and the
 * control characters XML 1.0 forbids outright (anything below U+0020 other
 * than tab, newline and carriage return) are dropped so pasted text can
 * never produce a document a parser rejects.
 */
function escapeXml(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
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

function shapeText(box: Box, text: string, measureText: MeasureText): string {
  if (text === '') return '';
  const innerWidth = box.width - 2 * SHAPE_TEXT_INSET;
  const innerHeight = box.height - 2 * SHAPE_TEXT_INSET;
  const lineHeight = SHAPE_FONT.size * SHAPE_LINE_HEIGHT;
  // The on-screen div is overflow hidden: lines past the inner height are
  // dropped (the first line always survives so a tiny box is never blank).
  const maxLines = Math.max(1, Math.floor(innerHeight / lineHeight));
  const lines = wrapText(text, innerWidth, (line) => measureText(line, SHAPE_FONT)).slice(0, maxLines);
  const { x: centerX, y: centerY } = center(box);
  const top = centerY - (lines.length * lineHeight) / 2;
  const spans = lines
    .map((line, index) => element('tspan', { x: centerX, y: top + (index + 0.5) * lineHeight }, escapeXml(line)))
    .join('');
  return element(
    'text',
    {
      x: centerX,
      fill: TEXT_FILL,
      'font-family': SHAPE_FONT.family,
      'font-size': SHAPE_FONT.size,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'xml:space': 'preserve',
    },
    spans,
  );
}

function renderNode(node: DiagramNode, box: Box, measureText: MeasureText): string {
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
  return element('g', { 'data-node': node.id, 'data-kind': node.kind }, shape + shapeText(box, node.text, measureText));
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
 * saved before a side was chosen.
 */
function resolveSide(endpoint: EdgeEndpoint, box: Box, other: Box): Side {
  if (endpoint.side && (SIDES as readonly string[]).includes(endpoint.side)) return endpoint.side;
  return sideFromPoint(box, anchorOnBox(box, center(other)));
}

function renderEdge(edge: DiagramEdge, sourceBox: Box, targetBox: Box, measureText: MeasureText): string {
  const sourceSide = resolveSide(edge.source, sourceBox, targetBox);
  const targetSide = resolveSide(edge.target, targetBox, sourceBox);
  const sourcePoint = getHandlePosition(sourceBox, sourceSide);
  const targetPoint = getHandlePosition(targetBox, targetSide);
  const route =
    edge.kind === 'straight'
      ? getStraightPath(sourcePoint, targetPoint)
      : edge.kind === 'curve'
        ? getBezierPath(sourcePoint, sourceSide, targetPoint, targetSide)
        : getSmoothStepPath(sourcePoint, sourceSide, targetPoint, targetSide);
  const marker = `url(#${ARROWHEAD_ID})`;
  const path = element('path', {
    d: route.path,
    fill: 'none',
    stroke: EDGE_STROKE,
    'stroke-width': EDGE_STROKE_WIDTH,
    'marker-end': edge.arrow === 'end' || edge.arrow === 'both' ? marker : undefined,
    'marker-start': edge.arrow === 'both' ? marker : undefined,
  });
  let chip = '';
  if (edge.label) {
    const width = measureText(edge.label, LABEL_FONT) + 2 * LABEL_PADDING_X;
    chip =
      element('rect', {
        x: route.labelX - width / 2,
        y: route.labelY - LABEL_HEIGHT / 2,
        width,
        height: LABEL_HEIGHT,
        rx: LABEL_RADIUS,
        fill: LABEL_FILL,
        stroke: LABEL_STROKE,
      }) +
      element(
        'text',
        {
          x: route.labelX,
          y: route.labelY,
          fill: TEXT_FILL,
          'font-family': LABEL_FONT.family,
          'font-size': LABEL_FONT.size,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        },
        escapeXml(edge.label),
      );
  }
  return element('g', { 'data-edge': edge.id }, path + chip);
}

// The on-screen marker (diagram-layer.tsx `#diagram-arrowhead`) verbatim,
// filled white instead of the accent colour so it reads on the dark
// background of a file viewed outside the app.
const ARROWHEAD_DEFS = element(
  'defs',
  {},
  element(
    'marker',
    { id: ARROWHEAD_ID, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
    element('path', { d: 'M0,0 L10,5 L0,10 z', fill: TEXT_FILL }),
  ),
);

// --- Entry points --------------------------------------------------------------

/**
 * The SVG document for a diagram (or the selected part of it) plus its
 * pixel size, or `null` when nothing is exportable. Canvas units at zoom 1,
 * translated so the padded bounds of the exported shapes and attached
 * frames start at 0,0; deterministic for the same input (frames, then
 * nodes in array order, then edges).
 */
export function renderDiagramSvg(input: RenderDiagramSvgInput): RenderedDiagramSvg | null {
  const padding = input.padding ?? DEFAULT_EXPORT_PADDING;
  const selectedNodeIds = input.selection ? new Set(input.selection.filter((item) => item.type === 'node').map((item) => item.id)) : null;
  const selectedEdgeIds = input.selection ? new Set(input.selection.filter((item) => item.type === 'edge').map((item) => item.id)) : null;

  const nodes = input.nodes.filter((node) => selectedNodeIds === null || selectedNodeIds.has(node.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const frameIds = new Set(input.frames.map((frame) => frame.id));
  // An endpoint counts only when it lands on an exported node or an
  // existing frame - so with a selection, an edge to an unselected node is
  // dropped; without one, an edge to a missing node is skipped the way the
  // layer's renderEdge skips it.
  const resolvable = (endpoint: EdgeEndpoint): boolean =>
    endpoint.nodeId ? nodeIds.has(endpoint.nodeId) : endpoint.screenId ? frameIds.has(endpoint.screenId) : false;
  const edges = input.edges.filter(
    (edge) => (selectedEdgeIds === null || selectedEdgeIds.has(edge.id)) && resolvable(edge.source) && resolvable(edge.target),
  );
  const attachedFrameIds = new Set<string>();
  for (const edge of edges) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!endpoint.nodeId && endpoint.screenId) attachedFrameIds.add(endpoint.screenId);
    }
  }
  const frames = input.frames.filter((frame) => attachedFrameIds.has(frame.id));

  if (nodes.length === 0 && edges.length === 0) return null;
  const extent = bounds([...nodes, ...frames]);
  if (!extent) return null;

  const width = extent.width + 2 * padding;
  const height = extent.height + 2 * padding;
  const offsetX = padding - extent.x;
  const offsetY = padding - extent.y;
  const shift = (box: Box): Box => ({ x: box.x + offsetX, y: box.y + offsetY, width: box.width, height: box.height });
  const placedNodes = nodes.map((node) => ({ node, box: shift(node) }));
  const placedFrames = frames.map((frame) => ({ frame, box: shift(frame) }));
  const nodeBoxes = new Map(placedNodes.map(({ node, box }) => [node.id, box] as const));
  const frameBoxes = new Map(placedFrames.map(({ frame, box }) => [frame.id, box] as const));
  const boxFor = (endpoint: EdgeEndpoint): Box | undefined =>
    endpoint.nodeId ? nodeBoxes.get(endpoint.nodeId) : endpoint.screenId ? frameBoxes.get(endpoint.screenId) : undefined;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    ARROWHEAD_DEFS,
    element('rect', { x: 0, y: 0, width, height, fill: EXPORT_BACKGROUND }),
  ];
  for (const { frame, box } of placedFrames) parts.push(renderFrame(frame, box));
  for (const { node, box } of placedNodes) parts.push(renderNode(node, box, input.measureText));
  for (const edge of edges) {
    const sourceBox = boxFor(edge.source);
    const targetBox = boxFor(edge.target);
    if (sourceBox && targetBox) parts.push(renderEdge(edge, sourceBox, targetBox, input.measureText));
  }
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
