'use client';

import { useEditor } from '@craftjs/core';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  SlidersHorizontal,
  Trash2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { schemaFor } from '@/components/blocks/registry';
import type { SectionName } from '@/components/blocks/schema';
import type { AlignableFrame, FramePosition } from '@/lib/canvas/align';
import { distributeGapPx, type Align, type Justify, type LayoutBoxProps, type SpacingPx } from '@/lib/classes';
import type { DiagramAction } from '@/lib/diagram/store';
import type { Screen } from '@/lib/files/repository';
import { isResponsive, resolve, type Breakpoint } from '@/lib/responsive';
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
import { snapBoxFor } from '../canvas';
import { ComponentTray } from '../component-tray';
import { DiagramFields, type DiagramFieldsSelection } from '../diagram/diagram-fields';
import type { PanelMode } from '../prototype-context';
import { PrototypePanel } from '../prototype-panel';
import { useSelectedNode } from '../selection';
import { useStage } from '../stage-context';
import { AlignmentFields, type DiagramAlignmentContext, type LayoutAlignmentContext } from './alignment-fields';
import { NodeBreadcrumb } from './breadcrumb';
import { Field } from './field';

// The panel names itself after the active tab so assistive technology
// announces what is actually shown (Design, Prototype or Elements), for
// the expanded panel and the minimized rail alike.
const PANEL_LABEL: Record<PanelMode, string> = {
  design: 'Design',
  prototype: 'Prototype',
  components: 'Elements',
};

export type { PanelMode };

const SECTION_ORDER: SectionName[] = ['Layout', 'Content', 'Style', 'Editor'];
const SECTION_TITLES: Record<SectionName, string> = {
  Layout: 'Auto layout',
  Content: 'Content',
  Style: 'Appearance',
  Editor: 'Editor',
};
const CONTAINER_TYPES = new Set(['LayoutBox', 'Card', 'Dialog']);

// Canvas.test.tsx (and any harness predating multi-select) never passes a
// frame selection - see components/workbench/canvas.tsx's own identical
// DEFAULT_FRAME_SELECTION for the same "keep old callers working" precedent.
const EMPTY_FRAME_SELECTION: ReadonlySet<string> = new Set();

type MinimalEditor = { actions: ReturnType<typeof useEditor>['actions']; query: ReturnType<typeof useEditor>['query'] };

/**
 * Builds the alignment row's props for a layer inside Auto layout (spec
 * docs/superpowers/specs/2026-09-13-grid-snapping-alignment-design.md
 * section 4): resolves the container's responsive direction/align/justify
 * for the CURRENT breakpoint, measures its real DOM (container and every
 * child's size along the main axis) for the Distribute button's gap, and
 * returns an `onChange` that writes align/justify back for only that same
 * breakpoint - the same merge Field.tsx's own `commit` does for every other
 * responsive field - so the icon row and the existing Alignment/
 * Distribution selects never fight over what a plain click just changed at
 * the other breakpoint.
 */
function buildLayoutAlignmentContext({
  query,
  actions,
  layoutContainer,
  breakpoint,
}: MinimalEditor & {
  layoutContainer: { id: string; props: LayoutBoxProps };
  breakpoint: Breakpoint;
}): LayoutAlignmentContext {
  const direction = resolve(layoutContainer.props.direction, breakpoint);
  const align = resolve(layoutContainer.props.align, breakpoint);
  const justify = resolve(layoutContainer.props.justify, breakpoint);

  return {
    type: 'layout',
    direction,
    align,
    justify,
    distributeGapPx: measureDistributeGapPx(query, layoutContainer.id, direction),
    onChange: (patch) => {
      actions.setProp(layoutContainer.id, (draft: LayoutBoxProps) => {
        if (patch.align !== undefined) {
          const base = isResponsive<Align>(draft.align) ? draft.align : { mobile: draft.align };
          draft.align = { ...base, [breakpoint]: patch.align };
        }
        if (patch.justify !== undefined) {
          const base = isResponsive<Justify>(draft.justify) ? draft.justify : { mobile: draft.justify };
          draft.justify = { ...base, [breakpoint]: patch.justify };
        }
        if (patch.gapPx !== undefined) draft.gapPx = patch.gapPx;
      });
    },
  };
}

/**
 * Real DOM measurement for "Distribute" (spec: "setting the container gap
 * so children spread evenly ... using the 8 px scale") - read fresh from
 * `query`, never memoized, the same directness workbench.tsx's own
 * zoomToSelectionOrFocusedFrame already relies on for a selected node's
 * real geometry. `null` when the container or fewer than two children have
 * not actually mounted a DOM node yet (disables the button rather than
 * distributing against a bogus zero size).
 */
function measureDistributeGapPx(
  query: MinimalEditor['query'],
  containerId: string,
  direction: 'row' | 'column',
): SpacingPx | null {
  const state = query.getState();
  const containerNode = state.nodes[containerId];
  const containerDom = containerNode?.dom;
  if (!containerDom) return null;
  const childDoms = containerNode.data.nodes
    .map((childId) => state.nodes[childId]?.dom)
    .filter((dom): dom is HTMLElement => !!dom);
  if (childDoms.length < 2) return null;

  const isRow = direction === 'row';
  const containerRect = containerDom.getBoundingClientRect();
  const containerMain = isRow ? containerRect.width : containerRect.height;
  const childMainSizes = childDoms.map((dom) => {
    const rect = dom.getBoundingClientRect();
    return isRow ? rect.width : rect.height;
  });
  return distributeGapPx(containerMain, childMainSizes);
}

// The three rail icons shown when the panel is minimized (spec
// docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md section 2),
// in the same order as the ToggleGroup's own tabs.
const RAIL_ITEMS: { mode: PanelMode; label: string; icon: LucideIcon }[] = [
  { mode: 'design', label: 'Design', icon: SlidersHorizontal },
  { mode: 'prototype', label: 'Prototype', icon: Workflow },
  { mode: 'components', label: 'Elements', icon: LayoutGrid },
];

function MinimizeButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const label = collapsed ? 'Expand panel' : 'Minimize panel';
  const Icon = collapsed ? ChevronLeft : ChevronRight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} aria-expanded={!collapsed} onClick={onClick}>
          <Icon className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RailButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(active && 'bg-muted text-foreground')}
        >
          <Icon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Inspector({
  screens,
  currentScreenId,
  panelMode,
  onPanelModeChange,
  collapsed,
  onToggleCollapsed,
  diagramSelection = null,
  onDiagramAction,
  selectedFrameIds = EMPTY_FRAME_SELECTION,
  onAlignFrames,
  diagramAlignment = null,
}: {
  screens: Screen[];
  currentScreenId: string;
  panelMode: PanelMode;
  onPanelModeChange: (mode: PanelMode) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  // The Design tab's fields for a selected diagram shape or connector (spec
  // docs/superpowers/specs/2026-09-13-diagrams-design.md section 3), in
  // place of the usual Craft-node fields below whenever a diagram element -
  // rather than a block - is selected; the panel's own label still follows
  // panelMode, unaffected by this. Optional/no-op-by-default so every
  // existing caller and test that predates diagrams keeps rendering
  // exactly as before.
  diagramSelection?: DiagramFieldsSelection | null;
  onDiagramAction?: (action: DiagramAction) => void;
  // The canvas-level selection of frames (spec docs/superpowers/specs/2026-
  // 09-13-grid-snapping-alignment-design.md section 3/4) - two or more
  // selected ids show the alignment row for those frames, taking priority
  // over the usual Craft-node fields the same way diagramSelection does.
  selectedFrameIds?: ReadonlySet<string>;
  onAlignFrames?: (positions: FramePosition[]) => void;
  // A diagram selection of two or more shapes (Matt, 2026-09-13: "i also
  // need alignment options when selecting multiple shapes") - built by
  // workbench.tsx from diagram.selection's own node ids, since only it owns
  // dispatchDiagram. Takes priority over the single-element diagramSelection
  // above (which would otherwise still point at the first of the several
  // selected shapes) but not over a frame selection.
  diagramAlignment?: DiagramAlignmentContext | null;
}) {
  const { id, type, displayName, isRoot } = useSelectedNode();
  const { breakpoint, setPreset } = useStage();
  // The collector re-runs only on the next store notification, using whatever
  // closure was current when that notification fires. Deriving the selected id
  // from `state` here (instead of closing over the `id` returned by
  // useSelectedNode above) keeps this collector self-contained so it reflects
  // the same notification's selection immediately, rather than lagging a render
  // behind it.
  const { actions, query, props, childCount, layoutContainer } = useEditor((state) => {
    const [selectedId] = state.events.selected;
    const node = selectedId ? state.nodes[selectedId] : null;
    const zoneId = node?.data.linkedNodes?.content;
    const container = zoneId ? state.nodes[zoneId] : node;

    // The Auto layout container the alignment row (below) should act on -
    // the selected node itself when it is a flex LayoutBox, otherwise its
    // own immediate parent when THAT is one (spec section 4: "for a layer
    // inside an Auto layout container (or the container itself)"). Grid
    // mode has no align/justify axes to map the icon row onto, so it is
    // excluded the same as any non-LayoutBox node.
    function asFlexLayoutBox(candidateId: string | null | undefined): { id: string; props: LayoutBoxProps } | null {
      if (!candidateId) return null;
      const candidate = state.nodes[candidateId];
      if (!candidate || candidate.data.name !== 'LayoutBox') return null;
      const candidateProps = candidate.data.props as LayoutBoxProps;
      if (candidateProps.mode === 'grid') return null;
      return { id: candidateId, props: candidateProps };
    }
    const layoutContainer = asFlexLayoutBox(selectedId) ?? asFlexLayoutBox(node?.data.parent);

    return {
      props: node ? (node.data.props as Record<string, unknown>) : null,
      childCount: container ? container.data.nodes.length : 0,
      layoutContainer,
    };
  });
  const schema = type ? schemaFor(type) : null;

  const selectedFrames = screens.filter((screen) => selectedFrameIds.has(screen.id));
  const frameAlignmentContext =
    selectedFrames.length >= 2
      ? {
          type: 'frames' as const,
          frames: selectedFrames.map(snapBoxFor) as AlignableFrame[],
          onAlign: (positions: FramePosition[]) => onAlignFrames?.(positions),
        }
      : null;

  const layoutAlignmentContext = layoutContainer
    ? buildLayoutAlignmentContext({ query, actions, layoutContainer, breakpoint })
    : null;

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <aside
          aria-label={PANEL_LABEL[panelMode]}
          className={cn(PANEL, 'absolute top-[76px] right-3 bottom-3 z-10 flex w-10 flex-col items-center gap-1 py-2')}
        >
          <MinimizeButton collapsed onClick={onToggleCollapsed} />
          <div className="my-1 h-px w-6 bg-border" aria-hidden />
          {RAIL_ITEMS.map(({ mode, label, icon }) => (
            <RailButton
              key={mode}
              label={label}
              icon={icon}
              active={panelMode === mode}
              onClick={() => {
                onPanelModeChange(mode);
                onToggleCollapsed();
              }}
            />
          ))}
        </aside>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label={PANEL_LABEL[panelMode]}
        className={cn(PANEL, 'absolute top-[76px] right-3 bottom-3 z-10 flex w-80 min-h-0 flex-col')}
      >
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
            <ToggleGroupItem value="components" className={SEG_ITEM}>
              Elements
            </ToggleGroupItem>
          </ToggleGroup>
          <MinimizeButton collapsed={false} onClick={onToggleCollapsed} />
        </div>
        {panelMode === 'components' ? (
          <ComponentTray />
        ) : (
          <div className="flex flex-col gap-3.5 overflow-y-auto p-4">
            {panelMode === 'prototype' ? (
              <PrototypePanel screens={screens} currentScreenId={currentScreenId} />
            ) : frameAlignmentContext ? (
              <AlignmentFields context={frameAlignmentContext} />
            ) : diagramAlignment ? (
              <AlignmentFields context={diagramAlignment} />
            ) : diagramSelection ? (
              <DiagramFields selected={diagramSelection} onAction={(action) => onDiagramAction?.(action)} />
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
                {layoutAlignmentContext && <AlignmentFields context={layoutAlignmentContext} />}
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
        )}
      </aside>
    </TooltipProvider>
  );
}
