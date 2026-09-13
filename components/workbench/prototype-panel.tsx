'use client';

import { useEditor } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type Interaction,
  type InteractionActionType,
  getInteraction,
  setInteraction,
} from '@/lib/interactions';
import type { Screen } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import { CHIP, DANGER_GHOST, EMPTY, LABEL, SECTION, SECTION_TITLE } from './chrome';
import { useSelectedNode } from './selection';

type OnClickValue = InteractionActionType | 'none';

const ACTION_LABELS: Record<OnClickValue, string> = {
  none: 'None',
  navigate: 'Navigate to...',
  openDialog: 'Open dialog...',
  back: 'Back',
  // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
  // design.md section 5): labels only for now - the select below does not
  // offer either until phase 2 wires the editor side of overlay frames.
  openOverlay: 'Open overlay...',
  closeOverlay: 'Close overlay',
};

interface DialogOption {
  id: string;
  title: string;
}

const SELECT_TRIGGER_CLASS = cn(CHIP, 'w-full font-mono text-[12.5px] font-medium text-foreground');

export function PrototypePanel({ screens, currentScreenId }: { screens: Screen[]; currentScreenId: string }) {
  const { id } = useSelectedNode();
  const { actions, interaction, dialogOptions } = useEditor((state) => {
    const node = id ? state.nodes[id] : undefined;
    const dialogs: DialogOption[] = Object.entries(state.nodes)
      .filter(([nodeId, entry]) => entry.data.name === 'Dialog' && nodeId !== id)
      .map(([nodeId, entry]) => ({
        id: nodeId,
        title: String((entry.data.props as { title?: string } | undefined)?.title ?? 'Dialog'),
      }));
    return {
      interaction: node ? getInteraction(node) : null,
      dialogOptions: dialogs,
    };
  });

  if (!id) {
    return <div className={EMPTY}>Select a layer to add an interaction.</div>;
  }

  const otherScreens = screens.filter((screen) => screen.id !== currentScreenId);
  const canNavigate = otherScreens.length > 0;
  const canOpenDialog = dialogOptions.length > 0;
  const onClickValue: OnClickValue = interaction?.action ?? 'none';

  function change(next: Interaction | null): void {
    if (id) setInteraction(actions, id, next);
  }

  function handleActionChange(raw: string): void {
    const value = raw as OnClickValue;
    if (value === 'none') {
      change(null);
    } else if (value === 'back') {
      change({ id: nanoid(10), trigger: 'click', action: 'back' });
    } else if (value === 'navigate') {
      const target = otherScreens[0];
      if (target) change({ id: nanoid(10), trigger: 'click', action: 'navigate', targetScreenId: target.id });
    } else {
      const dialog = dialogOptions[0];
      if (dialog) change({ id: nanoid(10), trigger: 'click', action: 'openDialog', targetNodeId: dialog.id });
    }
  }

  return (
    <section className={SECTION}>
      <h3 className={SECTION_TITLE}>Interactions</h3>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className={LABEL}>On click</Label>
          <Select value={onClickValue} onValueChange={handleActionChange}>
            <SelectTrigger aria-label="On click" size="sm" className={SELECT_TRIGGER_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{ACTION_LABELS.none}</SelectItem>
              {canNavigate && <SelectItem value="navigate">{ACTION_LABELS.navigate}</SelectItem>}
              {canOpenDialog && <SelectItem value="openDialog">{ACTION_LABELS.openDialog}</SelectItem>}
              <SelectItem value="back">{ACTION_LABELS.back}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {interaction?.action === 'navigate' && (
          <div className="flex flex-col gap-1.5">
            <Label className={LABEL}>Screen</Label>
            <Select
              value={interaction.targetScreenId}
              onValueChange={(targetScreenId) => change({ ...interaction, targetScreenId })}
            >
              <SelectTrigger aria-label="Screen" size="sm" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {otherScreens.map((screen) => (
                  <SelectItem key={screen.id} value={screen.id}>
                    {screen.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {interaction?.action === 'openDialog' && (
          <div className="flex flex-col gap-1.5">
            <Label className={LABEL}>Dialog</Label>
            <Select
              value={interaction.targetNodeId}
              onValueChange={(targetNodeId) => change({ ...interaction, targetNodeId })}
            >
              <SelectTrigger aria-label="Dialog" size="sm" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dialogOptions.map((dialog) => (
                  <SelectItem key={dialog.id} value={dialog.id}>
                    {dialog.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {interaction && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('self-start', DANGER_GHOST)}
            onClick={() => change(null)}
          >
            Remove
          </Button>
        )}
      </div>
    </section>
  );
}
