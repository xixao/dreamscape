'use client';

import { useEditor } from '@craftjs/core';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { schemaFor } from '@/components/blocks/registry';
import type { SectionName } from '@/components/blocks/schema';
import type { Screen } from '@/lib/files/repository';
import { cn } from '@/lib/utils';
import {
  DANGER_GHOST,
  EMPTY,
  EMPTY_TITLE,
  PANEL,
  PANEL_HEADER,
  SECTION,
  SECTION_TITLE,
  SEG_GROUP,
  SEG_ITEM,
} from '../chrome';
import type { PanelMode } from '../prototype-context';
import { PrototypePanel } from '../prototype-panel';
import { useSelectedNode } from '../selection';
import { useStage } from '../stage-context';
import { NodeBreadcrumb } from './breadcrumb';
import { Field } from './field';

export type { PanelMode };

const SECTION_ORDER: SectionName[] = ['Layout', 'Content', 'Style', 'Editor'];
const SECTION_TITLES: Record<SectionName, string> = {
  Layout: 'Auto layout',
  Content: 'Content',
  Style: 'Appearance',
  Editor: 'Editor',
};
const CONTAINER_TYPES = new Set(['LayoutBox', 'Card', 'Dialog']);

export function Inspector({
  screens,
  currentScreenId,
  panelMode,
  onPanelModeChange,
}: {
  screens: Screen[];
  currentScreenId: string;
  panelMode: PanelMode;
  onPanelModeChange: (mode: PanelMode) => void;
}) {
  const { id, type, displayName, isRoot } = useSelectedNode();
  const { breakpoint, setPreset } = useStage();
  // The collector re-runs only on the next store notification, using whatever
  // closure was current when that notification fires. Deriving the selected id
  // from `state` here (instead of closing over the `id` returned by
  // useSelectedNode above) keeps this collector self-contained so it reflects
  // the same notification's selection immediately, rather than lagging a render
  // behind it.
  const { actions, props, childCount } = useEditor((state) => {
    const [selectedId] = state.events.selected;
    const node = selectedId ? state.nodes[selectedId] : null;
    const zoneId = node?.data.linkedNodes?.content;
    const container = zoneId ? state.nodes[zoneId] : node;
    return {
      props: node ? (node.data.props as Record<string, unknown>) : null,
      childCount: container ? container.data.nodes.length : 0,
    };
  });
  const schema = type ? schemaFor(type) : null;

  return (
    <aside aria-label="Design" className={cn(PANEL, 'flex min-h-0 flex-col')}>
      <div className={PANEL_HEADER}>
        <ToggleGroup
          type="single"
          aria-label="Panel mode"
          value={panelMode}
          onValueChange={(value) => {
            if (value) onPanelModeChange(value as PanelMode);
          }}
          className={cn(SEG_GROUP, 'flex-1')}
        >
          <ToggleGroupItem value="design" className={SEG_ITEM}>
            Design
          </ToggleGroupItem>
          <ToggleGroupItem value="prototype" className={SEG_ITEM}>
            Prototype
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-3.5 overflow-y-auto p-4">
        {panelMode === 'prototype' ? (
          <PrototypePanel screens={screens} currentScreenId={currentScreenId} />
        ) : !id || !type || !schema || !props ? (
          <div className={EMPTY}>
            <b className={EMPTY_TITLE}>Nothing selected</b>
            Select a layer on the canvas to edit it.
          </div>
        ) : (
          <>
            <NodeBreadcrumb />
            <div className="flex items-center gap-2">
              <span data-testid="inspector-type" className="text-[13px] font-semibold">
                {displayName}
              </span>
              {CONTAINER_TYPES.has(type) && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {childCount} {childCount === 1 ? 'item' : 'items'}
                </Badge>
              )}
            </div>
            {SECTION_ORDER.map((section) => {
              const fields = schema.fields.filter(
                (field) =>
                  field.section === section &&
                  (!field.showWhen || field.showWhen(props)) &&
                  !(isRoot && field.prop === 'grow'),
              );
              if (fields.length === 0) return null;
              return (
                <section key={section} className={SECTION}>
                  <h3 className={SECTION_TITLE}>{SECTION_TITLES[section]}</h3>
                  <div className="flex flex-col gap-3">
                    {fields.map((field) => (
                      <Field
                        key={field.prop}
                        field={field}
                        value={props[field.prop]}
                        breakpoint={breakpoint}
                        onJumpToBreakpoint={setPreset}
                        onChange={(next) => {
                          const setter = (draft: Record<string, unknown>) => {
                            draft[field.prop] = next;
                          };
                          if (field.kind === 'text') actions.history.throttle(500).setProp(id, setter);
                          else actions.setProp(id, setter);
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {!isRoot && (
              <Button
                variant="ghost"
                size="sm"
                className={cn('mt-2 self-start', DANGER_GHOST)}
                onClick={() => actions.delete(id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
