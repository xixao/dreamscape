import type { CSSProperties } from 'react';
import type { FieldSchema } from './schema';
export interface BorderSettings { width: number; color?: string; opacity?: number; visible?: boolean; style?: 'solid' | 'dashed' | 'dotted'; sides?: 'all' | 'top' | 'right' | 'bottom' | 'left' | 'custom'; top?: number; right?: number; bottom?: number; left?: number; }
export interface DesignProps {
  border?: BorderSettings;
  maxWidth?: { value: number; unit: 'px' | '%' };
  widthMode?: 'auto' | 'fit' | 'fill' | 'fixed' | 'percent'; widthPercent?: number; heightMode?: 'auto' | 'fit' | 'fill' | 'fixed';
  widthPx?: number; heightPx?: number; minWidthPx?: number; maxWidthPx?: number; minHeightPx?: number; maxHeightPx?: number;
  cornerRadius?: number; borderWidth?: number; borderColor?: string; fillColor?: string; shadow?: 'none' | 'soft' | 'medium';
  paddingTopPx?: number; paddingRightPx?: number; paddingBottomPx?: number; paddingLeftPx?: number;
}
const px = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
export function designStyle(p: DesignProps): CSSProperties {
  const dimension = (mode: DesignProps['widthMode'], value?: number) => mode === 'fixed' ? px(value) ?? 100 : mode === 'fill' ? '100%' : mode === 'fit' ? 'fit-content' : undefined;
  const style: CSSProperties = {
    width: p.widthMode === 'percent' ? `${Math.max(0, p.widthPercent ?? 100)}%` : dimension(p.widthMode, p.widthPx), height: dimension(p.heightMode, p.heightPx),
    minWidth: px(p.minWidthPx), maxWidth: p.maxWidth ? (px(p.maxWidth.value) ? `${px(p.maxWidth.value)}${p.maxWidth.unit}` : undefined) : p.maxWidthPx ? px(p.maxWidthPx) : undefined,
    minHeight: px(p.minHeightPx), maxHeight: p.maxHeightPx ? Math.max(px(p.minHeightPx) ?? 0, px(p.maxHeightPx) ?? 0) : undefined,
    borderRadius: px(p.cornerRadius), borderWidth: px(p.borderWidth), borderStyle: p.borderWidth === undefined ? undefined : 'solid',
    borderColor: p.borderColor || undefined, backgroundColor: p.fillColor || undefined,
    boxShadow: p.shadow === 'none' ? 'none' : p.shadow === 'soft' ? '0 2px 8px rgb(0 0 0 / 0.08)' : p.shadow === 'medium' ? '0 4px 16px rgb(0 0 0 / 0.16)' : undefined,
    paddingTop: px(p.paddingTopPx), paddingRight: px(p.paddingRightPx), paddingBottom: px(p.paddingBottomPx), paddingLeft: px(p.paddingLeftPx),
  };
  if (p.border) {
    const b = p.border;
    const color = b.color || p.borderColor || 'var(--border)';
    style.borderColor = b.visible === false ? 'transparent' : b.opacity === undefined || b.opacity === 100 ? color : `color-mix(in srgb, ${color} ${Math.max(0, Math.min(100, b.opacity))}%, transparent)`;
    style.borderStyle = b.style ?? 'solid';
    style.borderWidth = px(b.width) ?? 0;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const width = b.sides === 'custom' ? px(b[side]) ?? b.width : !b.sides || b.sides === 'all' || b.sides === side ? b.width : 0;
      Object.assign(style, { [`border${side[0].toUpperCase()}${side.slice(1)}Width`]: width });
    }
  }
  return Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined)) as CSSProperties;
}
const numberField = (prop: string, label: string, section: 'Layout' | 'Style' = 'Layout'): FieldSchema => ({ prop, label, section, kind: 'spacing', max: 10000, options: [0, 8, 16, 24, 32, 48, 64].map(value => ({ value, label: `${value}px` })) });
export const SIZE_FIELDS: FieldSchema[] = ['width', 'height'].flatMap(axis => [
  { prop: `${axis}Mode`, label: `${axis === 'width' ? 'Width' : 'Height'} sizing`, section: 'Layout', kind: 'select', options: [{ value: 'auto', label: 'Default' }, { value: 'fit', label: 'Fit content' }, { value: 'fill', label: 'Fill container' }, { value: 'fixed', label: 'Fixed' }] } as FieldSchema,
  { ...numberField(`${axis}Px`, `${axis === 'width' ? 'Width' : 'Height'} (px)`), showWhen: p => p[`${axis}Mode`] === 'fixed' },
  numberField(`min${axis === 'width' ? 'Width' : 'Height'}Px`, `Minimum ${axis}`),
  numberField(`max${axis === 'width' ? 'Width' : 'Height'}Px`, `Maximum ${axis} (0 = none)`),
]);
export const APPEARANCE_FIELDS: FieldSchema[] = [
  numberField('cornerRadius', 'Corner radius', 'Style'),
  { prop: 'border', label: 'Border', kind: 'border', section: 'Style' },
  { prop: 'fillColor', label: 'Fill color', kind: 'text', section: 'Style' },
  { prop: 'shadow', label: 'Shadow', kind: 'select', section: 'Style', options: ['none', 'soft', 'medium'].map(value => ({ value, label: value })) },
  ...['Top', 'Right', 'Bottom', 'Left'].map(side => numberField(`padding${side}Px`, `Padding ${side.toLowerCase()}`)),
];

export const SIZE_DEFAULTS: DesignProps = {
  maxWidth: undefined,
  ...Object.fromEntries(SIZE_FIELDS.map(field => [field.prop, undefined])),
  widthMode: 'auto', heightMode: 'auto', widthPx: 100, heightPx: 100,
};
export const APPEARANCE_DEFAULTS: DesignProps = Object.fromEntries(APPEARANCE_FIELDS.map(field => [field.prop, undefined]));
