import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBezierPath, getHandlePosition, getSmoothStepPath, type Box } from './geometry';
import { DIAGRAM_COLORS, type DiagramEdge, type DiagramNode, type DiagramSelection } from './store';
import {
  DIAGRAM_EXPORT_COLORS,
  renderDiagramSvg,
  svgToPngBlob,
  type ExportFrame,
  type RenderDiagramSvgInput,
} from './export';

const SHAPE_FONT_FAMILY = "Archivo, 'Helvetica Neue', Arial, sans-serif";
const LABEL_FONT_FAMILY = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
// The screen's tokens (app/globals.css): the canvas surface, the accent the
// arrowheads use, and the CHIP surface a label sits on.
const CANVAS = '#14121B';
const ACCENT = '#8C97DB';
const CHIP_FILL = 'rgba(34,33,46,0.95)';
const CHIP_STROKE = 'rgba(255,255,255,0.6)';
const CHIP_TEXT = '#EAE8F0';

// A deterministic stand-in for canvas measureText: 7 px per character, whatever
// the font, so every wrapping expectation below can be worked out by hand.
const measure = (text: string) => text.length * 7;

function node(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'n1',
    kind: 'rect',
    x: 100,
    y: 200,
    width: 160,
    height: 80,
    text: 'Hello',
    color: 'neutral',
    ...overrides,
  };
}

function edge(overrides: Partial<DiagramEdge> = {}): DiagramEdge {
  return {
    id: 'e1',
    source: { nodeId: 'a', side: 'right' },
    target: { nodeId: 'b', side: 'left' },
    kind: 'straight',
    arrow: 'end',
    ...overrides,
  };
}

function frame(overrides: Partial<ExportFrame> = {}): ExportFrame {
  return { id: 'f1', name: 'Login', x: 400, y: 100, width: 200, height: 300, ...overrides };
}

// Three boxes in a row, 100 px apart, and the two connectors joining them,
// for the edge, order and selection tests.
const A = node({ id: 'a', x: 0, y: 0, width: 100, height: 50, text: '' });
const B = node({ id: 'b', x: 200, y: 0, width: 100, height: 50, text: '' });
const C = node({ id: 'c', x: 400, y: 0, width: 100, height: 50, text: '' });
const AB = edge({ id: 'ab', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } });
const BC = edge({ id: 'bc', source: { nodeId: 'b', side: 'right' }, target: { nodeId: 'c', side: 'left' } });

function render(input: Partial<RenderDiagramSvgInput> = {}) {
  return renderDiagramSvg({ nodes: [], edges: [], frames: [], measureText: measure, ...input });
}

function renderSvg(input: Partial<RenderDiagramSvgInput> = {}): { svg: string; width: number; height: number } {
  const result = render(input);
  if (!result) throw new Error('expected renderDiagramSvg to return an export');
  return result;
}

// Parses through jsdom's XML parser so a malformed document (unescaped
// user text, an unclosed tag) fails loudly instead of being string-matched
// around.
function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error(`invalid SVG: ${error.textContent}`);
  return doc;
}

function renderDoc(input: Partial<RenderDiagramSvgInput> = {}): Document {
  return parse(renderSvg(input).svg);
}

// Matched on the attribute's value rather than through a selector so an id
// containing a quote (the XML escaping test) needs no CSS escaping.
function group(doc: Document, attribute: 'data-node' | 'data-edge' | 'data-frame', id: string): Element {
  const element = Array.from(doc.querySelectorAll(`g[${attribute}]`)).find((candidate) => candidate.getAttribute(attribute) === id);
  if (!element) throw new Error(`no <g ${attribute}="${id}"> in the export`);
  return element;
}

function only(parent: Element | Document, selector: string): Element {
  const matches = parent.querySelectorAll(selector);
  if (matches.length !== 1) throw new Error(`expected exactly one "${selector}", found ${matches.length}`);
  return matches[0];
}

function shifted(box: Box, by: number): Box {
  return { x: box.x + by, y: box.y + by, width: box.width, height: box.height };
}

// The geometry's own path with its numbers written the way the export
// writes them: at most three decimals.
function rounded(path: string): string {
  return path.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => String(Number(Number(n).toFixed(3))));
}

// Every x,y pair in a path built from M/L/C/Q commands.
function pathPoints(d: string): { x: number; y: number }[] {
  return Array.from(d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g), (match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

function drawnGroups(doc: Document): ('frame' | 'edge' | 'node')[] {
  return Array.from(doc.documentElement.children)
    .filter((child) => child.tagName === 'g')
    .map((child) => (child.hasAttribute('data-frame') ? 'frame' : child.hasAttribute('data-edge') ? 'edge' : 'node'));
}

describe('DIAGRAM_EXPORT_COLORS', () => {
  it('gives every DIAGRAM_COLORS entry a #rrggbb or rgba() fill and stroke', () => {
    const form = /^(#[0-9a-f]{6}|rgba\(\d{1,3},\d{1,3},\d{1,3},(0|1|0?\.\d+)\))$/;
    for (const color of DIAGRAM_COLORS) {
      const entry = DIAGRAM_EXPORT_COLORS[color];
      expect(entry, color).toBeDefined();
      expect(entry.fill, `${color} fill`).toMatch(form);
      expect(entry.stroke, `${color} stroke`).toMatch(form);
    }
    expect(Object.keys(DIAGRAM_EXPORT_COLORS).sort()).toEqual([...DIAGRAM_COLORS].sort());
  });

  it('matches the on-screen shape colors', () => {
    expect(DIAGRAM_EXPORT_COLORS.neutral).toEqual({ fill: '#27272a', stroke: '#9f9fa9' });
    expect(DIAGRAM_EXPORT_COLORS.blue).toEqual({ fill: 'rgba(43,127,255,0.25)', stroke: '#51a2ff' });
    expect(DIAGRAM_EXPORT_COLORS.green).toEqual({ fill: 'rgba(0,201,80,0.25)', stroke: '#05df72' });
    expect(DIAGRAM_EXPORT_COLORS.amber).toEqual({ fill: 'rgba(254,154,0,0.25)', stroke: '#ffb900' });
    expect(DIAGRAM_EXPORT_COLORS.red).toEqual({ fill: 'rgba(251,44,54,0.25)', stroke: '#ff6467' });
    expect(DIAGRAM_EXPORT_COLORS.violet).toEqual({ fill: 'rgba(142,81,255,0.25)', stroke: '#a684ff' });
  });
});

describe('renderDiagramSvg', () => {
  describe('empty input', () => {
    it('returns null with no nodes and no edges', () => {
      expect(render()).toBeNull();
    });

    it('returns null when the selection names nothing exportable', () => {
      expect(render({ nodes: [A, B], selection: [{ type: 'node', id: 'missing' }] })).toBeNull();
      // An edge alone whose nodes are not selected is not exportable either.
      expect(render({ nodes: [A, B], edges: [edge()], selection: [{ type: 'edge', id: 'e1' }] })).toBeNull();
    });
  });

  describe('bounds and translation', () => {
    it('pads the node bounds by 32 and moves the padded top-left to 0,0', () => {
      const { svg, width, height } = renderSvg({ nodes: [node()] });
      expect(width).toBe(224);
      expect(height).toBe(144);
      const doc = parse(svg);
      const root = doc.documentElement;
      expect(root.tagName).toBe('svg');
      expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
      expect(root.getAttribute('width')).toBe('224');
      expect(root.getAttribute('height')).toBe('144');
      expect(root.getAttribute('viewBox')).toBe('0 0 224 144');
      const rect = only(group(doc, 'data-node', 'n1'), 'rect');
      expect(rect.getAttribute('x')).toBe('32');
      expect(rect.getAttribute('y')).toBe('32');
      expect(rect.getAttribute('width')).toBe('160');
      expect(rect.getAttribute('height')).toBe('80');
    });

    it('honours a custom padding', () => {
      const { svg, width, height } = renderSvg({ nodes: [node()], padding: 0 });
      expect(width).toBe(160);
      expect(height).toBe(80);
      const rect = only(group(parse(svg), 'data-node', 'n1'), 'rect');
      expect(rect.getAttribute('x')).toBe('0');
      expect(rect.getAttribute('y')).toBe('0');
    });

    it('covers every exported node', () => {
      const far = node({ id: 'far', x: 300, y: 400, width: 100, height: 50 });
      const { width, height } = renderSvg({ nodes: [A, far] });
      expect(width).toBe(400 + 64);
      expect(height).toBe(450 + 64);
    });

    it("extends the bounds to a curve's control points and its label chip so nothing is clipped", () => {
      // Two stacked 100 x 50 rects joined left-to-left by a curve: the
      // control points sit 56 px (0.28 x the 200 px distance) left of the
      // shapes and the "maybe" chip (35 + 16 px wide) centres on the curve's
      // midpoint 42 px out, so the chip's left edge is the leftmost thing.
      const top = node({ id: 'a', x: 0, y: 0, width: 100, height: 50, text: '' });
      const bottom = node({ id: 'b', x: 0, y: 200, width: 100, height: 50, text: '' });
      const curve = edge({ source: { nodeId: 'a', side: 'left' }, target: { nodeId: 'b', side: 'left' }, kind: 'curve', label: 'maybe' });
      const { svg, width, height } = renderSvg({ nodes: [top, bottom], edges: [curve] });
      expect(width).toBe(100 + 67.5 + 64);
      const labelled = group(parse(svg), 'data-edge', 'e1');
      const points = pathPoints(only(labelled, 'path').getAttribute('d') ?? '');
      expect(points.length).toBeGreaterThan(0);
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(width);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(height);
      }
      const chip = only(labelled, 'rect');
      expect(chip.getAttribute('x')).toBe('32');
      expect(Number(chip.getAttribute('x')) + Number(chip.getAttribute('width'))).toBeLessThanOrEqual(width);
    });

    it("extends the bounds to a label chip on a step route's corner", () => {
      // Top-to-top between two boxes in a row: the route runs along y = 0,
      // so the 20 px chip pokes 10 px above the shapes.
      const overTop = edge({ source: { nodeId: 'a', side: 'top' }, target: { nodeId: 'b', side: 'top' }, kind: 'step', label: 'yes' });
      const { svg, height } = renderSvg({ nodes: [A, B], edges: [overTop] });
      expect(height).toBe(50 + 10 + 64);
      const chip = only(group(parse(svg), 'data-edge', 'e1'), 'rect');
      expect(chip.getAttribute('y')).toBe('32');
      expect(only(group(parse(svg), 'data-node', 'a'), 'rect').getAttribute('y')).toBe('42');
    });

    it('returns width and height equal to the root attributes (three decimals)', () => {
      const offGrid = frame({ x: 300.11111, y: 0, width: 100, height: 50 });
      const toFrame = edge({ source: { nodeId: 'a', side: 'right' }, target: { screenId: 'f1', side: 'left' } });
      const { svg, width, height } = renderSvg({ nodes: [A], edges: [toFrame], frames: [offGrid] });
      const root = parse(svg).documentElement;
      expect(root.getAttribute('width')).toBe('464.111');
      expect(width).toBe(464.111);
      expect(String(height)).toBe(root.getAttribute('height'));
      expect(root.getAttribute('viewBox')).toBe(`0 0 ${width} ${height}`);
    });
  });

  describe('background', () => {
    it('draws a background rect in the canvas surface colour over the whole export before anything else', () => {
      const doc = renderDoc({ nodes: [node()] });
      const drawn = Array.from(doc.documentElement.children).filter((child) => child.tagName !== 'defs');
      const background = drawn[0];
      expect(background.tagName).toBe('rect');
      expect(background.getAttribute('x')).toBe('0');
      expect(background.getAttribute('y')).toBe('0');
      expect(background.getAttribute('width')).toBe('224');
      expect(background.getAttribute('height')).toBe('144');
      expect(background.getAttribute('fill')).toBe(CANVAS);
    });
  });

  describe('drawing order', () => {
    it('draws frames, then connectors, then shapes, so connectors sit beneath shapes as on screen', () => {
      const toFrame = edge({ id: 'af', source: { nodeId: 'a', side: 'right' }, target: { screenId: 'f1', side: 'left' } });
      const doc = renderDoc({ nodes: [A, B], edges: [AB, toFrame], frames: [frame()] });
      expect(drawnGroups(doc)).toEqual(['frame', 'edge', 'edge', 'node', 'node']);
    });
  });

  describe('shapes', () => {
    it('draws a rect with square corners', () => {
      const rect = only(group(renderDoc({ nodes: [node({ kind: 'rect' })] }), 'data-node', 'n1'), 'rect');
      expect(rect.getAttribute('rx')).toBe('0');
      expect(rect.getAttribute('stroke-width')).toBe('1.5');
    });

    it('draws a rounded rect with 12 px corners', () => {
      const rect = only(group(renderDoc({ nodes: [node({ kind: 'rounded' })] }), 'data-node', 'n1'), 'rect');
      expect(rect.getAttribute('rx')).toBe('12');
    });

    it('draws a decision as a diamond through the side midpoints', () => {
      const polygon = only(group(renderDoc({ nodes: [node({ kind: 'decision' })] }), 'data-node', 'n1'), 'polygon');
      expect(polygon.getAttribute('points')).toBe('112,32 192,72 112,112 32,72');
      expect(polygon.getAttribute('stroke-width')).toBe('1.5');
    });

    it("centres a decision's text on the full box, in the same group as the polygon", () => {
      const shape = group(
        renderDoc({ nodes: [node({ kind: 'decision', x: 0, y: 0, width: 160, height: 100, text: 'Valid?' })], padding: 0 }),
        'data-node',
        'n1',
      );
      expect(Array.from(shape.children).map((child) => child.tagName)).toEqual(['polygon', 'text']);
      const span = only(shape, 'tspan');
      expect(span.getAttribute('x')).toBe('80');
      expect(span.getAttribute('y')).toBe('50');
      expect(span.textContent).toBe('Valid?');
    });

    it('draws a terminal as a pill (rx = height / 2)', () => {
      const rect = only(group(renderDoc({ nodes: [node({ kind: 'terminal' })] }), 'data-node', 'n1'), 'rect');
      expect(rect.getAttribute('rx')).toBe('40');
    });

    it('draws a note with 2 px corners', () => {
      const rect = only(group(renderDoc({ nodes: [node({ kind: 'note' })] }), 'data-node', 'n1'), 'rect');
      expect(rect.getAttribute('rx')).toBe('2');
    });

    it('draws a text node without any box', () => {
      const textNode = group(renderDoc({ nodes: [node({ kind: 'text' })] }), 'data-node', 'n1');
      expect(textNode.querySelectorAll('rect, polygon')).toHaveLength(0);
      expect(only(textNode, 'text').textContent).toBe('Hello');
    });
  });

  describe('colours', () => {
    it('fills and strokes each shape with its export colours', () => {
      for (const color of DIAGRAM_COLORS) {
        const rect = only(group(renderDoc({ nodes: [node({ color })] }), 'data-node', 'n1'), 'rect');
        expect(rect.getAttribute('fill'), color).toBe(DIAGRAM_EXPORT_COLORS[color].fill);
        expect(rect.getAttribute('stroke'), color).toBe(DIAGRAM_EXPORT_COLORS[color].stroke);
      }
    });

    it('colours a decision polygon the same way', () => {
      const polygon = only(group(renderDoc({ nodes: [node({ kind: 'decision', color: 'red' })] }), 'data-node', 'n1'), 'polygon');
      expect(polygon.getAttribute('fill')).toBe(DIAGRAM_EXPORT_COLORS.red.fill);
      expect(polygon.getAttribute('stroke')).toBe(DIAGRAM_EXPORT_COLORS.red.stroke);
    });
  });

  describe('shape text', () => {
    // A 160 x 120 box at the origin with no padding: inner width 148 (21
    // characters at 7 px), inner height 108 (three 34.8 px lines - 24 px,
    // the new medium default, at the body line height of 1.45; sized so
    // three lines still fit comfortably the way they did at the old,
    // smaller default - only the dedicated overflow test below uses a box
    // deliberately too short for its own content).
    const box = { x: 0, y: 0, width: 160, height: 120 };

    it('centres a single line in the box with the app font stack', () => {
      const text = only(group(renderDoc({ nodes: [node({ ...box, text: 'Hello' })], padding: 0 }), 'data-node', 'n1'), 'text');
      expect(text.getAttribute('x')).toBe('80');
      expect(text.getAttribute('fill')).toBe('#ffffff');
      expect(text.getAttribute('font-size')).toBe('24');
      expect(text.getAttribute('font-family')).toBe(SHAPE_FONT_FAMILY);
      expect(text.getAttribute('text-anchor')).toBe('middle');
      expect(text.getAttribute('dominant-baseline')).toBe('central');
      const spans = text.querySelectorAll('tspan');
      expect(spans).toHaveLength(1);
      expect(spans[0].getAttribute('x')).toBe('80');
      expect(spans[0].getAttribute('y')).toBe('60');
      expect(spans[0].textContent).toBe('Hello');
    });

    it('wraps to the inner width with the supplied measurer and centres the block at line height 1.45', () => {
      const text = only(
        group(renderDoc({ nodes: [node({ ...box, text: 'The quick brown fox jumps over the lazy dog' })], padding: 0 }), 'data-node', 'n1'),
        'text',
      );
      const spans = Array.from(text.querySelectorAll('tspan'));
      expect(spans.map((span) => span.textContent)).toEqual(['The quick brown fox', 'jumps over the lazy', 'dog']);
      // Three 34.8 px lines centred on y = 60 (this box's own height / 2):
      // 60 - 34.8, 60, 60 + 34.8.
      expect(spans.map((span) => span.getAttribute('y'))).toEqual(['25.2', '60', '94.8']);
      expect(spans.every((span) => span.getAttribute('x') === '80')).toBe(true);
    });

    it('respects explicit newlines, including blank lines', () => {
      const text = only(group(renderDoc({ nodes: [node({ ...box, text: 'a\n\nb' })], padding: 0 }), 'data-node', 'n1'), 'text');
      const spans = Array.from(text.querySelectorAll('tspan'));
      expect(spans.map((span) => span.textContent)).toEqual(['a', '', 'b']);
    });

    it('preserves runs of spaces like the on-screen pre-wrap div', () => {
      const text = only(group(renderDoc({ nodes: [node({ ...box, text: 'a  b' })], padding: 0 }), 'data-node', 'n1'), 'text');
      expect(text.getAttribute('xml:space')).toBe('preserve');
      expect(only(text, 'tspan').textContent).toBe('a  b');
    });

    it('breaks a word wider than the box character by character', () => {
      const text = only(
        group(renderDoc({ nodes: [node({ ...box, text: 'abcdefghijklmnopqrstuvwxyz' })], padding: 0 }), 'data-node', 'n1'),
        'text',
      );
      const spans = Array.from(text.querySelectorAll('tspan'));
      expect(spans.map((span) => span.textContent)).toEqual(['abcdefghijklmnopqrstu', 'vwxyz']);
    });

    it('drops the lines that overflow the inner height, keeping the first ones', () => {
      // 160 x 80: inner height 68 fits three 18.85 px lines, as on screen.
      const tall = only(group(renderDoc({ nodes: [node({ ...box, text: 'one\ntwo\nthree\nfour' })], padding: 0 }), 'data-node', 'n1'), 'text');
      expect(Array.from(tall.querySelectorAll('tspan')).map((span) => span.textContent)).toEqual(['one', 'two', 'three']);
      // 100 x 40: inner width 88 (12 characters), inner height 28 (one line).
      const text = only(
        group(renderDoc({ nodes: [node({ x: 0, y: 0, width: 100, height: 40, text: 'hello world foo' })], padding: 0 }), 'data-node', 'n1'),
        'text',
      );
      const spans = Array.from(text.querySelectorAll('tspan'));
      expect(spans.map((span) => span.textContent)).toEqual(['hello world']);
      expect(spans[0].getAttribute('y')).toBe('20');
    });

    it('omits the text element entirely for empty text', () => {
      const shape = group(renderDoc({ nodes: [node({ text: '' })] }), 'data-node', 'n1');
      expect(shape.querySelectorAll('text')).toHaveLength(0);
    });

    it('measures with the 24 px shape font', () => {
      const measureText = vi.fn(measure);
      render({ nodes: [node({ text: 'Hello' })], measureText });
      expect(measureText).toHaveBeenCalledWith('Hello', { size: 24, family: SHAPE_FONT_FAMILY, weight: 400 });
    });
  });

  // Spec section 9: "give the diagram shapes a font selection like small,
  // medium, large... a monospaced font, a serif font, and a sans serif
  // font... let me change the color of the fonts independently from the
  // shape's colors" - all three optional on the node, defaulting to
  // medium/sans/default (the fixed values every test above already covers).
  describe('shape text styling', () => {
    // Same 160 x 80 box at the origin as the 'shape text' describe above.
    const box = { x: 0, y: 0, width: 160, height: 80 };
    const SERIF_FAMILY = "Georgia, 'Times New Roman', serif";

    it('uses 16px for small and 40px for large, in place of the 24px default', () => {
      const small = only(group(renderDoc({ nodes: [node({ ...box, textSize: 'small' })] }), 'data-node', 'n1'), 'text');
      expect(small.getAttribute('font-size')).toBe('16');
      const large = only(group(renderDoc({ nodes: [node({ ...box, textSize: 'large' })] }), 'data-node', 'n1'), 'text');
      expect(large.getAttribute('font-size')).toBe('40');
    });

    it('uses the serif and mono font families, in place of the sans default', () => {
      const serif = only(group(renderDoc({ nodes: [node({ ...box, textFont: 'serif' })] }), 'data-node', 'n1'), 'text');
      expect(serif.getAttribute('font-family')).toBe(SERIF_FAMILY);
      const mono = only(group(renderDoc({ nodes: [node({ ...box, textFont: 'mono' })] }), 'data-node', 'n1'), 'text');
      expect(mono.getAttribute('font-family')).toBe(LABEL_FONT_FAMILY);
    });

    it('fills with white by default and black for the black text color', () => {
      const white = only(group(renderDoc({ nodes: [node({ ...box })] }), 'data-node', 'n1'), 'text');
      expect(white.getAttribute('fill')).toBe('#ffffff');
      const black = only(group(renderDoc({ nodes: [node({ ...box, textColor: 'black' })] }), 'data-node', 'n1'), 'text');
      expect(black.getAttribute('fill')).toBe('#000000');
    });

    it('fills with the same *-400 tone each hued diagram color stroke already uses on the shape body', () => {
      // Every diagram colour except neutral: neutral's own shape stroke is
      // a translucent white (DIAGRAM_EXPORT_COLORS.neutral above), not a
      // hex tone - text needs an actual visible grey regardless, tested on
      // its own right below.
      for (const color of DIAGRAM_COLORS.filter((c) => c !== 'neutral')) {
        const text = only(group(renderDoc({ nodes: [node({ ...box, textColor: color })] }), 'data-node', 'n1'), 'text');
        expect(text.getAttribute('fill'), color).toBe(DIAGRAM_EXPORT_COLORS[color].stroke);
      }
    });

    it("fills neutral text with Tailwind's neutral-400 grey, not the shape's own translucent white", () => {
      const text = only(group(renderDoc({ nodes: [node({ ...box, textColor: 'neutral' })] }), 'data-node', 'n1'), 'text');
      expect(text.getAttribute('fill')).toBe('#a1a1a1');
    });

    it("passes the node's own size and family to measureText, not the 24px sans default", () => {
      const measureText = vi.fn(measure);
      render({ nodes: [node({ text: 'Hello', textSize: 'large', textFont: 'mono' })], measureText });
      expect(measureText).toHaveBeenCalledWith('Hello', { size: 40, family: LABEL_FONT_FAMILY, weight: 400 });
    });

    it('wraps and centres using the chosen size, not the 24px default line height', () => {
      // large is 40px; at 1.45 line height that is 58px/line. A box tall
      // enough for two lines (2 * 58 + 12 padding = 128, so height 140) but
      // not three (3 * 58 = 174 > 128) still drops the third, the same way
      // the default-size overflow test above drops a fourth.
      const text = only(
        group(renderDoc({ nodes: [node({ ...box, height: 140, textSize: 'large', text: 'one\ntwo\nthree' })] }), 'data-node', 'n1'),
        'text',
      );
      expect(Array.from(text.querySelectorAll('tspan')).map((span) => span.textContent)).toEqual(['one', 'two']);
    });
  });

  describe('XML escaping', () => {
    const unsafe = `Fish & <chips> "salt" 'vinegar'`;

    it('escapes shape text, edge labels, frame names and ids', () => {
      const wide = node({ id: 'n"1', x: 0, y: 0, width: 400, height: 80, text: unsafe });
      const { svg } = renderSvg({
        nodes: [wide, B],
        edges: [edge({ source: { nodeId: 'n"1', side: 'right' }, target: { screenId: 'f1', side: 'left' }, label: unsafe })],
        frames: [frame({ name: unsafe })],
      });
      expect(svg).toContain('Fish &amp; &lt;chips&gt; &quot;salt&quot; &apos;vinegar&apos;');
      expect(svg).toContain('data-node="n&quot;1"');
      expect(svg).not.toMatch(/<chips>/);
      const doc = parse(svg);
      expect(only(group(doc, 'data-node', 'n"1'), 'text').textContent).toBe(unsafe);
      expect(only(group(doc, 'data-edge', 'e1'), 'text').textContent).toBe(unsafe);
      expect(only(group(doc, 'data-frame', 'f1'), 'text').textContent).toBe(unsafe);
    });

    it('drops characters XML forbids (controls, lone surrogates, U+FFFE/U+FFFF) and keeps real astral ones', () => {
      // A lone high surrogate, the two non-characters and a backspace, next
      // to a thumbs-up (a surrogate pair, which must survive).
      const loneSurrogate = String.fromCharCode(0xd800);
      const nonCharacters = String.fromCharCode(0xfffe) + String.fromCharCode(0xffff);
      const control = String.fromCharCode(0x08);
      const thumbsUp = String.fromCodePoint(0x1f44d);
      const text = `ab${loneSurrogate}c${nonCharacters}d${control}e ${thumbsUp}`;
      const { svg } = renderSvg({ nodes: [node({ x: 0, y: 0, width: 400, height: 80, text })] });
      expect(only(group(parse(svg), 'data-node', 'n1'), 'tspan').textContent).toBe(`abcde ${thumbsUp}`);
    });
  });

  describe('edges', () => {
    it('draws a straight edge between the stored sides in the export colour', () => {
      const path = only(group(renderDoc({ nodes: [A, B], edges: [edge()], padding: 0 }), 'data-edge', 'e1'), 'path');
      expect(path.getAttribute('d')).toBe('M100,25 L200,25');
      expect(path.getAttribute('stroke')).toBe('rgba(255,255,255,0.6)');
      expect(path.getAttribute('stroke-width')).toBe('1.5');
      expect(path.getAttribute('fill')).toBe('none');
    });

    it('moves edge endpoints with the padded translation', () => {
      const path = only(group(renderDoc({ nodes: [A, B], edges: [edge()] }), 'data-edge', 'e1'), 'path');
      expect(path.getAttribute('d')).toBe('M132,57 L232,57');
    });

    it('falls back to the side facing the other endpoint when none is stored', () => {
      const sideless = edge({ source: { nodeId: 'a' }, target: { nodeId: 'b' } });
      const horizontal = only(group(renderDoc({ nodes: [A, B], edges: [sideless], padding: 0 }), 'data-edge', 'e1'), 'path');
      expect(horizontal.getAttribute('d')).toBe('M100,25 L200,25');

      const below = node({ id: 'b', x: 0, y: 200, width: 100, height: 50, text: '' });
      const vertical = only(group(renderDoc({ nodes: [A, below], edges: [sideless], padding: 0 }), 'data-edge', 'e1'), 'path');
      expect(vertical.getAttribute('d')).toBe('M50,50 L50,200');
    });

    it('uses the geometry step path with rounded corners', () => {
      const lower = node({ id: 'b', x: 200, y: 100, width: 100, height: 50, text: '' });
      const path = only(group(renderDoc({ nodes: [A, lower], edges: [edge({ kind: 'step' })] }), 'data-edge', 'e1'), 'path');
      const expected = getSmoothStepPath(
        getHandlePosition(shifted(A, 32), 'right'),
        'right',
        getHandlePosition(shifted(lower, 32), 'left'),
        'left',
      );
      expect(path.getAttribute('d')).toBe(rounded(expected.path));
      expect(expected.path).toContain('Q');
    });

    it('uses the geometry bezier path for a curve', () => {
      const lower = node({ id: 'b', x: 200, y: 100, width: 100, height: 50, text: '' });
      const path = only(group(renderDoc({ nodes: [A, lower], edges: [edge({ kind: 'curve' })] }), 'data-edge', 'e1'), 'path');
      const expected = getBezierPath(
        getHandlePosition(shifted(A, 32), 'right'),
        'right',
        getHandlePosition(shifted(lower, 32), 'left'),
        'left',
      );
      expect(path.getAttribute('d')).toBe(rounded(expected.path));
      expect(expected.path).toContain('C');
    });

    it('writes path numbers with at most three decimals', () => {
      // hypot(100, 100) x 0.28 = 39.5979...: the raw geometry carries the
      // full float, the export writes 132 + 39.598.
      const lower = node({ id: 'b', x: 200, y: 100, width: 100, height: 50, text: '' });
      const d = only(group(renderDoc({ nodes: [A, lower], edges: [edge({ kind: 'curve' })] }), 'data-edge', 'e1'), 'path').getAttribute('d') ?? '';
      expect(d).toContain('171.598');
      expect(d).not.toMatch(/\.\d{4}/);
      expect(d).not.toMatch(/e/i);
    });

    it('skips an edge whose endpoint does not exist', () => {
      const doc = renderDoc({ nodes: [A], edges: [edge({ target: { nodeId: 'ghost' } })] });
      expect(doc.querySelectorAll('g[data-edge]')).toHaveLength(0);
      expect(doc.querySelectorAll('g[data-node]')).toHaveLength(1);
    });

    describe('arrowheads', () => {
      it('defines one accent-coloured marker shaped like the on-screen arrowhead', () => {
        const doc = renderDoc({ nodes: [A, B], edges: [edge()] });
        const marker = only(doc, 'defs > marker');
        expect(marker.getAttribute('id')).toBe('diagram-export-arrowhead');
        expect(marker.getAttribute('viewBox')).toBe('0 0 10 10');
        expect(marker.getAttribute('refX')).toBe('8');
        expect(marker.getAttribute('refY')).toBe('5');
        expect(marker.getAttribute('markerWidth')).toBe('7');
        expect(marker.getAttribute('markerHeight')).toBe('7');
        expect(marker.getAttribute('orient')).toBe('auto-start-reverse');
        const head = only(marker, 'path');
        expect(head.getAttribute('d')).toBe('M0,0 L10,5 L0,10 z');
        expect(head.getAttribute('fill')).toBe(ACCENT);
      });

      it('puts the marker at the end for arrow: end', () => {
        const path = only(group(renderDoc({ nodes: [A, B], edges: [edge({ arrow: 'end' })] }), 'data-edge', 'e1'), 'path');
        expect(path.getAttribute('marker-end')).toBe('url(#diagram-export-arrowhead)');
        expect(path.hasAttribute('marker-start')).toBe(false);
      });

      it('puts the marker at both ends for arrow: both', () => {
        const path = only(group(renderDoc({ nodes: [A, B], edges: [edge({ arrow: 'both' })] }), 'data-edge', 'e1'), 'path');
        expect(path.getAttribute('marker-end')).toBe('url(#diagram-export-arrowhead)');
        expect(path.getAttribute('marker-start')).toBe('url(#diagram-export-arrowhead)');
      });

      it('puts no marker for arrow: none', () => {
        const path = only(group(renderDoc({ nodes: [A, B], edges: [edge({ arrow: 'none' })] }), 'data-edge', 'e1'), 'path');
        expect(path.hasAttribute('marker-end')).toBe(false);
        expect(path.hasAttribute('marker-start')).toBe(false);
      });
    });

    // Spec section 14 (Matt 2026-09-14): the export honours a connector's
    // own lineStyle with a real, unscaled stroke-dasharray attribute - no
    // /zoom scaling, since that is a canvas-only, runtime concern (the
    // export is always "zoom 1").
    describe('line style', () => {
      it('writes stroke-dasharray="4 3" for a dashed connector', () => {
        const path = only(group(renderDoc({ nodes: [A, B], edges: [edge({ lineStyle: 'dashed' })] }), 'data-edge', 'e1'), 'path');
        expect(path.getAttribute('stroke-dasharray')).toBe('4 3');
      });

      it('omits stroke-dasharray for a solid connector', () => {
        const path = only(group(renderDoc({ nodes: [A, B], edges: [edge({ lineStyle: 'solid' })] }), 'data-edge', 'e1'), 'path');
        expect(path.hasAttribute('stroke-dasharray')).toBe(false);
      });

      it('omits stroke-dasharray when lineStyle is absent (old files unchanged)', () => {
        const path = only(group(renderDoc({ nodes: [A, B], edges: [edge({ lineStyle: undefined })] }), 'data-edge', 'e1'), 'path');
        expect(path.hasAttribute('stroke-dasharray')).toBe(false);
      });
    });
  });

  describe('edge labels', () => {
    it('draws a dotted rectangular label centred on the label point, sized from the measurer', () => {
      const labelled = group(renderDoc({ nodes: [A, B], edges: [edge({ label: 'yes' })], padding: 0 }), 'data-edge', 'e1');
      // The straight path M100,25 L200,25 has its label point at 150,25;
      // "yes" measures 21 px, plus 8 px padding each side.
      const chip = only(labelled, 'rect');
      expect(chip.getAttribute('x')).toBe('131.5');
      expect(chip.getAttribute('y')).toBe('15');
      expect(chip.getAttribute('width')).toBe('37');
      expect(chip.getAttribute('height')).toBe('20');
      expect(chip.getAttribute('rx')).toBe('0');
      expect(chip.getAttribute('stroke-dasharray')).toBe('1 3');
      expect(chip.getAttribute('fill')).toBe(CHIP_FILL);
      expect(chip.getAttribute('stroke')).toBe(CHIP_STROKE);
      const text = only(labelled, 'text');
      expect(text.getAttribute('x')).toBe('150');
      expect(text.getAttribute('y')).toBe('25');
      expect(text.getAttribute('font-size')).toBe('10.5');
      expect(text.getAttribute('font-family')).toBe(LABEL_FONT_FAMILY);
      expect(text.getAttribute('fill')).toBe(CHIP_TEXT);
      expect(text.getAttribute('text-anchor')).toBe('middle');
      expect(text.getAttribute('dominant-baseline')).toBe('central');
      expect(text.textContent).toBe('yes');
    });

    it('draws no chip without a label', () => {
      const plain = group(renderDoc({ nodes: [A, B], edges: [edge()] }), 'data-edge', 'e1');
      expect(plain.querySelectorAll('rect, text')).toHaveLength(0);
    });

    it('measures the label with the 10.5 px mono font', () => {
      const measureText = vi.fn(measure);
      render({ nodes: [A, B], edges: [edge({ label: 'yes' })], measureText });
      expect(measureText).toHaveBeenCalledWith('yes', { size: 10.5, family: LABEL_FONT_FAMILY, weight: 400 });
    });
  });

  describe('selection', () => {
    const ids = (doc: Document, attribute: string) =>
      Array.from(doc.querySelectorAll(`g[${attribute}]`)).map((element) => element.getAttribute(attribute));

    it('exports everything when no selection is given', () => {
      const doc = renderDoc({ nodes: [A, B, C], edges: [AB, BC] });
      expect(ids(doc, 'data-node')).toEqual(['a', 'b', 'c']);
      expect(ids(doc, 'data-edge')).toEqual(['ab', 'bc']);
    });

    it('exports only the selected nodes', () => {
      const selection: DiagramSelection = [
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ];
      const doc = renderDoc({ nodes: [A, B, C], edges: [AB, BC], selection });
      expect(ids(doc, 'data-node')).toEqual(['a', 'b']);
    });

    it('keeps a selected edge only when both ends are selected nodes', () => {
      const selection: DiagramSelection = [
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
        { type: 'edge', id: 'ab' },
        { type: 'edge', id: 'bc' },
      ];
      const doc = renderDoc({ nodes: [A, B, C], edges: [AB, BC], selection });
      expect(ids(doc, 'data-edge')).toEqual(['ab']);
    });

    it('keeps an unselected edge whose two ends are both exported nodes (Shift+click two connected shapes)', () => {
      const selection: DiagramSelection = [
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ];
      const doc = renderDoc({ nodes: [A, B, C], edges: [AB, BC], selection });
      expect(ids(doc, 'data-edge')).toEqual(['ab']);
    });

    it('keeps a selected edge that attaches to a frame', () => {
      const toFrame = edge({ id: 'af', source: { nodeId: 'a', side: 'right' }, target: { screenId: 'f1', side: 'left' } });
      const selection: DiagramSelection = [
        { type: 'node', id: 'a' },
        { type: 'edge', id: 'af' },
      ];
      const doc = renderDoc({ nodes: [A, B], edges: [toFrame], frames: [frame()], selection });
      expect(ids(doc, 'data-edge')).toEqual(['af']);
      expect(ids(doc, 'data-frame')).toEqual(['f1']);
    });

    it('keeps an unselected edge from an exported node to a frame, and draws that frame', () => {
      const toFrame = edge({ id: 'af', source: { nodeId: 'a', side: 'right' }, target: { screenId: 'f1', side: 'left' } });
      const doc = renderDoc({ nodes: [A, B], edges: [toFrame, AB], frames: [frame()], selection: [{ type: 'node', id: 'a' }] });
      expect(ids(doc, 'data-edge')).toEqual(['af']);
      expect(ids(doc, 'data-frame')).toEqual(['f1']);
    });

    it('drops a selected edge to a frame when its node end is not exported', () => {
      const toFrame = edge({ id: 'af', source: { nodeId: 'a', side: 'right' }, target: { screenId: 'f1', side: 'left' } });
      const selection: DiagramSelection = [
        { type: 'node', id: 'b' },
        { type: 'edge', id: 'af' },
      ];
      const doc = renderDoc({ nodes: [A, B], edges: [toFrame], frames: [frame()], selection });
      expect(ids(doc, 'data-node')).toEqual(['b']);
      expect(ids(doc, 'data-edge')).toEqual([]);
      expect(ids(doc, 'data-frame')).toEqual([]);
    });

    it('keeps the node array order whatever the selection order', () => {
      const selection: DiagramSelection = [
        { type: 'node', id: 'c' },
        { type: 'node', id: 'a' },
      ];
      const doc = renderDoc({ nodes: [A, B, C], selection });
      expect(ids(doc, 'data-node')).toEqual(['a', 'c']);
    });
  });

  describe('frames', () => {
    const shape = node({ id: 'n1', x: 0, y: 0, width: 160, height: 80, text: '' });
    const toFrame = edge({ source: { nodeId: 'n1', side: 'right' }, target: { screenId: 'f1', side: 'left' } });

    it('draws an attached frame as a 1 px outline with its name and includes it in the bounds', () => {
      const { svg, width, height } = renderSvg({ nodes: [shape], edges: [toFrame], frames: [frame()] });
      expect(width).toBe(600 + 64);
      expect(height).toBe(400 + 64);
      const doc = parse(svg);
      const outline = group(doc, 'data-frame', 'f1');
      expect(outline.children).toHaveLength(2);
      const rect = only(outline, 'rect');
      expect(rect.getAttribute('x')).toBe('432');
      expect(rect.getAttribute('y')).toBe('132');
      expect(rect.getAttribute('width')).toBe('200');
      expect(rect.getAttribute('height')).toBe('300');
      expect(rect.getAttribute('fill')).toBe('none');
      expect(rect.getAttribute('stroke')).toBe('rgba(255,255,255,0.5)');
      expect(rect.getAttribute('stroke-width')).toBe('1');
      const name = only(outline, 'text');
      expect(name.textContent).toBe('Login');
      expect(name.getAttribute('x')).toBe('440');
      expect(name.getAttribute('y')).toBe('146');
      expect(name.getAttribute('font-size')).toBe('12');
      expect(name.getAttribute('font-family')).toBe(SHAPE_FONT_FAMILY);
      expect(name.getAttribute('fill')).toBe('rgba(255,255,255,0.5)');
      expect(name.getAttribute('dominant-baseline')).toBe('central');
      // The connector runs from the shape's right handle to the frame's left one.
      expect(only(group(doc, 'data-edge', 'e1'), 'path').getAttribute('d')).toBe('M192,72 L432,282');
    });

    it('anchors a side-less endpoint on the side facing the other end', () => {
      // The frame sits level with the shape (not diagonally, where
      // sideFromPoint's exact-tie rule would pick bottom/top): the shape
      // leaves on its right, the frame receives on its left.
      const sideless = edge({ source: { nodeId: 'n1' }, target: { screenId: 'f1' } });
      const level = frame({ y: 0 });
      const path = only(group(renderDoc({ nodes: [shape], edges: [sideless], frames: [level] }), 'data-edge', 'e1'), 'path');
      expect(path.getAttribute('d')).toBe('M192,72 L432,182');
    });

    it('ignores frames that no exported edge attaches to', () => {
      const { svg, width, height } = renderSvg({ nodes: [shape], frames: [frame()] });
      expect(width).toBe(160 + 64);
      expect(height).toBe(80 + 64);
      expect(parse(svg).querySelectorAll('g[data-frame]')).toHaveLength(0);
    });

    it('exports an edge between two frames with no nodes at all', () => {
      const between = edge({ source: { screenId: 'f1', side: 'right' }, target: { screenId: 'f2', side: 'left' } });
      const frames = [frame(), frame({ id: 'f2', name: 'Home', x: 800, y: 100 })];
      const doc = renderDoc({ edges: [between], frames, selection: [{ type: 'edge', id: 'e1' }] });
      expect(doc.querySelectorAll('g[data-frame]')).toHaveLength(2);
      expect(doc.querySelectorAll('g[data-edge]')).toHaveLength(1);
    });
  });

  describe('determinism', () => {
    it('renders identical output for the same input', () => {
      const input: RenderDiagramSvgInput = {
        nodes: [A, B, node({ id: 'd', kind: 'decision', color: 'violet', x: 100, y: 200 })],
        edges: [edge({ kind: 'curve', label: 'maybe' })],
        frames: [],
        measureText: measure,
      };
      expect(renderDiagramSvg(input)).toEqual(renderDiagramSvg(input));
    });
  });

  describe('mirrors the app theme (app/globals.css read from disk)', () => {
    const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');
    // The first definition of a token is the `:root` (dark, SF2) theme the
    // canvas renders in; `.theme-basic` redefines some further down.
    const token = (name: string): string => {
      const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
      if (!match) throw new Error(`no --${name} in app/globals.css`);
      return match[1].replace(/\s+/g, '');
    };

    it('paints the background in the canvas surface colour (--canvas)', () => {
      const doc = renderDoc({ nodes: [node()] });
      const background = Array.from(doc.documentElement.children).filter((child) => child.tagName !== 'defs')[0];
      expect(background.getAttribute('fill')).toBe(token('canvas'));
    });

    it('fills arrowheads with the accent (--acc)', () => {
      const doc = renderDoc({ nodes: [A, B], edges: [edge()] });
      expect(only(doc, 'defs > marker > path').getAttribute('fill')).toBe(token('acc'));
    });

    it('uses a readable dark backing and dotted border for labels', () => {
      const labelled = group(renderDoc({ nodes: [A, B], edges: [edge({ label: 'yes' })] }), 'data-edge', 'e1');
      expect(only(labelled, 'rect').getAttribute('fill')).toBe(CHIP_FILL);
      expect(only(labelled, 'rect').getAttribute('stroke')).toBe(CHIP_STROKE);
      expect(only(labelled, 'text').getAttribute('fill')).toBe(token('foreground'));
    });

    it('spaces shape text at the body line height', () => {
      const match = /body\s*\{[^}]*line-height:\s*([\d.]+)/.exec(css);
      const lineHeight = Number(match?.[1]);
      expect(lineHeight).toBeGreaterThan(1);
      // height 120: tall enough for three lines at the medium default's
      // (24px) line height (3 * 24 * 1.45 = 104.4), same reasoning as the
      // 'shape text' describe block's own shared box above.
      const text = only(
        group(renderDoc({ nodes: [node({ x: 0, y: 0, height: 120, text: 'a\nb\nc' })], padding: 0 }), 'data-node', 'n1'),
        'text',
      );
      const ys = Array.from(text.querySelectorAll('tspan')).map((span) => Number(span.getAttribute('y')));
      expect(ys).toHaveLength(3);
      expect(ys[1] - ys[0]).toBeCloseTo(24 * lineHeight, 6);
      expect(ys[2] - ys[1]).toBeCloseTo(24 * lineHeight, 6);
    });
  });
});

describe('svgToPngBlob', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><rect width="300" height="150" fill="#14121B"/></svg>';

  class ImageStub {
    static instances: ImageStub[] = [];
    static fail = false;
    onload: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    private currentSrc = '';

    constructor() {
      ImageStub.instances.push(this);
    }

    get src(): string {
      return this.currentSrc;
    }

    set src(value: string) {
      this.currentSrc = value;
      // Real images load asynchronously; fire on the next macrotask so the
      // wrapper's handlers are attached before the event arrives.
      setTimeout(() => {
        if (ImageStub.fail) this.onerror?.(new Event('error'));
        else this.onload?.();
      }, 0);
    }
  }

  const drawImage = vi.fn();
  const pngBlob = new Blob(['png-bytes'], { type: 'image/png' });
  let pngResult: Blob | null = pngBlob;
  let toBlobCalls: { width: number; height: number; type: string | undefined }[] = [];
  let context: { drawImage: typeof drawImage } | null = { drawImage };
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  beforeEach(() => {
    ImageStub.instances = [];
    ImageStub.fail = false;
    pngResult = pngBlob;
    toBlobCalls = [];
    context = { drawImage };
    drawImage.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal('Image', ImageStub);
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
    ) {
      toBlobCalls.push({ width: this.width, height: this.height, type });
      callback(pngResult);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const [name, descriptor] of [
      ['createObjectURL', originalCreate],
      ['revokeObjectURL', originalRevoke],
    ] as const) {
      if (descriptor) Object.defineProperty(URL, name, descriptor);
      else delete (URL as unknown as Record<string, unknown>)[name];
    }
  });

  it('rasterises the SVG at 2x through an Image and a canvas, then revokes the object URL', async () => {
    const blob = await svgToPngBlob(SVG);
    expect(blob).toBe(pngBlob);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const source = createObjectURL.mock.calls[0][0];
    expect(source).toBeInstanceOf(Blob);
    expect(source.type).toBe('image/svg+xml;charset=utf-8');
    expect(ImageStub.instances).toHaveLength(1);
    expect(ImageStub.instances[0].src).toBe('blob:mock-url');
    expect(drawImage).toHaveBeenCalledWith(ImageStub.instances[0], 0, 0, 600, 300);
    expect(toBlobCalls).toEqual([{ width: 600, height: 300, type: 'image/png' }]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('honours a custom scale', async () => {
    await svgToPngBlob(SVG, { scale: 1 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 300, 150);
    expect(toBlobCalls).toEqual([{ width: 300, height: 150, type: 'image/png' }]);
  });

  it('rejects with a clear error when the image fails to load, still revoking the URL', async () => {
    ImageStub.fail = true;
    await expect(svgToPngBlob(SVG)).rejects.toThrow(/could not be loaded/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('rejects when the SVG root has no numeric width and height', async () => {
    await expect(svgToPngBlob('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).rejects.toThrow(/width and height/);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects when the canvas has no 2D context', async () => {
    context = null;
    await expect(svgToPngBlob(SVG)).rejects.toThrow(/2D/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('rejects when the canvas hands back no PNG data, still revoking the URL', async () => {
    pngResult = null;
    await expect(svgToPngBlob(SVG)).rejects.toThrow(/no PNG data/);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
