import { useNode, type UserComponent } from '@craftjs/core';
import { Button as UiButton } from '@/components/ui/button';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg';

export interface ButtonBlockProps extends GrowProps {
  label: string;
  variant: ButtonVariant;
  size: ButtonSize;
  disabled: boolean;
}

export const BUTTON_DEFAULTS: ButtonBlockProps = {
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
      size={merged.size}
      disabled={isPlay ? merged.disabled : undefined}
      aria-disabled={merged.disabled || undefined}
      className={cn(blockClasses(merged), merged.disabled && 'opacity-50')}
      onClick={onClick}
    >
      {merged.label}
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
