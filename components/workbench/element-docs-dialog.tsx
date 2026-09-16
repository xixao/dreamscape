'use client';

import type { RefObject } from 'react';
import { getElementDoc } from '@/components/blocks/docs';
import { resolver, schemaFor, trayItems } from '@/components/blocks/registry';
import type { BlockSchema, FieldSchema } from '@/components/blocks/schema';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isResponsive } from '@/lib/responsive';
import { cn } from '@/lib/utils';
import {
  LABEL,
  OVERLAY_CAPTION,
  OVERLAY_GROUP_TITLE,
  OVERLAY_KEY_CAP,
  OVERLAY_PARAGRAPH,
  OVERLAY_TITLE,
  WIDE_DIALOG_CONTENT,
} from './chrome';
import { DIAGRAM_TOOL_ITEMS, diagramToolDocKey } from './diagram/diagram-palette';

// Table structure only (type comes from the chrome constants above).
const CELL = 'border-t border-line-soft py-2.5 pr-4 align-top';

export interface PropertyRow {
  prop: string;
  label: string;
  type: string;
  defaultValue: string;
}

// A block's default props live on its Craft config (`Block.craft.props`,
// the same object Craft applies when the block is dropped), not on its
// schema, so the Properties table reads them from the resolver.
function defaultPropsFor(type: string): Record<string, unknown> {
  if (!Object.hasOwn(resolver, type)) return {};
  const component: { craft?: { props?: object } } = resolver[type as keyof typeof resolver];
  return (component.craft?.props ?? {}) as Record<string, unknown>;
}

// Figma's own property vocabulary: a select is listed by its options (the
// variants), text and boolean properties by their kind.
function typeLabel(field: FieldSchema): string {
  if (field.kind === 'select') return (field.options ?? []).map((option) => option.label).join(', ');
  return field.kind === 'boolean' ? 'Boolean' : 'Text';
}

function valueLabel(field: FieldSchema, value: unknown): string {
  if (value === undefined || value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (field.options) {
    return field.options.find((option) => String(option.value) === String(value))?.label ?? String(value);
  }
  if (typeof value === 'string') return value === '' ? 'Empty' : value;
  // No block has one today; a plain object default would otherwise read
  // "[object Object]".
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// A responsive default ({ mobile, desktop }) reads per breakpoint, or once
// when both breakpoints agree.
function defaultLabel(field: FieldSchema, value: unknown): string {
  if (isResponsive<unknown>(value)) {
    const mobile = valueLabel(field, value.mobile);
    const desktop = value.desktop === undefined ? mobile : valueLabel(field, value.desktop);
    return mobile === desktop ? mobile : `${mobile} (mobile), ${desktop} (desktop)`;
  }
  return valueLabel(field, value);
}

/**
 * The Properties table's rows for a schema, in schema order, minus
 * editor-only fields (canvas conveniences such as the Dialog's "Show content
 * on canvas", which are not properties of the element itself). `defaults`
 * is the block's default props; a prop missing from it reads "None".
 */
export function schemaRows(schema: BlockSchema, defaults: Record<string, unknown>): PropertyRow[] {
  return schema.fields
    .filter((field) => !field.editorOnly)
    .map((field) => ({
      prop: field.prop,
      label: field.label,
      type: typeLabel(field),
      defaultValue: defaultLabel(field, defaults[field.prop]),
    }));
}

/** schemaRows for one element type; empty for a type with no schema. */
export function propertyRows(type: string): PropertyRow[] {
  const schema = schemaFor(type);
  return schema ? schemaRows(schema, defaultPropsFor(type)) : [];
}

/**
 * Component documentation (spec docs/superpowers/specs/2026-09-13-element-
 * docs-design.md): opened from the "i" button on an Components tab row, sized
 * like the shortcuts dialog through WIDE_DIALOG_CONTENT. Left column: the
 * element's name, its group, the Summary and Usage paragraphs from
 * components/blocks/docs.ts. Right column: the Properties table generated
 * from the element's schema, then the stub note. Takes the element type
 * only, so richer content can replace the stub without touching the list.
 *
 * `openerRef` is the element that opened the dialog (the row's "i"
 * button); focus returns to it on close. Radix's modal Dialog only returns
 * focus to its own DialogTrigger, and a single controlled dialog shared by
 * every row has none, so without this focus would land on the body.
 */
export function ElementDocsDialog({
  type,
  open,
  onOpenChange,
  openerRef,
}: {
  type: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef?: RefObject<HTMLElement | null>;
}) {
  const item = trayItems.find((entry) => entry.type === type);
  // A diagram tool (spec docs/superpowers/specs/2026-09-13-diagrams-design.md
  // section 13) is not a tray item - no BlockType, no schema - so its own
  // label and group caption come from DIAGRAM_TOOL_ITEMS instead, keyed the
  // same way component-tray.tsx opened this dialog for it (diagramToolDocKey).
  // Only looked up once `item` above found nothing, so a real tray item's
  // own label/group always wins.
  const diagramItem = !item ? DIAGRAM_TOOL_ITEMS.find((entry) => diagramToolDocKey(entry.tool) === type) : undefined;
  const label = item?.label ?? diagramItem?.label ?? type;
  const group = item?.group ?? (diagramItem ? 'Diagram' : undefined);
  const doc = getElementDoc(type);
  const rows = propertyRows(type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={WIDE_DIALOG_CONTENT}
        onCloseAutoFocus={(event) => {
          const opener = openerRef?.current;
          if (!opener) return;
          // preventDefault also skips Radix's own handler, which would
          // otherwise focus the (absent) trigger instead.
          event.preventDefault();
          opener.focus();
        }}
      >
        {/* Only the columns scroll on a short window: shadcn's close button
        is positioned absolutely inside DialogContent, so making
        DialogContent the scroll container would scroll it away. The cap is
        the window minus the dialog's 24px margins and its 1rem padding. */}
        <div className="max-h-[calc(100vh-48px-2rem)] overflow-y-auto">
          <div className="grid grid-cols-1 gap-x-12 gap-y-7 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex flex-col gap-6">
              <DialogHeader className="gap-1.5">
                <DialogTitle className={OVERLAY_TITLE}>{label}</DialogTitle>
                {group && <p className={OVERLAY_CAPTION}>{group}</p>}
              </DialogHeader>
              <section>
                <h3 className={OVERLAY_GROUP_TITLE}>Summary</h3>
                <DialogDescription className={OVERLAY_PARAGRAPH}>{doc.summary}</DialogDescription>
              </section>
              <section>
                <h3 className={OVERLAY_GROUP_TITLE}>Usage</h3>
                <p className={OVERLAY_PARAGRAPH}>{doc.usage}</p>
              </section>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className={cn(OVERLAY_GROUP_TITLE, 'mb-0')}>Properties</h3>
              {rows.length > 0 ? (
                <table aria-label="Properties" className="w-full border-collapse text-left">
                  <thead>
                    <tr>
                      <th scope="col" className={cn(LABEL, 'pb-2 pr-4')}>
                        Property
                      </th>
                      <th scope="col" className={cn(LABEL, 'pb-2 pr-4')}>
                        Type
                      </th>
                      <th scope="col" className={cn(LABEL, 'pb-2')}>
                        Default
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.prop}>
                        <td className={cn(CELL, 'whitespace-nowrap')}>
                          <code className={OVERLAY_KEY_CAP}>{row.prop}</code>
                          <span className="ml-2 text-[12px] text-muted-foreground">{row.label}</span>
                        </td>
                        <td className={cn(CELL, OVERLAY_PARAGRAPH)}>{row.type}</td>
                        <td className={cn(CELL, OVERLAY_PARAGRAPH, 'pr-0')}>{row.defaultValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={OVERLAY_PARAGRAPH}>This item has no properties.</p>
              )}
              <p className={cn(OVERLAY_CAPTION, 'mt-2')}>Full documentation is coming soon.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
