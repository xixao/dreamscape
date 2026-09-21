'use client';

import { AnnotationFields } from '../accessibility/annotation-fields';
import { TableFields } from './table-fields';
import type { FieldSchema } from '@/components/blocks/schema';
import {
  ARROW_KINDS,
  CONNECTOR_KINDS,
  DIAGRAM_COLORS,
  LINE_STYLES,
  NODE_KINDS,
  TEXT_COLORS,
  TEXT_FONTS,
  TEXT_SIZES,
  type ArrowKind,
  type ConnectorKind,
  type DiagramAction,
  type DiagramColor,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeKind,
  type LineStyle,
  type TextColor,
  type TextFont,
  type TextSize,
} from '@/lib/diagram/store';
import { SECTION, SECTION_TITLE } from '../chrome';
import { Field } from '../inspector/field';

// `nodes`, when given, is every currently co-selected shape (spec section
// 9: "with several shapes selected they apply to every selected shape as
// one history step") - used only by the three text-style fields below, for
// their own Mixed-state display and multi-id dispatch; the existing
// kind/color/text/width/height fields still read and write only `node`
// (the first/primary selection), unchanged. Omitted or a single-element
// array is exactly today's one-shape selection, the only case
// workbench.tsx's selectedDiagramFields() currently produces (a 2+-node
// diagram selection shows the alignment row instead, inspector.tsx) - so
// this stays fully backward compatible until a future change wires a real
// multi-node selection through to here.
export type DiagramFieldsSelection =
  | { type: 'node'; node: DiagramNode; nodes?: DiagramNode[] }
  | { type: 'edge'; edge: DiagramEdge };

// Exported so the right-click context menu (diagram-layer.tsx's "Change
// shape"/"Color"/"Connector"/"Arrowheads" submenus) shows the exact same
// wording as this panel, instead of a second, driftable copy of the same
// six/six/three/three labels.
export const KIND_LABELS: Record<DiagramNodeKind, string> = {
  rect: 'Rectangle',
  rounded: 'Rounded',
  decision: 'Decision',
  terminal: 'Terminal',
  text: 'Text',
  note: 'Note',
  table: 'Table',
};
export const COLOR_LABELS: Record<DiagramColor, string> = {
  neutral: 'Neutral',
  blue: 'Blue',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  violet: 'Violet',
};
export const CONNECTOR_LABELS: Record<ConnectorKind, string> = { straight: 'Straight', step: 'Step', curve: 'Curve' };
export const ARROW_LABELS: Record<ArrowKind, string> = { end: 'End', both: 'Both', none: 'None' };
// Spec section 14 - the right-click menu's "Line" submenu (diagram-layer.tsx)
// shows these exact words too, same reason as CONNECTOR_LABELS/ARROW_LABELS
// above.
export const LINE_STYLE_LABELS: Record<LineStyle, string> = { solid: 'Solid', dashed: 'Dashed' };
// Spec section 9 - exported for the same reason as KIND_LABELS/COLOR_LABELS
// above: the right-click menu's "Text" submenu (diagram-layer.tsx) shows
// these exact words too.
export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xlarge: 'Extra Large',
  huge: 'Huge',
};
export const TEXT_FONT_LABELS: Record<TextFont, string> = { sans: 'Sans', serif: 'Serif', mono: 'Mono' };
export const TEXT_COLOR_LABELS: Record<TextColor, string> = {
  default: 'Default',
  neutral: 'Neutral',
  blue: 'Blue',
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  violet: 'Violet',
  black: 'Black',
};

// Plain (non-responsive) FieldSchema objects, reusing components/workbench/
// inspector/field.tsx exactly as a block's own schema does (spec section 3:
// "using the same field components as blocks") - `responsive` stays unset
// (falsy) on every one, so the `breakpoint` prop Field still requires is
// never actually consulted; 'mobile' is passed for it below purely to
// satisfy that type, not because it means anything here.
const NODE_KIND_FIELD: FieldSchema = {
  prop: 'kind',
  label: 'Shape',
  kind: 'select',
  section: 'Style',
  options: NODE_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] })),
};
// Color moved below, alongside the other Mixed-aware field builders (Matt's
// multi-selection follow-up) - see the comment there.
const NODE_TEXT_FIELD: FieldSchema = { prop: 'text', label: 'Text', kind: 'text', section: 'Content' };
const NODE_WIDTH_FIELD: FieldSchema = { prop: 'width', label: 'Width', kind: 'text', section: 'Layout' };
const NODE_HEIGHT_FIELD: FieldSchema = { prop: 'height', label: 'Height', kind: 'text', section: 'Layout' };

const EDGE_KIND_FIELD: FieldSchema = {
  prop: 'kind',
  label: 'Connector',
  kind: 'select',
  section: 'Style',
  options: CONNECTOR_KINDS.map((kind) => ({ value: kind, label: CONNECTOR_LABELS[kind] })),
};
const EDGE_ARROW_FIELD: FieldSchema = {
  prop: 'arrow',
  label: 'Arrows',
  kind: 'select',
  section: 'Style',
  options: ARROW_KINDS.map((arrow) => ({ value: arrow, label: ARROW_LABELS[arrow] })),
};
// Spec section 14: the connector's LINE style (solid/dashed), independent
// of its shape (EDGE_KIND_FIELD's straight/step/curve) - next to Kind and
// Arrows, same section, same plain (non-Mixed-aware) FieldSchema shape.
const EDGE_LINE_STYLE_FIELD: FieldSchema = {
  prop: 'lineStyle',
  label: 'Line',
  kind: 'select',
  section: 'Style',
  options: LINE_STYLES.map((style) => ({ value: style, label: LINE_STYLE_LABELS[style] })),
};
const EDGE_LABEL_FIELD: FieldSchema = { prop: 'label', label: 'Label', kind: 'text', section: 'Content' };

// Number('') is 0, not NaN - without the explicit blank check below,
// clearing the width/height field (a real, common step on the way to
// typing a new value) would briefly dispatch a bogus zero-size resize.
// Rounded to the nearest integer (re-review 2 finding 27): canvas
// coordinates and sizes are integers, and the reducer applies a resize
// exactly now, so a typed "12.5" would otherwise be stored as typed.
function parsedNumber(raw: unknown): number | null {
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : null;
}

// Spec section 9: "showing the selection's common value or 'Mixed' when
// several selected shapes differ" - a sentinel rather than `null`/`undefined`
// so it can be a real, selectable FieldOption (below) the same way any other
// value is: Field's own Select/ToggleGroup (components/workbench/inspector/
// field.tsx) shows whichever option's value matches the field's current
// `value`, and neither widget has a "placeholder for no match" mode of its
// own to piggyback on instead. Not one of the real TEXT_SIZES/TEXT_FONTS/
// TEXT_COLORS values, so it can never collide with one.
const MIXED = '__mixed__';

/** `getValue(nodes[0])` when every node agrees, `MIXED` otherwise - `nodes.length === 1` (today's only reachable case, see DiagramFieldsSelection's own comment) always agrees with itself. */
function valueOrMixed<T>(nodes: DiagramNode[], getValue: (node: DiagramNode) => T): T | typeof MIXED {
  const [first, ...rest] = nodes.map(getValue);
  return rest.every((value) => value === first) ? first : MIXED;
}

// Color and the three text-style fields are built per-render, not as plain
// module constants like NODE_KIND_FIELD above, because their `options`
// gain a synthetic "Mixed" entry exactly when the current selection
// disagrees (Matt's multi-selection follow-up: "the shape fields that
// make sense for many shapes at once") - which also happens to be the one
// thing that flips Field's own >3-options Select-vs-ToggleGroup choice for
// Text size/Font (three real options) from a segmented control (nothing
// shown pressed, while mixed - itself a legible "mixed" state) to a
// dropdown that can show the word "Mixed", with no change needed in
// field.tsx. Color already has more than three options, so it is always a
// Select either way.
function colorField(mixed: boolean): FieldSchema {
  return {
    prop: 'color',
    label: 'Color',
    kind: 'select',
    section: 'Style',
    options: [
      ...DIAGRAM_COLORS.map((color) => ({ value: color, label: COLOR_LABELS[color] })),
      ...(mixed ? [{ value: MIXED, label: 'Mixed' }] : []),
    ],
  };
}
function textSizeField(mixed: boolean): FieldSchema {
  return {
    prop: 'textSize',
    label: 'Text size',
    kind: 'select',
    section: 'Style',
    options: [
      ...TEXT_SIZES.map((size) => ({ value: size, label: TEXT_SIZE_LABELS[size] })),
      ...(mixed ? [{ value: MIXED, label: 'Mixed' }] : []),
    ],
  };
}
function textFontField(mixed: boolean): FieldSchema {
  return {
    prop: 'textFont',
    label: 'Font',
    kind: 'select',
    section: 'Style',
    options: [
      ...TEXT_FONTS.map((font) => ({ value: font, label: TEXT_FONT_LABELS[font] })),
      ...(mixed ? [{ value: MIXED, label: 'Mixed' }] : []),
    ],
  };
}
function textColorField(mixed: boolean): FieldSchema {
  return {
    prop: 'textColor',
    label: 'Text color',
    kind: 'select',
    section: 'Style',
    options: [
      ...TEXT_COLORS.map((color) => ({ value: color, label: TEXT_COLOR_LABELS[color] })),
      ...(mixed ? [{ value: MIXED, label: 'Mixed' }] : []),
    ],
  };
}

/**
 * The Design tab's fields for a selected diagram shape or connector (spec
 * docs/superpowers/specs/2026-09-13-diagrams-design.md section 3: "kind,
 * colour, text, size, connector kind, arrows, label"), rendered by
 * inspector.tsx in place of the usual Craft-node fields whenever a diagram
 * element - rather than a block - is selected. Dispatches straight into the
 * same diagram reducer (lib/diagram/store.ts) DiagramLayer itself uses, so
 * an edit here and a drag on the canvas are exactly the same kind of
 * action, undo included.
 */
export function DiagramFields({
  selected,
  onAction,
}: {
  selected: DiagramFieldsSelection;
  onAction: (action: DiagramAction) => void;
}) {
  if (selected.type === 'node') {
    const { node } = selected;
    if (selected.nodes && selected.nodes.length > 1 && selected.nodes.some(item => item.annotation)) return <p className="text-xs text-muted-foreground">Select one annotation to edit its details.</p>;
    if (node.annotation) return <AnnotationFields node={node} onAction={onAction} />;
    // Spec section 9 / Matt's multi-selection follow-up - see
    // DiagramFieldsSelection's own comment above: `nodes` is every
    // co-selected shape, `multi` gates the single-shape-only fields (Text,
    // Shape, Width, Height - none of them has one sensible value across
    // several differently-sized, differently-worded shapes) off entirely,
    // "make sense for many shapes at once" being the operative phrase for
    // which fields survive: Color and the three text-style fields still
    // show, Mixed when the selection disagrees.
    const nodes = selected.nodes && selected.nodes.length > 0 ? selected.nodes : [node];
    const multi = nodes.length > 1;
    const nodeIds = nodes.map((n) => n.id);
    const colorValue = valueOrMixed(nodes, (n) => n.color);
    const textSizeValue = valueOrMixed(nodes, (n) => n.textSize ?? 'medium');
    const textFontValue = valueOrMixed(nodes, (n) => n.textFont ?? 'sans');
    const textColorValue = valueOrMixed(nodes, (n) => n.textColor ?? 'default');
    return (
      <>
        {!multi && (
          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Content</h3>
            <div className="flex flex-col gap-3">
              {node.kind === 'table' ? <TableFields node={node} onChange={cells => onAction({ type: 'setTable', id: node.id, cells })} /> : <Field
                field={NODE_TEXT_FIELD}
                value={node.text}
                breakpoint="mobile"
                onChange={(next) => onAction({ type: 'setText', id: node.id, text: String(next) })}
              />}
            </div>
          </section>
        )}
        <section className={SECTION}>
          <h3 className={SECTION_TITLE}>Appearance</h3>
          <div className="flex flex-col gap-3">
            {!multi && (
              <Field
                field={NODE_KIND_FIELD}
                value={node.kind}
                breakpoint="mobile"
                onChange={(next) => onAction({ type: 'setKind', id: node.id, kind: next as DiagramNodeKind })}
              />
            )}
            <Field
              field={colorField(colorValue === MIXED)}
              value={colorValue}
              breakpoint="mobile"
              onChange={(next) => {
                if (next === MIXED) return;
                onAction({ type: 'setColor', ids: nodeIds, color: next as DiagramColor });
              }}
            />
            <Field
              field={{ prop: 'textAlign', label: 'Text alignment', kind: 'select', section: 'Style', options: [{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'}, {value:MIXED,label:'Mixed'}] }}
              value={valueOrMixed(nodes, n => n.textAlign ?? (n.kind === 'table' ? 'left' : 'center'))}
              breakpoint="mobile"
              onChange={next => { if (next !== MIXED) onAction({type:'setTextStyle', ids:nodeIds, textAlign:next as 'left'|'center'|'right'}); }}
            />
            <Field
              field={textSizeField(textSizeValue === MIXED)}
              value={textSizeValue}
              breakpoint="mobile"
              onChange={(next) => {
                if (next === MIXED) return;
                onAction({ type: 'setTextStyle', ids: nodeIds, textSize: next as TextSize });
              }}
            />
            <Field
              field={textFontField(textFontValue === MIXED)}
              value={textFontValue}
              breakpoint="mobile"
              onChange={(next) => {
                if (next === MIXED) return;
                onAction({ type: 'setTextStyle', ids: nodeIds, textFont: next as TextFont });
              }}
            />
            <Field
              field={textColorField(textColorValue === MIXED)}
              value={textColorValue}
              breakpoint="mobile"
              onChange={(next) => {
                if (next === MIXED) return;
                onAction({ type: 'setTextStyle', ids: nodeIds, textColor: next as TextColor });
              }}
            />
          </div>
        </section>
        {!multi && (
          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Size</h3>
            <div className="flex flex-col gap-3">
              <Field
                field={NODE_WIDTH_FIELD}
                value={node.width}
                breakpoint="mobile"
                onChange={(next) => {
                  const width = parsedNumber(next);
                  if (width !== null) onAction({ type: 'resize', id: node.id, width, height: node.height });
                }}
              />
              <Field
                field={NODE_HEIGHT_FIELD}
                value={node.height}
                breakpoint="mobile"
                onChange={(next) => {
                  const height = parsedNumber(next);
                  if (height !== null) onAction({ type: 'resize', id: node.id, width: node.width, height });
                }}
              />
            </div>
          </section>
        )}
      </>
    );
  }

  const { edge } = selected;
  return (
    <section className={SECTION}>
      <h3 className={SECTION_TITLE}>Connector</h3>
      <div className="flex flex-col gap-3">
        <Field
          field={EDGE_KIND_FIELD}
          value={edge.kind}
          breakpoint="mobile"
          onChange={(next) => onAction({ type: 'setKind', id: edge.id, kind: next as ConnectorKind })}
        />
        <Field
          field={EDGE_ARROW_FIELD}
          value={edge.arrow}
          breakpoint="mobile"
          onChange={(next) => onAction({ type: 'setArrow', id: edge.id, arrow: next as ArrowKind })}
        />
        <Field
          field={EDGE_LINE_STYLE_FIELD}
          value={edge.lineStyle ?? 'solid'}
          breakpoint="mobile"
          onChange={(next) => onAction({ type: 'setLineStyle', id: edge.id, lineStyle: next as LineStyle })}
        />
        <Field field={textSizeField(false)} value={edge.textSize ?? 'small'} breakpoint="mobile" onChange={next=>onAction({type:'setLabelStyle',id:edge.id,patch:{textSize:next as TextSize}})} />
        <Field field={textFontField(false)} value={edge.textFont ?? 'mono'} breakpoint="mobile" onChange={next=>onAction({type:'setLabelStyle',id:edge.id,patch:{textFont:next as TextFont}})} />
        <div className="flex gap-2">
          <button aria-pressed={!!edge.textBold} className="rounded border px-3 py-1 font-bold" onClick={()=>onAction({type:'setLabelStyle',id:edge.id,patch:{textBold:!edge.textBold}})}>Bold</button>
          <button aria-pressed={!!edge.textItalic} className="rounded border px-3 py-1 italic" onClick={()=>onAction({type:'setLabelStyle',id:edge.id,patch:{textItalic:!edge.textItalic}})}>Italic</button>
        </div>
        <Field
          field={EDGE_LABEL_FIELD}
          value={edge.label ?? ''}
          breakpoint="mobile"
          onChange={(next) => onAction({ type: 'setText', id: edge.id, text: String(next) })}
        />
      </div>
    </section>
  );
}
