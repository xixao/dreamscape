import { ROOT_NODE, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode } from 'react';
import {
  COLUMN_OPTIONS,
  GAP_OPTIONS,
  LAYOUT_BOX_DEFAULTS,
  PADDING_OPTIONS,
  type LayoutBoxProps,
  blockClasses,
  layoutBoxClasses,
} from '@/lib/classes';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { useStage } from '@/components/workbench/stage-context';
import { DropZone, StageEmptyState } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export type LayoutBoxBlockProps = Partial<LayoutBoxProps> & { children?: ReactNode };

export const LayoutBox: UserComponent<LayoutBoxBlockProps> = ({ children, ...props }) => {
  const { breakpoint } = useStage();
  const {
    connectors: { connect, drag },
    id,
    childCount,
  } = useNode((node) => ({ childCount: node.data.nodes.length }));
  const isRoot = id === ROOT_NODE;
  const merged: LayoutBoxProps = { ...LAYOUT_BOX_DEFAULTS, ...props };

  return (
    <div
      ref={(element) => {
        if (!element) return;
        if (isRoot) connect(element);
        else connect(drag(element));
      }}
      data-block="LayoutBox"
      className={cn(layoutBoxClasses(merged, breakpoint), !isRoot && blockClasses(merged))}
      style={isRoot ? { minHeight: ARTBOARD_MIN_HEIGHT } : undefined}
    >
      {childCount === 0 ? (isRoot ? <StageEmptyState /> : <DropZone />) : children}
    </div>
  );
};

LayoutBox.craft = {
  displayName: 'LayoutBox',
  props: LAYOUT_BOX_DEFAULTS,
  rules: {
    canDrag: (node) => node.id !== ROOT_NODE,
  },
};

const isFlex = (props: Record<string, unknown>) => props.mode !== 'grid';
const isGrid = (props: Record<string, unknown>) => props.mode === 'grid';

export const layoutBoxSchema: BlockSchema = {
  type: 'LayoutBox',
  fields: [
    {
      prop: 'mode',
      label: 'Mode',
      kind: 'select',
      section: 'Layout',
      options: [
        { value: 'flex', label: 'Flex' },
        { value: 'grid', label: 'Grid' },
      ],
    },
    {
      prop: 'direction',
      label: 'Direction',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      showWhen: isFlex,
      options: [
        { value: 'row', label: 'Row' },
        { value: 'column', label: 'Column' },
      ],
    },
    {
      prop: 'columns',
      label: 'Columns',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      showWhen: isGrid,
      options: COLUMN_OPTIONS.map((value) => ({ value, label: String(value) })),
    },
    {
      prop: 'align',
      label: 'Align',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' },
        { value: 'stretch', label: 'Stretch' },
      ],
    },
    {
      prop: 'justify',
      label: 'Justify',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      showWhen: isFlex,
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' },
        { value: 'between', label: 'Between' },
      ],
    },
    {
      prop: 'gap',
      label: 'Gap',
      kind: 'select',
      section: 'Layout',
      options: GAP_OPTIONS.map((value) => ({ value, label: String(value) })),
    },
    {
      prop: 'padding',
      label: 'Padding',
      kind: 'select',
      section: 'Layout',
      options: PADDING_OPTIONS.map((value) => ({ value, label: String(value) })),
    },
    {
      prop: 'background',
      label: 'Background',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'none', label: 'None' },
        { value: 'muted', label: 'Muted' },
        { value: 'card', label: 'Card' },
      ],
    },
    GROW_FIELD,
  ],
};
