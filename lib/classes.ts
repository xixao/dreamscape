import { type Breakpoint, type Responsive, resolve } from './responsive';

export type LayoutMode = 'flex' | 'grid';
export type Direction = 'row' | 'column';
export type Columns = 1 | 2 | 3 | 4;
export type Align = 'start' | 'center' | 'end' | 'stretch';
export type Justify = 'start' | 'center' | 'end' | 'between';
export type Gap = 0 | 1 | 2 | 3 | 4 | 6 | 8;
export type Padding = 0 | 2 | 4 | 6 | 8;
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
  gap: Gap;
  padding: Padding;
  background: Background;
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

export const GAP_CLASSES: Record<Gap, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
};

export const PADDING_CLASSES: Record<Padding, string> = {
  0: 'p-0',
  2: 'p-2',
  4: 'p-4',
  6: 'p-6',
  8: 'p-8',
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
  GAP_CLASSES,
  PADDING_CLASSES,
  BACKGROUND_CLASSES,
} as const;

export const GAP_OPTIONS: readonly Gap[] = [0, 1, 2, 3, 4, 6, 8];
export const PADDING_OPTIONS: readonly Padding[] = [0, 2, 4, 6, 8];
export const COLUMN_OPTIONS: readonly Columns[] = [1, 2, 3, 4];

export const LAYOUT_BOX_DEFAULTS: LayoutBoxProps = {
  mode: 'flex',
  direction: { mobile: 'column', desktop: 'row' },
  columns: { mobile: 1, desktop: 3 },
  align: { mobile: 'stretch', desktop: 'stretch' },
  justify: { mobile: 'start', desktop: 'start' },
  gap: 4,
  padding: 4,
  background: 'none',
  grow: false,
};

export const ROOT_LAYOUT_PROPS: LayoutBoxProps = {
  ...LAYOUT_BOX_DEFAULTS,
  direction: { mobile: 'column', desktop: 'column' },
  padding: 6,
};

export function layoutBoxClasses(props: LayoutBoxProps, breakpoint: Breakpoint): string {
  const parts: string[] = ['w-full', 'min-w-0'];
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
    GAP_CLASSES[props.gap],
    PADDING_CLASSES[props.padding],
  );
  const background = BACKGROUND_CLASSES[props.background];
  if (background) parts.push(background);
  return parts.join(' ');
}

export function blockClasses(props: GrowProps): string {
  return props.grow ? 'flex-1 min-w-0' : '';
}
