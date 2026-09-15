import { useNode, type UserComponent } from '@craftjs/core';
import { Image as ImageIcon } from 'lucide-react';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type ImageAspect = 'square' | 'video' | 'portrait' | 'wide';
export type ImageRadius = 'none' | 'md' | 'lg' | 'full';

export interface ImageBlockProps extends GrowProps {
  label: string;
  aspect: ImageAspect;
  radius: ImageRadius;
}

export const IMAGE_DEFAULTS: ImageBlockProps = {
  label: 'Image',
  aspect: 'square',
  radius: 'md',
  grow: false,
};

const ASPECT_CLASSES: Record<ImageAspect, string> = {
  square: 'aspect-square',
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  wide: 'aspect-[21/9]',
};

const RADIUS_CLASSES: Record<ImageRadius, string> = {
  none: 'rounded-none',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export const Image: UserComponent<Partial<ImageBlockProps>> = (props) => {
  const merged: ImageBlockProps = { ...IMAGE_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Image"
      className={cn(
        'w-full min-w-0 self-start',
        blockClasses(merged),
      )}
      onClick={onClick}
    >
      <div data-image-surface className={cn('relative w-full overflow-hidden bg-muted text-muted-foreground', ASPECT_CLASSES[merged.aspect], RADIUS_CLASSES[merged.radius])}
        style={{ aspectRatio: { square: '1 / 1', video: '16 / 9', portrait: '3 / 4', wide: '21 / 9' }[merged.aspect] }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <ImageIcon className="size-8" aria-hidden />
          <span className="text-sm">{merged.label}</span>
        </div>
      </div>
    </div>
  );
};

Image.craft = {
  displayName: 'Image',
  props: IMAGE_DEFAULTS,
};

export const imageSchema: BlockSchema = {
  type: 'Image',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    {
      prop: 'aspect',
      label: 'Aspect ratio',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'square', label: 'Square' },
        { value: 'video', label: 'Video (16:9)' },
        { value: 'portrait', label: 'Portrait (3:4)' },
        { value: 'wide', label: 'Wide (21:9)' },
      ],
    },
    {
      prop: 'radius',
      label: 'Corner radius',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'none', label: 'None' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
        { value: 'full', label: 'Full' },
      ],
    },
    GROW_FIELD,
  ],
};
