import { ArrowUp, Paperclip, Plus, Mic, Send, X, Search, LoaderCircle } from 'lucide-react';
import { designStyle, SIZE_DEFAULTS, SIZE_FIELDS, type DesignProps } from './design-controls';
import { useNode, type UserComponent } from '@craftjs/core';
import { Button as UiButton } from '@/components/ui/button';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

const ICONS = { arrowUp: ArrowUp, paperclip: Paperclip, plus: Plus, microphone: Mic, send: Send, close: X, search: Search };
export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg';

export interface ButtonBlockProps extends GrowProps, DesignProps {
  icon?: keyof typeof ICONS | 'none'; iconOnly?: boolean; iconPosition?: 'start' | 'end'; circular?: boolean; accessibleLabel?: string; loading?: boolean;
  label: string;
  variant: ButtonVariant;
  size: ButtonSize;
  disabled: boolean;
}

export const BUTTON_DEFAULTS: ButtonBlockProps = {
  ...SIZE_DEFAULTS, icon: 'none', iconOnly: false, iconPosition: 'start', circular: false, accessibleLabel: '', loading: false,
  label: 'Button',
  variant: 'default',
  size: 'default',
  disabled: false,
  grow: false,
};

export const Button: UserComponent<Partial<ButtonBlockProps>> = (props) => {
  const merged: ButtonBlockProps = { ...BUTTON_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const Icon = merged.loading ? LoaderCircle : merged.icon && merged.icon !== 'none' ? ICONS[merged.icon] : undefined;
  const isPlay = play.mode === 'play';
  const onClick = isPlay ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <UiButton
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      type="button"
      data-block="Button"
      variant={merged.variant}
      size={merged.iconOnly && Icon ? (merged.size === 'sm' ? 'icon-sm' : merged.size === 'lg' ? 'icon-lg' : 'icon') : merged.size}
      style={{ ...designStyle(merged), ...(merged.circular ? { borderRadius: '50%' } : {}) }}
      // An icon-only button with no authored label still exposes the icon's
      // name so it is never nameless in Play; Writer's missing-text check
      // reads the authored props, not this fallback, so it keeps flagging it.
      aria-label={merged.accessibleLabel || (merged.iconOnly ? merged.label || merged.icon || undefined : undefined)}
      aria-busy={merged.loading || undefined}
      disabled={isPlay ? merged.disabled || merged.loading : undefined}
      aria-disabled={merged.disabled || undefined}
      className={cn(blockClasses(merged), merged.disabled && 'opacity-50')}
      onClick={onClick}
    >
      {Icon && merged.iconPosition !== 'end' && <Icon aria-hidden className={merged.loading ? 'animate-spin' : undefined} />}
      {(!merged.iconOnly || !Icon) && <span data-writer-prop="label">{merged.label}</span>}
      {Icon && merged.iconPosition === 'end' && <Icon aria-hidden className={merged.loading ? 'animate-spin' : undefined} />}
    </UiButton>
  );
};

Button.craft = {
  displayName: 'Button',
  props: BUTTON_DEFAULTS,
};

const hasIcon = (props: Record<string, unknown>) => Boolean(props.icon && props.icon !== 'none');

export const buttonSchema: BlockSchema = {
  type: 'Button',
  inspectorSections: [
    { section: 'Content', title: 'Content' },
    { section: 'Style', title: 'Appearance' },
    { section: 'State', title: 'State' },
    { section: 'Layout', title: 'Layout' },
    { section: 'Accessibility', title: 'Accessibility' },
    { section: 'Advanced', title: 'Advanced', collapsed: true },
  ],
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content', showWhen: p => !p.iconOnly || !hasIcon(p) },
    { prop: 'icon', label: 'Icon', kind: 'select', section: 'Content', options: [
      { value: 'none', label: 'None' }, { value: 'arrowUp', label: 'Arrow up' },
      { value: 'paperclip', label: 'Attachment' }, { value: 'plus', label: 'Plus' },
      { value: 'microphone', label: 'Microphone' }, { value: 'send', label: 'Send' },
      { value: 'close', label: 'Close' }, { value: 'search', label: 'Search' },
    ] },
    { prop: 'iconOnly', label: 'Icon only', kind: 'boolean', section: 'Content', showWhen: hasIcon },
    { prop: 'iconPosition', label: 'Icon position', kind: 'select', section: 'Content', showWhen: p => hasIcon(p) && !p.iconOnly,
      options: [{ value: 'start', label: 'Leading' }, { value: 'end', label: 'Trailing' }] },
    { prop: 'variant', label: 'Variant', kind: 'select', section: 'Style', row: 'button-appearance', options: [
      { value: 'default', label: 'Default' }, { value: 'destructive', label: 'Destructive' },
      { value: 'outline', label: 'Outline' }, { value: 'secondary', label: 'Secondary' },
      { value: 'ghost', label: 'Ghost' }, { value: 'link', label: 'Link' },
    ] },
    { prop: 'size', label: 'Size', kind: 'select', section: 'Style', row: 'button-appearance', control: 'dropdown', options: [
      { value: 'sm', label: 'Small' }, { value: 'default', label: 'Default' }, { value: 'lg', label: 'Large' },
    ] },
    { prop: 'circular', label: 'Circular', kind: 'boolean', section: 'Style' },
    { prop: 'loading', label: 'Loading', kind: 'boolean', section: 'State' },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'State' },
    ...SIZE_FIELDS.map(field => ({ ...field,
      label: field.label.replace('Minimum', 'Min').replace('Maximum', 'Max').replace(' (0 = none)', ''),
      section: /^(min|max)/.test(field.prop) ? 'Advanced' as const : 'Layout' as const,
      row: /Mode$/.test(field.prop) ? 'button-sizing' : /^(min|max)Width/.test(field.prop) ? 'width-limits' : /^(min|max)Height/.test(field.prop) ? 'height-limits' : undefined,
    })),
    GROW_FIELD,
    { prop: 'accessibleLabel', label: 'Accessible label', kind: 'text', section: 'Accessibility' },
  ],
};
