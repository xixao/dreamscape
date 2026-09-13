import { type Breakpoint, type Responsive, resolve } from './responsive';

export type LayoutMode = 'flex' | 'grid';
export type Direction = 'row' | 'column';
export type Columns = 1 | 2 | 3 | 4;
export type Align = 'start' | 'center' | 'end' | 'stretch';
export type Justify = 'start' | 'center' | 'end' | 'between';
export type SpacingPx = 0 | 8 | 16 | 24 | 32 | 40 | 48 | 56 | 64;
export type Background = 'none' | 'muted' | 'card';

export interface GrowProps {
  grow?: boolean;
}

export interface LayoutBoxProps extends GrowProps {
  mode: LayoutMode;
  direction: Responsive<Direction>;
  columns: Responsive<Columns>;
  align: Responsive<Align>;
  justify: Responsive<Justify>;
  gapPx: SpacingPx;
  paddingPx: SpacingPx;
  background: Background;
  /** Legacy Tailwind gap unit (0,1,2,3,4,6,8) from layouts saved before the 8 px spacing scale. Converted to gapPx via snapToSpacing when gapPx is absent. */
  gap?: number;
  /** Legacy Tailwind padding unit (0,2,4,6,8) from layouts saved before the 8 px spacing scale. Converted to paddingPx via snapToSpacing when paddingPx is absent. */
  padding?: number;
}

export const DIRECTION_CLASSES: Record<Direction, string> = {
  row: 'flex-row',
  column: 'flex-col',
};

export const COLUMNS_CLASSES: Record<Columns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export const ALIGN_CLASSES: Record<Align, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

export const JUSTIFY_CLASSES: Record<Justify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};

// The 8 px spacing scale (Matt's product rule): gap and padding are only
// ever one of these nine steps, shown in the inspector as "0 px" .. "64 px".
export const GAP_PX_CLASSES: Record<SpacingPx, string> = {
  0: 'gap-0',
  8: 'gap-2',
  16: 'gap-4',
  24: 'gap-6',
  32: 'gap-8',
  40: 'gap-10',
  48: 'gap-12',
  56: 'gap-14',
  64: 'gap-16',
};

export const PADDING_PX_CLASSES: Record<SpacingPx, string> = {
  0: 'p-0',
  8: 'p-2',
  16: 'p-4',
  24: 'p-6',
  32: 'p-8',
  40: 'p-10',
  48: 'p-12',
  56: 'p-14',
  64: 'p-16',
};

export const BACKGROUND_CLASSES: Record<Background, string> = {
  none: '',
  muted: 'bg-muted rounded-lg',
  card: 'bg-card border rounded-lg',
};

export const CLASS_TABLES = {
  DIRECTION_CLASSES,
  COLUMNS_CLASSES,
  ALIGN_CLASSES,
  JUSTIFY_CLASSES,
  GAP_PX_CLASSES,
  PADDING_PX_CLASSES,
  BACKGROUND_CLASSES,
} as const;

export const SPACING_OPTIONS: readonly SpacingPx[] = [0, 8, 16, 24, 32, 40, 48, 56, 64];
export const COLUMN_OPTIONS: readonly Columns[] = [1, 2, 3, 4];

const SPACING_STEP = 8;
const SPACING_MAX = 64;
const DEFAULT_SPACING_PX: SpacingPx = 8;

/**
 * Snaps an arbitrary pixel value to the nearest step of the 8 px spacing
 * scale, clamped to 0..64. Ties round up: 12 px sits exactly between the 8
 * and 16 steps and snaps to 16.
 */
export function snapToSpacing(px: number): SpacingPx {
  const snapped = Math.round(px / SPACING_STEP) * SPACING_STEP;
  return Math.min(SPACING_MAX, Math.max(0, snapped)) as SpacingPx;
}

export interface LegacySpacingProps {
  gapPx?: SpacingPx;
  paddingPx?: SpacingPx;
  gap?: number;
  padding?: number;
}

/**
 * Resolves the authoritative gapPx/paddingPx for a LayoutBox props object
 * that may still carry the pre-8px-scale legacy gap/padding (Tailwind
 * units): gapPx/paddingPx win when present, otherwise the legacy value is
 * converted with snapToSpacing, otherwise the 8 px default. Used by both
 * layoutBoxClasses (so the pure class function is correct on its own) and
 * the LayoutBox block (which must normalize the raw node props *before*
 * merging them with LAYOUT_BOX_DEFAULTS, or a legacy node's saved gap/padding
 * would be masked by the new default instead of converted).
 */
export function normalizeSpacing(props: LegacySpacingProps): { gapPx: SpacingPx; paddingPx: SpacingPx } {
  const gapPx = props.gapPx ?? (props.gap !== undefined ? snapToSpacing(props.gap * 4) : DEFAULT_SPACING_PX);
  const paddingPx =
    props.paddingPx ?? (props.padding !== undefined ? snapToSpacing(props.padding * 4) : DEFAULT_SPACING_PX);
  return { gapPx, paddingPx };
}

/**
 * The gap that would spread `childMainSizes` (each child's own size along
 * the container's main axis) evenly across `containerMainSize`, snapped to
 * the 8 px scale (spec docs/superpowers/specs/2026-09-13-grid-snapping-
 * alignment-design.md section 4: "'Distribute' setting the container gap so
 * children spread evenly"). `null` below two children - a single child, or
 * none, has no gap to compute. Floors at 0 when the children already fill
 * or overflow the container, same as snapToSpacing's own clamp.
 */
export function distributeGapPx(containerMainSize: number, childMainSizes: readonly number[]): SpacingPx | null {
  if (childMainSizes.length < 2) return null;
  const totalChildSize = childMainSizes.reduce((sum, size) => sum + size, 0);
  const available = Math.max(0, containerMainSize - totalChildSize);
  return snapToSpacing(available / (childMainSizes.length - 1));
}

/** One child's own measurement along the container's main axis, for distributeGapPxFromMeasurements below. */
export interface DistributeChildMeasurement {
  size: number;
  // A LayoutBox with its own `grow: true` (flex-1 min-w-0) renders at
  // whatever size is LEFT OVER after every other child and gap already
  // took their share - its own getBoundingClientRect is a RESULT of the
  // current gap, not an independent content size, so feeding it back into
  // this same calculation would be circular.
  growing: boolean;
}

/**
 * distributeGapPx above, but padding- and growing-child-aware (review
 * fix wave re-review R5): components/workbench/inspector/inspector.tsx's
 * measureDistributeGapPx reads a container's real getBoundingClientRect,
 * which is the BORDER box (padding included) - subtracting it here matches
 * how flexbox actually allocates space (children and gaps sit inside the
 * CONTENT box only). A growing child still counts toward the gap COUNT
 * (distributeGapPx's own `childMainSizes.length - 1`, one array entry per
 * child regardless of size) but contributes 0 to the total occupied size
 * instead of its own circular rect.
 */
export function distributeGapPxFromMeasurements(
  containerMainSize: number,
  paddingStart: number,
  paddingEnd: number,
  children: readonly DistributeChildMeasurement[],
): SpacingPx | null {
  const available = Math.max(0, containerMainSize - paddingStart - paddingEnd);
  const sizes = children.map((child) => (child.growing ? 0 : child.size));
  return distributeGapPx(available, sizes);
}

export const LAYOUT_BOX_DEFAULTS: LayoutBoxProps = {
  mode: 'flex',
  direction: { mobile: 'column', desktop: 'row' },
  columns: { mobile: 1, desktop: 3 },
  align: { mobile: 'stretch', desktop: 'stretch' },
  justify: { mobile: 'start', desktop: 'start' },
  gapPx: DEFAULT_SPACING_PX,
  paddingPx: DEFAULT_SPACING_PX,
  background: 'none',
  grow: false,
};

export const ROOT_LAYOUT_PROPS: LayoutBoxProps = {
  ...LAYOUT_BOX_DEFAULTS,
  direction: { mobile: 'column', desktop: 'column' },
};

export function layoutBoxClasses(props: LayoutBoxProps, breakpoint: Breakpoint): string {
  const { gapPx, paddingPx } = normalizeSpacing(props);
  const parts: string[] = ['min-w-0'];
  if (props.mode === 'grid') {
    parts.push('grid', COLUMNS_CLASSES[resolve(props.columns, breakpoint)]);
  } else {
    parts.push(
      'flex',
      DIRECTION_CLASSES[resolve(props.direction, breakpoint)],
      JUSTIFY_CLASSES[resolve(props.justify, breakpoint)],
    );
  }
  parts.push(
    ALIGN_CLASSES[resolve(props.align, breakpoint)],
    GAP_PX_CLASSES[gapPx],
    PADDING_PX_CLASSES[paddingPx],
  );
  const background = BACKGROUND_CLASSES[props.background];
  if (background) parts.push(background);
  return parts.join(' ');
}

export function blockClasses(props: GrowProps): string {
  return props.grow ? 'flex-1 min-w-0' : '';
}
