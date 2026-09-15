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
      aria-label={merged.accessibleLabel || (merged.iconOnly ? merged.label || merged.icon || 'Button' : undefined)}
      aria-busy={merged.loading || undefined}
      disabled={isPlay ? merged.disabled || merged.loading : undefined}
      aria-disabled={merged.disabled || undefined}
      className={cn(blockClasses(merged), merged.disabled && 'opacity-50')}
      onClick={onClick}
    >
      {Icon && merged.iconPosition !== 'end' && <Icon aria-hidden className={merged.loading ? 'animate-spin' : undefined} />}
      {(!merged.iconOnly || !Icon) && merged.label}
      {Icon && merged.iconPosition === 'end' && <Icon aria-hidden className={merged.loading ? 'animate-spin' : undefined} />}
    </UiButton>
  );
};

Button.craft = {
  displayName: 'Button',
  props: BUTTON_DEFAULTS,
};

export const buttonSchema: BlockSchema = {
  type: 'Button',
  fields: [
    ...SIZE_FIELDS,
    { prop: 'icon', label: 'Icon', kind: 'select', section: 'Content', options: [{ value: 'none', label: 'None' }, ...Object.keys(ICONS).map(value => ({ value, label: value }))] },
    { prop: 'iconOnly', label: 'Icon only', kind: 'boolean', section: 'Content' },
    { prop: 'accessibleLabel', label: 'Accessible label', kind: 'text', section: 'Content' },
    { prop: 'iconPosition', label: 'Icon position', kind: 'select', section: 'Content', options: [{ value: 'start', label: 'Before label' }, { value: 'end', label: 'After label' }] },
    { prop: 'circular', label: 'Circular', kind: 'boolean', section: 'Style' },
    { prop: 'loading', label: 'Submitting', kind: 'boolean', section: 'Style' },
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    {
      prop: 'variant',
      label: 'Variant',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'destructive', label: 'Destructive' },
        { value: 'outline', label: 'Outline' },
        { value: 'secondary', label: 'Secondary' },
        { value: 'ghost', label: 'Ghost' },
        { value: 'link', label: 'Link' },
      ],
    },
    {
      prop: 'size',
      label: 'Size',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'sm', label: 'Small' },
        { value: 'lg', label: 'Large' },
      ],
    },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
