'use client';

import type { FieldSchema } from '@/components/blocks/schema';
import {
  ARROW_KINDS,
  CONNECTOR_KINDS,
  DIAGRAM_COLORS,
  NODE_KINDS,
  type ArrowKind,
  type ConnectorKind,
  type DiagramAction,
  type DiagramColor,
  type DiagramEdge,
  type DiagramNode,
  type DiagramNodeKind,
} from '@/lib/diagram/store';
import { SECTION, SECTION_TITLE } from '../chrome';
import { Field } from '../inspector/field';

export type DiagramFieldsSelection = { type: 'node'; node: DiagramNode } | { type: 'edge'; edge: DiagramEdge };

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
const NODE_COLOR_FIELD: FieldSchema = {
  prop: 'color',
  label: 'Color',
  kind: 'select',
  section: 'Style',
  options: DIAGRAM_COLORS.map((color) => ({ value: color, label: COLOR_LABELS[color] })),
};
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
    return (
      <>
        <section className={SECTION}>
          <h3 className={SECTION_TITLE}>Content</h3>
          <div className="flex flex-col gap-3">
            <Field
              field={NODE_TEXT_FIELD}
              value={node.text}
              breakpoint="mobile"
              onChange={(next) => onAction({ type: 'setText', id: node.id, text: String(next) })}
            />
          </div>
        </section>
        <section className={SECTION}>
          <h3 className={SECTION_TITLE}>Appearance</h3>
          <div className="flex flex-col gap-3">
            <Field
              field={NODE_KIND_FIELD}
              value={node.kind}
              breakpoint="mobile"
              onChange={(next) => onAction({ type: 'setKind', id: node.id, kind: next as DiagramNodeKind })}
            />
            <Field
              field={NODE_COLOR_FIELD}
              value={node.color}
              breakpoint="mobile"
              onChange={(next) => onAction({ type: 'setColor', id: node.id, color: next as DiagramColor })}
            />
          </div>
        </section>
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
          field={EDGE_LABEL_FIELD}
          value={edge.label ?? ''}
          breakpoint="mobile"
          onChange={(next) => onAction({ type: 'setText', id: edge.id, text: String(next) })}
        />
      </div>
    </section>
  );
}
