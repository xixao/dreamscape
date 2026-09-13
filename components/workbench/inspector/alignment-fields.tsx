'use client';

import type { ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalSpaceBetween,
  LayoutGrid,
  StretchHorizontal,
  StretchVertical,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  alignBottom,
  alignHorizontalCenters,
  alignLeft,
  alignRight,
  alignTop,
  alignVerticalMiddles,
  distributeHorizontally,
  distributeVertically,
  tidyUp,
  type AlignableFrame,
  type FramePosition,
} from '@/lib/canvas/align';
import type { Align, Justify, SpacingPx } from '@/lib/classes';
import { SECTION, SECTION_TITLE } from '../chrome';

// The generic vocabulary every context below maps onto - shared with
// lib/diagram/store.ts's own align({ids, mode})/distribute({ids, axis})
// actions (branch diagram-followups) so one row and one set of modes/axes
// serves all three contexts without each caller inventing its own.
export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

// A canvas selection of two or more frames (spec docs/superpowers/specs/
// 2026-09-13-grid-snapping-alignment-design.md section 4) - each button
// writes x/y for every frame through onAlign in one call, which the caller
// (inspector.tsx, via WorkbenchShell) saves as a single patch the same way
// a multi-frame drag does (components/workbench/canvas.tsx's onMoveScreens).
export type FrameAlignmentContext = {
  type: 'frames';
  frames: AlignableFrame[];
  onAlign: (positions: FramePosition[]) => void;
};

// A layer inside an Auto layout container, or the container itself (spec
// section 4) - the same icon row instead maps onto the CONTAINER's own
// align/justify props (`onChange` always targets the container, even when
// the selected node is one of its children - see inspector.tsx for how the
// two are told apart). Review fix wave nit 13: the on-axis Distribute
// button's real DOM measurement (lib/classes.ts's own distributeGapPx,
// over a live getBoundingClientRect read) is deferred to `onDistribute`,
// called only on an actual click - `canDistribute` gates the button on the
// container's own child count (>= 2) instead, cheap node-tree data rather
// than a DOM read on every render.
export type LayoutAlignmentContext = {
  type: 'layout';
  direction: 'row' | 'column';
  align: Align;
  justify: Justify;
  onChange: (patch: { align?: Align; justify?: Justify; gapPx?: SpacingPx }) => void;
  canDistribute: boolean;
  onDistribute: () => void;
};

// A diagram selection of two or more shapes (Matt, 2026-09-13: "i also need
// alignment options when selecting multiple shapes") - `onAlign`/
// `onDistribute` dispatch straight into the diagram reducer's own actions;
// inspector.tsx/workbench.tsx build these, this component only ever calls
// them with a mode/axis, never touching the diagram store itself.
export type DiagramAlignmentContext = {
  type: 'diagram';
  count: number;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: DistributeAxis) => void;
};

export type AlignmentContext = FrameAlignmentContext | LayoutAlignmentContext | DiagramAlignmentContext;

function AlignButton({
  label,
  icon: Icon,
  disabled,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  // Review fix wave item 7: only the Auto layout context has a persisted
  // "current value" to reflect (align/justify on the container) - frames
  // and diagram selections are one-shot actions with nothing to toggle, so
  // they simply never pass this, and aria-pressed is omitted for them
  // (React drops an undefined attribute) rather than forced to false.
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
          <Icon className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// lucide's align-*-vertical icons depict tall (vertical) bars aligned by
// their left/centre/right edges - "align on the horizontal axis"; its
// align-*-horizontal icons depict wide (horizontal) bars aligned by their
// top/centre/bottom edges - "align on the vertical axis". The distribute
// icons name themselves by axis instead (Horizontal = spreads left-right).
const ALIGN_ORDER: readonly AlignMode[] = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'];
const ALIGN_ICONS: Record<AlignMode, LucideIcon> = {
  left: AlignStartVertical,
  centerX: AlignCenterVertical,
  right: AlignEndVertical,
  top: AlignStartHorizontal,
  centerY: AlignCenterHorizontal,
  bottom: AlignEndHorizontal,
};
const ALIGN_LABELS: Record<AlignMode, string> = {
  left: 'Align left',
  centerX: 'Align horizontal centers',
  right: 'Align right',
  top: 'Align top',
  // Figma wording (review fix wave nit 14): "vertical centers" pairs with
  // "horizontal centers" (centerX, above) - "middles" was this row's own
  // one-off term for the identical concept.
  centerY: 'Align vertical centers',
  bottom: 'Align bottom',
};

export interface AlignmentRowEnabled {
  left: boolean;
  centerX: boolean;
  right: boolean;
  top: boolean;
  centerY: boolean;
  bottom: boolean;
  distributeHorizontal: boolean;
  distributeVertical: boolean;
  tidyUp: boolean;
}

/** Every align button sharing one gate (every context today enables/disables its whole align group together) - individual contexts still get a distinct flag per distribute axis and for Tidy up. */
function uniformEnabled(
  aligned: boolean,
  distributeHorizontal: boolean,
  distributeVertical: boolean,
  tidyUp = false,
): AlignmentRowEnabled {
  return {
    left: aligned,
    centerX: aligned,
    right: aligned,
    top: aligned,
    centerY: aligned,
    bottom: aligned,
    distributeHorizontal,
    distributeVertical,
    tidyUp,
  };
}

/**
 * The generic icon row every context below drives: six align buttons, two
 * distribute buttons, and (only when `onTidyUp` is given - the frames
 * context alone) Tidy up. `enabled` is a flag per button so each context
 * can gate them on its own terms (a big-enough selection, an axis that
 * matches the container's direction, a measurable gap, ...).
 */
function AlignmentRow({
  onAlign,
  onDistribute,
  onTidyUp,
  enabled,
  active,
  extra,
}: {
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onTidyUp?: () => void;
  enabled: AlignmentRowEnabled;
  // Review fix wave item 7 - see AlignButton's own `active` doc comment.
  active?: Partial<Record<AlignMode, boolean>>;
  // The Auto layout context's own Stretch/Space-between buttons (below) -
  // neither frames nor a diagram selection has an equivalent, so this is a
  // slot rather than a fixed part of the shared row, the same way onTidyUp
  // is already an optional, frames-only addition to it.
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {ALIGN_ORDER.map((mode) => (
        <AlignButton
          key={mode}
          label={ALIGN_LABELS[mode]}
          icon={ALIGN_ICONS[mode]}
          disabled={!enabled[mode]}
          active={active?.[mode]}
          onClick={() => onAlign(mode)}
        />
      ))}
      <AlignButton
        label="Distribute horizontal spacing"
        icon={AlignHorizontalDistributeCenter}
        disabled={!enabled.distributeHorizontal}
        onClick={() => onDistribute('horizontal')}
      />
      <AlignButton
        label="Distribute vertical spacing"
        icon={AlignVerticalDistributeCenter}
        disabled={!enabled.distributeVertical}
        onClick={() => onDistribute('vertical')}
      />
      {extra}
      {onTidyUp && (
        <AlignButton label="Tidy up" icon={LayoutGrid} disabled={!enabled.tidyUp} onClick={onTidyUp} />
      )}
    </div>
  );
}

const FRAME_ALIGN_FNS: Record<AlignMode, (frames: readonly AlignableFrame[]) => FramePosition[]> = {
  left: alignLeft,
  centerX: alignHorizontalCenters,
  right: alignRight,
  top: alignTop,
  centerY: alignVerticalMiddles,
  bottom: alignBottom,
};
const FRAME_DISTRIBUTE_FNS: Record<DistributeAxis, (frames: readonly AlignableFrame[]) => FramePosition[]> = {
  horizontal: distributeHorizontally,
  vertical: distributeVertically,
};

function FrameAlignmentFields({ context }: { context: FrameAlignmentContext }) {
  const aligned = context.frames.length >= 2;
  const distribute = context.frames.length >= 3;

  return (
    <AlignmentRow
      onAlign={(mode) => context.onAlign(FRAME_ALIGN_FNS[mode](context.frames))}
      onDistribute={(axis) => context.onAlign(FRAME_DISTRIBUTE_FNS[axis](context.frames))}
      onTidyUp={() => context.onAlign(tidyUp(context.frames))}
      enabled={uniformEnabled(aligned, distribute, distribute, aligned)}
    />
  );
}

// Which axis (x = horizontal, y = vertical) and which value (start/centre/
// end of that axis) each AlignMode represents - independent of any
// container's own direction, unlike the icon shapes themselves.
const AXIS_OF_ALIGN_MODE: Record<AlignMode, 'x' | 'y'> = {
  left: 'x',
  centerX: 'x',
  right: 'x',
  top: 'y',
  centerY: 'y',
  bottom: 'y',
};
const VALUE_OF_ALIGN_MODE: Record<AlignMode, Align & Justify> = {
  left: 'start',
  centerX: 'center',
  right: 'end',
  top: 'start',
  centerY: 'center',
  bottom: 'end',
};

function LayoutAlignmentFields({ context }: { context: LayoutAlignmentContext }) {
  const isRow = context.direction === 'row';

  function handleAlign(mode: AlignMode): void {
    // The container's MAIN axis is horizontal when it is a row, vertical
    // when a column - a mode on that same axis maps to justify (the
    // main-axis prop), the other axis to align (the cross-axis prop).
    const isMainAxis = (AXIS_OF_ALIGN_MODE[mode] === 'x') === isRow;
    const value = VALUE_OF_ALIGN_MODE[mode];
    context.onChange(isMainAxis ? { justify: value } : { align: value });
  }

  function handleDistribute(axis: DistributeAxis): void {
    const isMainAxis = (axis === 'horizontal') === isRow;
    if (isMainAxis) context.onDistribute();
  }

  // Review fix wave item 7: this is the only context with a persisted
  // "current value" (the container's own align/justify) for the row to
  // reflect - the same axis mapping handleAlign uses above, run in
  // reverse to ask "does THIS mode's value match what the container is
  // set to right now".
  const active: Partial<Record<AlignMode, boolean>> = Object.fromEntries(
    ALIGN_ORDER.map((mode) => {
      const isMainAxis = (AXIS_OF_ALIGN_MODE[mode] === 'x') === isRow;
      const current = isMainAxis ? context.justify : context.align;
      return [mode, current === VALUE_OF_ALIGN_MODE[mode]];
    }),
  );

  // Stretch (align: 'stretch') fills the CROSS axis - vertical for a row,
  // horizontal for a column; Space between (justify: 'between') spreads
  // along the MAIN axis - horizontal for a row, vertical for a column.
  // Icon choice verified against each one's own path data: stretch-vertical
  // draws two full-height bars (fills height, i.e. the cross axis of a
  // row); align-horizontal-space-between draws two bars pinned to vertical
  // guide lines at the far left/right (spread along the main axis of a
  // row) - so a row container gets StretchVertical + AlignHorizontalSpaceBetween,
  // a column the opposite pairing.
  const StretchIcon = isRow ? StretchVertical : StretchHorizontal;
  const SpaceBetweenIcon = isRow ? AlignHorizontalSpaceBetween : AlignVerticalSpaceBetween;

  return (
    <AlignmentRow
      onAlign={handleAlign}
      onDistribute={handleDistribute}
      enabled={uniformEnabled(true, isRow && context.canDistribute, !isRow && context.canDistribute)}
      active={active}
      extra={
        <>
          <AlignButton
            label="Stretch"
            icon={StretchIcon}
            active={context.align === 'stretch'}
            onClick={() => context.onChange({ align: 'stretch' })}
          />
          <AlignButton
            label="Space between"
            icon={SpaceBetweenIcon}
            active={context.justify === 'between'}
            onClick={() => context.onChange({ justify: 'between' })}
          />
        </>
      }
    />
  );
}

function DiagramAlignmentFields({ context }: { context: DiagramAlignmentContext }) {
  const aligned = context.count >= 2;
  const distribute = context.count >= 3;

  return (
    <AlignmentRow
      onAlign={context.onAlign}
      onDistribute={context.onDistribute}
      enabled={uniformEnabled(aligned, distribute, distribute)}
    />
  );
}

/**
 * The Design panel's alignment icon row (spec docs/superpowers/specs/2026-
 * 09-13-grid-snapping-alignment-design.md section 4, extended 2026-09-13 to
 * a third context per Matt: "i also need alignment options when selecting
 * multiple shapes"): a canvas selection of two or more frames (align/
 * distribute/tidy up write x/y), a layer inside Auto layout or the
 * container itself (the same six align icons and the on-axis distribute
 * icon map onto the container's align/justify/gapPx), and a diagram
 * selection of two or more shapes (align/distribute dispatch into the
 * diagram reducer). Rendered by inspector.tsx in place of - for frames and
 * diagram shapes - or alongside - for a layer - the usual fields.
 */
export function AlignmentFields({ context }: { context: AlignmentContext }) {
  return (
    <section className={SECTION} data-testid="alignment-fields">
      <h3 className={SECTION_TITLE}>Align</h3>
      {context.type === 'frames' ? (
        <FrameAlignmentFields context={context} />
      ) : context.type === 'layout' ? (
        <LayoutAlignmentFields context={context} />
      ) : (
        <DiagramAlignmentFields context={context} />
      )}
    </section>
  );
}
