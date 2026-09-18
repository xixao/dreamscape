'use client';

import { useEditor } from '@craftjs/core';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type Interaction,
  type InteractionActionType,
  getInteraction,
  setInteraction,
} from '@/lib/interactions';
import type { Page, Screen } from '@/lib/files/repository';
import { isOverlay, overlayBadgeLabel } from '@/lib/files/screens';
import { cn } from '@/lib/utils';
import { CHIP, DANGER_GHOST, EMPTY, LABEL, MENU_HINT, SECTION, SECTION_TITLE } from './chrome';
import { usePrototypeContext } from './prototype-context';
import { useSelectedNode } from './selection';

type OnClickValue = InteractionActionType | 'none';

const ACTION_LABELS: Record<OnClickValue, string> = {
  none: 'None',
  navigate: 'Navigate to...',
  openDialog: 'Open dialog...',
  back: 'Back',
  // Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
  // design.md section 5, phase 2): "Open overlay..." is offered when the
  // file has at least one overlay frame on any page; "Close overlay" is
  // always offered, regardless.
  openOverlay: 'Open overlay...',
  closeOverlay: 'Close overlay',
};

interface DialogOption {
  id: string;
  title: string;
}

const SELECT_TRIGGER_CLASS = cn(CHIP, 'w-full font-mono text-[12.5px] font-medium text-foreground');

export function PrototypePanel({
  screens,
  currentScreenId,
  pages = [],
}: {
  screens: Screen[];
  currentScreenId: string;
  // Groups the "Open overlay..." target select's options by page (spec
  // section 5: "target select lists overlay frames grouped by page") -
  // optional, defaulting to no groups, so a caller that predates pages
  // (or a test that does not care) keeps rendering exactly as before, just
  // with an ungrouped select if it happens to also have overlay frames.
  pages?: Page[];
}) {
  const {showAllConnections,setShowAllConnections} = usePrototypeContext();
  const connectionsToggle = <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={!!showAllConnections} onChange={e=>setShowAllConnections?.(e.target.checked)} />Show all connections in this frame</label>;
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
    return <div>{connectionsToggle}<div className={EMPTY}>Select a layer to add an interaction.</div></div>;
  }

  const otherScreens = screens.filter((screen) => screen.id !== currentScreenId);
  const canNavigate = otherScreens.length > 0;
  const canOpenDialog = dialogOptions.length > 0;
  // Overlay frames (spec section 5): "Open overlay..." is offered when the
  // file has at least one overlay frame on any page - `screens` here is
  // already the whole file's screens (Inspector's own prop, not scoped to
  // the current page), so this naturally covers every page without this
  // component needing to know which page each overlay lives on for the gate
  // itself, only for grouping the target select below.
  const overlayScreens = screens.filter(isOverlay);
  const canOpenOverlay = overlayScreens.length > 0;
  // Grouped by page when real page data is given; falls back to one flat,
  // ungrouped list otherwise (see the `pages` prop's own doc comment).
  const overlayGroups =
    pages.length > 0
      ? pages
          .map((page) => ({ page, overlays: overlayScreens.filter((overlay) => overlay.pageId === page.id) }))
          .filter((group) => group.overlays.length > 0)
      : null;
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
    } else if (value === 'closeOverlay') {
      change({ id: nanoid(10), trigger: 'click', action: 'closeOverlay' });
    } else if (value === 'navigate') {
      const target = otherScreens[0];
      if (target) change({ id: nanoid(10), trigger: 'click', action: 'navigate', targetScreenId: target.id });
    } else if (value === 'openOverlay') {
      const overlay = overlayScreens[0];
      if (overlay) change({ id: nanoid(10), trigger: 'click', action: 'openOverlay', targetScreenId: overlay.id });
    } else {
      const dialog = dialogOptions[0];
      if (dialog) change({ id: nanoid(10), trigger: 'click', action: 'openDialog', targetNodeId: dialog.id });
    }
  }

  return (
    <section className={SECTION}>
      {connectionsToggle}
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
              {canOpenOverlay && <SelectItem value="openOverlay">{ACTION_LABELS.openOverlay}</SelectItem>}
              <SelectItem value="closeOverlay">{ACTION_LABELS.closeOverlay}</SelectItem>
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

        {interaction?.action === 'openOverlay' && (
          <div className="flex flex-col gap-1.5">
            <Label className={LABEL}>Overlay</Label>
            <Select
              value={interaction.targetScreenId}
              onValueChange={(targetScreenId) => change({ ...interaction, targetScreenId })}
            >
              <SelectTrigger aria-label="Overlay" size="sm" className={SELECT_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {overlayGroups
                  ? overlayGroups.map(({ page, overlays }) => (
                      <SelectGroup key={page.id}>
                        <SelectLabel>{page.name}</SelectLabel>
                        {overlays.map((overlay) => (
                          <SelectItem key={overlay.id} value={overlay.id}>
                            <span>{overlay.name}</span>
                            <span className={MENU_HINT}>{overlayBadgeLabel(overlay.presentation)}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  : overlayScreens.map((overlay) => (
                      <SelectItem key={overlay.id} value={overlay.id}>
                        <span>{overlay.name}</span>
                        <span className={MENU_HINT}>{overlayBadgeLabel(overlay.presentation)}</span>
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
