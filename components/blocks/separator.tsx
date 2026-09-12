import { useNode, type UserComponent } from '@craftjs/core';
import { Separator as UiSeparator } from '@/components/ui/separator';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type SeparatorOrientation = 'horizontal' | 'vertical';

export interface SeparatorBlockProps extends GrowProps {
  orientation: SeparatorOrientation;
}

export const SEPARATOR_DEFAULTS: SeparatorBlockProps = {
  orientation: 'horizontal',
  grow: false,
};

export const Separator: UserComponent<Partial<SeparatorBlockProps>> = (props) => {
  const merged: SeparatorBlockProps = { ...SEPARATOR_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <UiSeparator
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Separator"
      orientation={merged.orientation}
      className={cn(merged.orientation === 'horizontal' && 'w-full', blockClasses(merged))}
      onClick={onClick}
    />
  );
};

Separator.craft = {
  displayName: 'Separator',
  props: SEPARATOR_DEFAULTS,
};

export const separatorSchema: BlockSchema = {
  type: 'Separator',
  fields: [
    {
      prop: 'orientation',
      label: 'Orientation',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
      ],
    },
    GROW_FIELD,
  ],
};
