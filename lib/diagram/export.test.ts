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

// Three boxes in a row, 100 px apart, for the edge and selection tests.
const A = node({ id: 'a', x: 0, y: 0, width: 100, height: 50, text: '' });
const B = node({ id: 'b', x: 200, y: 0, width: 100, height: 50, text: '' });
const C = node({ id: 'c', x: 400, y: 0, width: 100, height: 50, text: '' });

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

  it('matches the on-screen Tailwind classes (white/10, white/50, *-500 at 25%, *-400)', () => {
    expect(DIAGRAM_EXPORT_COLORS.neutral).toEqual({ fill: 'rgba(255,255,255,0.1)', stroke: 'rgba(255,255,255,0.5)' });
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
  });

  describe('background', () => {
    it('draws a background rect over the whole export before anything else', () => {
      const doc = renderDoc({ nodes: [node()] });
      const drawn = Array.from(doc.documentElement.children).filter((child) => child.tagName !== 'defs');
      const background = drawn[0];
      expect(background.tagName).toBe('rect');
      expect(background.getAttribute('x')).toBe('0');
      expect(background.getAttribute('y')).toBe('0');
      expect(background.getAttribute('width')).toBe('224');
      expect(background.getAttribute('height')).toBe('144');
      expect(background.getAttribute('fill')).toBe('#1B1922');
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
    // A 160 x 80 box at the origin with no padding: inner width 148 (21
    // characters at 7 px), inner height 68 (four 16.25 px lines).
    const box = { x: 0, y: 0, width: 160, height: 80 };

    it('centres a single line in the box with the app font stack', () => {
      const text = only(group(renderDoc({ nodes: [node({ ...box, text: 'Hello' })], padding: 0 }), 'data-node', 'n1'), 'text');
      expect(text.getAttribute('x')).toBe('80');
      expect(text.getAttribute('fill')).toBe('#ffffff');
      expect(text.getAttribute('font-size')).toBe('13');
      expect(text.getAttribute('font-family')).toBe(SHAPE_FONT_FAMILY);
      expect(text.getAttribute('text-anchor')).toBe('middle');
      expect(text.getAttribute('dominant-baseline')).toBe('central');
      const spans = text.querySelectorAll('tspan');
      expect(spans).toHaveLength(1);
      expect(spans[0].getAttribute('x')).toBe('80');
      expect(spans[0].getAttribute('y')).toBe('40');
      expect(spans[0].textContent).toBe('Hello');
    });

    it('wraps to the inner width with the supplied measurer and centres the block', () => {
      const text = only(
        group(renderDoc({ nodes: [node({ ...box, text: 'The quick brown fox jumps over the lazy dog' })], padding: 0 }), 'data-node', 'n1'),
        'text',
      );
      const spans = Array.from(text.querySelectorAll('tspan'));
      expect(spans.map((span) => span.textContent)).toEqual(['The quick brown fox', 'jumps over the lazy', 'dog']);
      // Three 16.25 px lines centred on y = 40: 40 - 16.25, 40, 40 + 16.25.
      expect(spans.map((span) => span.getAttribute('y'))).toEqual(['23.75', '40', '56.25']);
      expect(spans.every((span) => span.getAttribute('x') === '80')).toBe(true);
    });

    it('respects explicit newlines, including blank lines', () => {
      const text = only(group(renderDoc({ nodes: [node({ ...box, text: 'a\n\nb' })], padding: 0 }), 'data-node', 'n1'), 'text');
      const spans = Array.from(text.querySelectorAll('tspan'));
      expect(spans.map((span) => span.textContent)).toEqual(['a', '', 'b']);
    });

    it('breaks a word wider than the box character by character', () => {
      const text = only(
        group(renderDoc({ nodes: [node({ ...box, text: 'abcdefghijklmnopqrstuvwxyz' })], padding: 0 }), 'data-node', 'n1'),
        'text',
      );
      const spans = Array.from(text.querySelectorAll('tspan'));
      expect(spans.map((span) => span.textContent)).toEqual(['abcdefghijklmnopqrstu', 'vwxyz']);
    });

    it('drops the lines that overflow the inner height', () => {
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

    it('measures with the 13 px shape font', () => {
      const measureText = vi.fn(measure);
      render({ nodes: [node({ text: 'Hello' })], measureText });
      expect(measureText).toHaveBeenCalledWith('Hello', { size: 13, family: SHAPE_FONT_FAMILY, weight: 400 });
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
      expect(path.getAttribute('d')).toBe(expected.path);
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
      expect(path.getAttribute('d')).toBe(expected.path);
      expect(expected.path).toContain('C');
    });

    it('skips an edge whose endpoint does not exist', () => {
      const doc = renderDoc({ nodes: [A], edges: [edge({ target: { nodeId: 'ghost' } })] });
      expect(doc.querySelectorAll('g[data-edge]')).toHaveLength(0);
      expect(doc.querySelectorAll('g[data-node]')).toHaveLength(1);
    });

    describe('arrowheads', () => {
      it('defines one white marker shaped like the on-screen arrowhead', () => {
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
        expect(head.getAttribute('fill')).toBe('#ffffff');
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
  });

  describe('edge labels', () => {
    it('draws a chip centred on the label point, sized from the measurer', () => {
      const labelled = group(renderDoc({ nodes: [A, B], edges: [edge({ label: 'yes' })], padding: 0 }), 'data-edge', 'e1');
      // The straight path M100,25 L200,25 has its label point at 150,25;
      // "yes" measures 21 px, plus 8 px padding each side.
      const chip = only(labelled, 'rect');
      expect(chip.getAttribute('x')).toBe('131.5');
      expect(chip.getAttribute('y')).toBe('15');
      expect(chip.getAttribute('width')).toBe('37');
      expect(chip.getAttribute('height')).toBe('20');
      expect(chip.getAttribute('rx')).toBe('4');
      expect(chip.getAttribute('fill')).toBe('#1B1922');
      expect(chip.getAttribute('stroke')).toBe('rgba(255,255,255,0.2)');
      const text = only(labelled, 'text');
      expect(text.getAttribute('x')).toBe('150');
      expect(text.getAttribute('y')).toBe('25');
      expect(text.getAttribute('font-size')).toBe('10.5');
      expect(text.getAttribute('font-family')).toBe(LABEL_FONT_FAMILY);
      expect(text.getAttribute('fill')).toBe('#ffffff');
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
    const ab = edge({ id: 'ab', source: { nodeId: 'a', side: 'right' }, target: { nodeId: 'b', side: 'left' } });
    const bc = edge({ id: 'bc', source: { nodeId: 'b', side: 'right' }, target: { nodeId: 'c', side: 'left' } });
    const ids = (doc: Document, attribute: string) =>
      Array.from(doc.querySelectorAll(`g[${attribute}]`)).map((element) => element.getAttribute(attribute));

    it('exports everything when no selection is given', () => {
      const doc = renderDoc({ nodes: [A, B, C], edges: [ab, bc] });
      expect(ids(doc, 'data-node')).toEqual(['a', 'b', 'c']);
      expect(ids(doc, 'data-edge')).toEqual(['ab', 'bc']);
    });

    it('exports only the selected nodes', () => {
      const selection: DiagramSelection = [
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ];
      const doc = renderDoc({ nodes: [A, B, C], edges: [ab, bc], selection });
      expect(ids(doc, 'data-node')).toEqual(['a', 'b']);
    });

    it('keeps a selected edge only when both ends are selected nodes', () => {
      const selection: DiagramSelection = [
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
        { type: 'edge', id: 'ab' },
        { type: 'edge', id: 'bc' },
      ];
      const doc = renderDoc({ nodes: [A, B, C], edges: [ab, bc], selection });
      expect(ids(doc, 'data-edge')).toEqual(['ab']);
    });

    it('drops an unselected edge even when both of its nodes are selected', () => {
      const selection: DiagramSelection = [
        { type: 'node', id: 'a' },
        { type: 'node', id: 'b' },
      ];
      const doc = renderDoc({ nodes: [A, B, C], edges: [ab, bc], selection });
      expect(ids(doc, 'data-edge')).toEqual([]);
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
});

describe('svgToPngBlob', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150" viewBox="0 0 300 150"><rect width="300" height="150" fill="#1B1922"/></svg>';

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
  let toBlobCalls: { width: number; height: number; type: string | undefined }[] = [];
  let context: { drawImage: typeof drawImage } | null = { drawImage };
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  beforeEach(() => {
    ImageStub.instances = [];
    ImageStub.fail = false;
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
      callback(pngBlob);
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
});
