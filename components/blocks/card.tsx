import { designStyle, SIZE_DEFAULTS, APPEARANCE_DEFAULTS, SIZE_FIELDS, APPEARANCE_FIELDS, type DesignProps } from './design-controls';
import { Element, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode } from 'react';
import {
  Card as UiCard,
  CardContent as UiCardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { DropZone } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface CardBlockProps extends GrowProps, DesignProps {
  title: string;
  description: string;
}

export const CARD_DEFAULTS: CardBlockProps = {
  ...SIZE_DEFAULTS, ...APPEARANCE_DEFAULTS,
  title: 'Card title',
  description: '',
  grow: false,
};

export const CardContent: UserComponent<{ children?: ReactNode }> = ({ children }) => {
  const {
    connectors: { connect },
    childCount,
  } = useNode((node) => ({ childCount: node.data.nodes.length }));

  return (
    <UiCardContent
      ref={(element) => {
        if (element) connect(element);
      }}
      data-zone="CardContent"
      className="flex flex-col gap-4"
    >
      {childCount === 0 ? <DropZone /> : children}
    </UiCardContent>
  );
};

CardContent.craft = {
  displayName: 'CardContent',
  rules: {
    canDrag: () => false,
  },
};

export const Card: UserComponent<Partial<CardBlockProps>> = (props) => {
  const merged: CardBlockProps = { ...CARD_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const showHeader = merged.title !== '' || merged.description !== '';
  const onClick = play.mode === 'play' ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  return (
    <UiCard
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Card"
      style={designStyle(merged)}
      className={cn(blockClasses(merged))}
      onClick={onClick}
    >
      {showHeader && (
        <CardHeader>
          {merged.title !== '' && <CardTitle data-writer-prop="title">{merged.title}</CardTitle>}
          {merged.description !== '' && <CardDescription data-writer-prop="description">{merged.description}</CardDescription>}
        </CardHeader>
      )}
      <Element id="content" is={CardContent} canvas />
    </UiCard>
  );
};

Card.craft = {
  displayName: 'Card',
  props: CARD_DEFAULTS,
};

export const cardSchema: BlockSchema = {
  type: 'Card',
  fields: [
    ...SIZE_FIELDS.map(field => field.prop === 'maxWidthPx' ? { ...field, prop: 'maxWidth', label: 'Maximum width', kind: 'width-limit' as const } : field), ...APPEARANCE_FIELDS,
    { prop: 'title', label: 'Title', kind: 'text', section: 'Content' },
    { prop: 'description', label: 'Description', kind: 'text', section: 'Content' },
    GROW_FIELD,
  ],
};
