import { useNode, type UserComponent } from '@craftjs/core';
import { Badge as UiBadge } from '@/components/ui/badge';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface BadgeBlockProps extends GrowProps {
  text: string;
  variant: BadgeVariant;
}

export const BADGE_DEFAULTS: BadgeBlockProps = {
  text: 'Badge',
  variant: 'default',
  grow: false,
};

export const Badge: UserComponent<Partial<BadgeBlockProps>> = (props) => {
  const merged: BadgeBlockProps = { ...BADGE_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <UiBadge
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Badge"
      data-writer-prop="text"
      variant={merged.variant}
      className={cn(blockClasses(merged))}
      onClick={onClick}
    >
      {merged.text}
    </UiBadge>
  );
};

Badge.craft = {
  displayName: 'Badge',
  props: BADGE_DEFAULTS,
};

export const badgeSchema: BlockSchema = {
  type: 'Badge',
  fields: [
    { prop: 'text', label: 'Text', kind: 'text', section: 'Content' },
    {
      prop: 'variant',
      label: 'Variant',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'secondary', label: 'Secondary' },
        { value: 'destructive', label: 'Destructive' },
        { value: 'outline', label: 'Outline' },
      ],
    },
    GROW_FIELD,
  ],
};
