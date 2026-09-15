import { designStyle, SIZE_DEFAULTS, APPEARANCE_DEFAULTS, SIZE_FIELDS, APPEARANCE_FIELDS } from './design-controls';
import type { Breakpoint } from '@/lib/responsive';
import { ROOT_NODE, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode, CSSProperties } from 'react';
import {
  COLUMN_OPTIONS,
  LAYOUT_BOX_DEFAULTS,
  SPACING_OPTIONS,
  type LayoutBoxProps,
  blockClasses,
  layoutBoxClasses,
  normalizeSpacing,
} from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { usePlay } from '@/components/play/play-context';
import { useStage } from '@/components/workbench/stage-context';
import { DropZone, StageEmptyState } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export type LayoutBoxBlockProps = Partial<LayoutBoxProps> & { children?: ReactNode; sizeStyles?: Partial<Record<Breakpoint, Partial<LayoutBoxProps>>> };

export const LayoutBox: UserComponent<LayoutBoxBlockProps> = ({ children, ...props }) => {
  const { breakpoint } = useStage();
  const play = usePlay();
  const {
    connectors: { connect, drag },
    id,
    childCount,
    custom,
  } = useNode((node) => ({ childCount: node.data.nodes.length, custom: node.data.custom }));
  const isRoot = id === ROOT_NODE;
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;
  // normalizeSpacing is applied to the raw incoming `props` (not `merged`)
  // so a legacy props object (gap/padding Tailwind units, no gapPx/paddingPx
  // of its own) converts correctly instead of being masked by the new 8 px
  // default: {...LAYOUT_BOX_DEFAULTS, ...props} alone would leave
  // merged.gapPx at the default whenever props has no gapPx, even when it
  // does carry a real legacy gap value.
  //
  // Caveat: Craft.js's own node deserialization already merges this
  // component's static `craft.props` (LAYOUT_BOX_DEFAULTS below, which has a
  // concrete gapPx/paddingPx) into any deserialized node missing those keys,
  // before this component ever renders. So a *previously saved* node that
  // has legacy gap/padding but no gapPx of its own will already read
  // gapPx: 8 by the time `props` reaches here. This line is still correct
  // and necessary for any props this component receives directly (a plain
  // LayoutBoxProps value, or a node created with legacy props already
  // attached), but fully migrating a pre-existing saved layout's spacing
  // needs a normalizer at the point that layout is loaded, before Craft.js
  // deserializes it (see the `lib/files/validate.ts` normaliser note in the
  // task brief) -- out of this sub-project's file scope.
  const merged: LayoutBoxProps = { ...LAYOUT_BOX_DEFAULTS, ...props, ...normalizeSpacing(props), ...props.sizeStyles?.[breakpoint] };

  return (
    <div
      ref={(element) => {
        if (!element) return;
        if (isRoot) connect(element);
        else connect(drag(element));
      }}
      data-block="LayoutBox"
      className={cn(layoutBoxClasses(merged, breakpoint), !isRoot && blockClasses(merged))}
      style={{ ...(isRoot ? { minHeight: ARTBOARD_MIN_HEIGHT } : {}), gap: merged.gapPx, padding: merged.paddingPx, ...designStyle(merged), '--component-node-min-height': merged.minHeightPx !== undefined ? `${merged.minHeightPx}px` : undefined } as CSSProperties}
      onClick={onClick}
    >
      {childCount === 0 ? (isRoot ? <StageEmptyState /> : <DropZone />) : children}
    </div>
  );
};

LayoutBox.craft = {
  displayName: 'Frame',
  props: { ...LAYOUT_BOX_DEFAULTS, ...SIZE_DEFAULTS, ...APPEARANCE_DEFAULTS },
  rules: {
    canDrag: (node) => node.id !== ROOT_NODE,
  },
};

const isFlex = (props: Record<string, unknown>) => props.mode !== 'grid';
const isGrid = (props: Record<string, unknown>) => props.mode === 'grid';

export const layoutBoxSchema: BlockSchema = {
  type: 'LayoutBox',
  fields: [
    ...SIZE_FIELDS, ...APPEARANCE_FIELDS,
    {
      prop: 'mode',
      label: 'Layout',
      kind: 'select',
      section: 'Layout',
      options: [
        { value: 'flex', label: 'Auto layout' },
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
        { value: 'row', label: 'Horizontal' },
        { value: 'column', label: 'Vertical' },
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
      label: 'Alignment',
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
      label: 'Distribution',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      showWhen: isFlex,
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' },
        { value: 'between', label: 'Space between' },
      ],
    },
    {
      prop: 'gapPx',
      label: 'Gap',
      kind: 'spacing',
      section: 'Layout',
      options: SPACING_OPTIONS.map((value) => ({ value, label: `${value} px` })),
    },
    {
      prop: 'paddingPx',
      label: 'Padding',
      kind: 'spacing',
      section: 'Layout',
      options: SPACING_OPTIONS.map((value) => ({ value, label: `${value} px` })),
    },
    {
      prop: 'background',
      label: 'Fill',
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
