import { useNode, type UserComponent } from '@craftjs/core';
import { Avatar as UiAvatar, AvatarFallback } from '@/components/ui/avatar';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarBlockProps extends GrowProps {
  initials: string;
  accessibleLabel?: string;
  size: AvatarSize;
}

export const AVATAR_DEFAULTS: AvatarBlockProps = {
  accessibleLabel: '',
  initials: 'AB',
  size: 'md',
  grow: false,
};

// The installed shadcn Avatar's own `size` prop is 'sm' | 'default' | 'lg'.
// The block's public prop follows the PRD's 'sm' | 'md' | 'lg' naming; 'md'
// maps to the installed component's 'default'.
const UI_SIZE: Record<AvatarSize, 'sm' | 'default' | 'lg'> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

export const Avatar: UserComponent<Partial<AvatarBlockProps>> = (props) => {
  const merged: AvatarBlockProps = { ...AVATAR_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <UiAvatar
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      role={merged.accessibleLabel ? "img" : undefined}
      aria-label={merged.accessibleLabel || undefined}
      data-block="Avatar"
      size={UI_SIZE[merged.size]}
      className={cn(blockClasses(merged))}
      onClick={onClick}
    >
      <AvatarFallback data-writer-prop="initials">{merged.initials}</AvatarFallback>
    </UiAvatar>
  );
};

Avatar.craft = {
  displayName: 'Avatar',
  props: AVATAR_DEFAULTS,
};

export const avatarSchema: BlockSchema = {
  type: 'Avatar',
  fields: [
    { prop: 'accessibleLabel', label: 'Accessible name', kind: 'text', section: 'Accessibility' },
    { prop: 'initials', label: 'Initials', kind: 'text', section: 'Content' },
    {
      prop: 'size',
      label: 'Size',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
      ],
    },
    GROW_FIELD,
  ],
};
