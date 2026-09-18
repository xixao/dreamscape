import { Element, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode } from 'react';
import { Button as UiButton } from '@/components/ui/button';
import {
  Dialog as UiDialog,
  DialogContent as UiDialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { usePlay } from '@/components/play/play-context';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { getInteraction, interactionHandler } from '@/lib/interactions';
import { cn } from '@/lib/utils';
import { DropZone } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface DialogBlockProps extends GrowProps {
  triggerLabel: string;
  title: string;
  description: string;
  previewOpen: boolean;
}

export const DIALOG_DEFAULTS: DialogBlockProps = {
  triggerLabel: 'Open dialog',
  title: 'Dialog title',
  description: '',
  previewOpen: true,
  grow: false,
};

export const DialogContent: UserComponent<{ children?: ReactNode }> = ({ children }) => {
  const {
    connectors: { connect },
    childCount,
  } = useNode((node) => ({ childCount: node.data.nodes.length }));

  return (
    <div
      ref={(element) => {
        if (element) connect(element);
      }}
      data-zone="DialogContent"
      className="flex flex-col gap-4"
    >
      {childCount === 0 ? <DropZone /> : children}
    </div>
  );
};

DialogContent.craft = {
  displayName: 'DialogContent',
  rules: {
    canDrag: () => false,
    canMoveIn: (incoming) => incoming.every((node) => node.data.name !== 'Dialog'),
  },
};

export const Dialog: UserComponent<Partial<DialogBlockProps>> = (props) => {
  const merged: DialogBlockProps = { ...DIALOG_DEFAULTS, ...props };
  const play = usePlay();
  const {
    connectors: { connect, drag },
    id,
    custom,
  } = useNode((node) => ({ custom: node.data.custom }));
  const isPlay = play.mode === 'play';
  const onClick = isPlay ? interactionHandler(getInteraction({ data: { custom } }), play) : undefined;

  // Play mode renders the real shadcn Dialog, controlled by this node's own
  // id: `play.isDialogOpen(id)` is true either because this Dialog's own
  // trigger was clicked (below) or because some other node's openDialog
  // interaction targeted this id (Player wires that through the same
  // context - see components/play/player.tsx). previewOpen (an editorOnly
  // field) has no effect here; it only controls the design-mode inline
  // preview below.
  if (isPlay) {
    return (
      <div
        ref={(element) => {
          if (element) connect(drag(element));
        }}
        data-block="Dialog"
        className={cn('flex flex-col items-start gap-4', blockClasses(merged))}
        onClick={onClick}
      >
        <UiDialog
          open={play.isDialogOpen(id)}
          onOpenChange={(open) => (open ? play.openDialog(id) : play.closeDialog(id))}
        >
          <DialogTrigger asChild>
            <UiButton type="button" variant="outline">
              <span data-writer-prop="triggerLabel">{merged.triggerLabel}</span>
            </UiButton>
          </DialogTrigger>
          <UiDialogContent>
            <DialogHeader>
              <DialogTitle>{merged.title}</DialogTitle>
              {merged.description !== '' && <DialogDescription>{merged.description}</DialogDescription>}
            </DialogHeader>
            <Element id="content" is={DialogContent} canvas />
          </UiDialogContent>
        </UiDialog>
      </div>
    );
  }

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Dialog"
      className={cn('flex flex-col items-start gap-4', blockClasses(merged))}
    >
      <UiButton type="button" variant="outline">
        <span data-writer-prop="triggerLabel">{merged.triggerLabel}</span>
      </UiButton>
      {merged.previewOpen && (
        <div
          data-testid="dialog-preview"
          className="flex w-full max-w-lg flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg"
        >
          <div className="flex flex-col gap-1.5">
            <h2 data-writer-prop="title" className="text-lg leading-none font-semibold">{merged.title}</h2>
            {merged.description !== '' && (
              <p data-writer-prop="description" className="text-sm text-muted-foreground">{merged.description}</p>
            )}
          </div>
          <Element id="content" is={DialogContent} canvas />
        </div>
      )}
    </div>
  );
};

Dialog.craft = {
  displayName: 'Dialog',
  props: DIALOG_DEFAULTS,
};

export const dialogSchema: BlockSchema = {
  type: 'Dialog',
  fields: [
    { prop: 'triggerLabel', label: 'Trigger label', kind: 'text', section: 'Content' },
    { prop: 'title', label: 'Title', kind: 'text', section: 'Content' },
    { prop: 'description', label: 'Description', kind: 'text', section: 'Content' },
    {
      prop: 'previewOpen',
      label: 'Show content on canvas',
      kind: 'boolean',
      section: 'Editor',
      editorOnly: true,
    },
    GROW_FIELD,
  ],
};
