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
import type { FieldSchema, SectionName } from '@/components/blocks/schema';
import type { AlignableFrame, FramePosition } from '@/lib/canvas/align';
import { snapBoxFor } from '@/lib/canvas/viewport';
import { distributeGapPxFromMeasurements, SPACING_OPTIONS, type Align, type Justify, type LayoutBoxProps, type SpacingPx } from '@/lib/classes';
import type { DiagramAction, DiagramNode } from '@/lib/diagram/store';
// Aliased: this module already imports lucide's LayoutGrid icon (the
// Elements rail tab) under that same bare name.
import type {
  LayoutGrid as LayoutGridData,
  OverlayPresentation,
  OverlayPresentationType,
  OverlaySide,
  Page,
  Screen,
  ToastPosition,
} from '@/lib/files/repository';
import { isOverlay } from '@/lib/files/screens';
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
import { ComponentTray } from '../component-tray';
import { DiagramFields, type DiagramFieldsSelection } from '../diagram/diagram-fields';
import type { PanelMode } from '../prototype-context';
import { PrototypePanel } from '../prototype-panel';
import { useSelectedNode } from '../selection';
import { useStage } from '../stage-context';
import { resolveLayoutGrid } from '../layout-grid';
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
// Same "keep old callers working" precedent as EMPTY_FRAME_SELECTION above,
// for a caller/test that predates the PrototypePanel's page-grouped Overlay
// target select (spec section 5) - it falls back to one flat, ungrouped
// list of overlays on its own (see PrototypePanel's own `pages` doc
// comment).
const EMPTY_PAGES: Page[] = [];

// The Frame section's own fields (spec docs/superpowers/specs/2026-09-13-
// grid-snapping-alignment-design.md section 5), shown only when the root
// frame is selected - plain, non-responsive FieldSchema objects reused
// through field.tsx exactly like diagram-fields.tsx's own NODE_KIND_FIELD
// and friends, since a screen's layoutGrid is not a Craft node prop and so
// has no entry in any block's own schema.
const LAYOUT_GRID_COLUMN_OPTIONS: readonly number[] = [1, 2, 3, 4, 6, 8, 12, 16, 24];
const LAYOUT_GRID_COLUMNS_FIELD: FieldSchema = {
  prop: 'columns',
  label: 'Columns',
  kind: 'select',
  section: 'Layout',
  options: LAYOUT_GRID_COLUMN_OPTIONS.map((value) => ({ value, label: String(value) })),
};
const LAYOUT_GRID_GUTTER_FIELD: FieldSchema = {
  prop: 'gutter',
  label: 'Gutter',
  kind: 'select',
  section: 'Layout',
  options: SPACING_OPTIONS.map((value) => ({ value, label: `${value} px` })),
};
const LAYOUT_GRID_MARGIN_FIELD: FieldSchema = {
  prop: 'margin',
  label: 'Margin',
  kind: 'select',
  section: 'Layout',
  options: SPACING_OPTIONS.map((value) => ({ value, label: `${value} px` })),
};
const LAYOUT_GRID_VISIBLE_FIELD: FieldSchema = {
  prop: 'visible',
  label: 'Show layout grid',
  kind: 'boolean',
  section: 'Layout',
};

// The Overlay section's own fields (spec docs/superpowers/specs/2026-09-13-
// overlay-frames-design.md section 5), shown only when the root frame of an
// OVERLAY is selected - the same "plain FieldSchema reused through
// field.tsx" shape the layout grid fields above already use, since a
// screen's presentation is not a Craft node prop either. `Presentation`
// (3 options) renders as field.tsx's segmented ToggleGroup; `Side` (4) and
// `Position` (6) each render as its Select dropdown (field.tsx's own
// options.length <= 3 cutoff).
const OVERLAY_PRESENTATION_FIELD: FieldSchema = {
  prop: 'presentation',
  label: 'Presentation',
  kind: 'select',
  section: 'Layout',
  options: [
    { value: 'dialog', label: 'Dialog' },
    { value: 'sheet', label: 'Sheet' },
    { value: 'toast', label: 'Toast' },
  ],
};
const OVERLAY_SIDE_FIELD: FieldSchema = {
  prop: 'side',
  label: 'Side',
  kind: 'select',
  section: 'Layout',
  options: [
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
  ],
};
const OVERLAY_POSITION_FIELD: FieldSchema = {
  prop: 'position',
  label: 'Position',
  kind: 'select',
  section: 'Layout',
  options: [
    { value: 'top-left', label: 'Top left' },
    { value: 'top-center', label: 'Top center' },
    { value: 'top-right', label: 'Top right' },
    { value: 'bottom-left', label: 'Bottom left' },
    { value: 'bottom-center', label: 'Bottom center' },
    { value: 'bottom-right', label: 'Bottom right' },
  ],
};
const OVERLAY_DISMISSIBLE_FIELD: FieldSchema = {
  prop: 'dismissible',
  label: 'Dismissible',
  kind: 'boolean',
  section: 'Layout',
};

type MinimalEditor = { actions: ReturnType<typeof useEditor>['actions']; query: ReturnType<typeof useEditor>['query'] };

/**
 * Builds the alignment row's props for a layer inside Auto layout (spec
 * docs/superpowers/specs/2026-09-13-grid-snapping-alignment-design.md
 * section 4): resolves the container's responsive direction/align/justify
 * for the CURRENT breakpoint, and returns an `onChange` that writes align/
 * justify back for only that same breakpoint - the same merge Field.tsx's
 * own `commit` does for every other responsive field - so the icon row and
 * the existing Alignment/Distribution selects never fight over what a
 * plain click just changed at the other breakpoint.
 *
 * Review fix wave nit 13: Distribute's real DOM measurement
 * (measureDistributeGapPx, a getBoundingClientRect read) now happens only
 * inside `onDistribute`, run when the button is actually clicked - this
 * function itself runs on every Inspector render, and eagerly measuring
 * here forced a layout reflow far more often than needed (and always read
 * zero in a test environment, which never actually lays anything out).
 * `canDistribute` gates the button on the container's own child count
 * instead - cheap node-tree data, not a DOM read.
 */
function buildLayoutAlignmentContext({
  query,
  actions,
  layoutContainer,
  breakpoint,
}: MinimalEditor & {
  layoutContainer: { id: string; props: LayoutBoxProps; childCount: number };
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
    canDistribute: layoutContainer.childCount >= 2,
    onDistribute: () => {
      const gapPx = measureDistributeGapPx(query, layoutContainer.id, direction);
      if (gapPx === null) return;
      actions.setProp(layoutContainer.id, (draft: LayoutBoxProps) => {
        draft.gapPx = gapPx;
      });
    },
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
// Review re-review R5: getComputedStyle's padding is a live CSS read (the
// same "trust the DOM, not the stored prop" reasoning containerRect itself
// already relies on) rather than layoutContainer.props.paddingPx, so this
// stays correct even if something else ever overrides the padding outside
// the normal paddingPx prop path. `parseFloat` of a missing/empty value is
// NaN, which Number.isFinite catches.
function computedPx(value: string | undefined): number {
  const parsed = value ? parseFloat(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function measureDistributeGapPx(
  query: MinimalEditor['query'],
  containerId: string,
  direction: 'row' | 'column',
): SpacingPx | null {
  const state = query.getState();
  const containerNode = state.nodes[containerId];
  const containerDom = containerNode?.dom;
  if (!containerDom) return null;
  const childNodes = containerNode.data.nodes
    .map((childId) => state.nodes[childId])
    .filter((node): node is NonNullable<typeof node> => !!node?.dom);
  if (childNodes.length < 2) return null;

  const isRow = direction === 'row';
  const containerRect = containerDom.getBoundingClientRect();
  const containerMain = isRow ? containerRect.width : containerRect.height;
  // getBoundingClientRect is the BORDER box (padding included) - subtracted
  // here via distributeGapPxFromMeasurements so the measurement matches how
  // flexbox actually allocates space to children (inside the content box
  // only). Read fresh from the live DOM rather than the container's own
  // paddingPx prop for the same reason containerRect itself is a live read.
  const containerStyle = containerDom.ownerDocument.defaultView?.getComputedStyle(containerDom);
  // Borders are part of the border box too (a LayoutBox with a card
  // background has a 1 px border), so they come off with the padding.
  const paddingStart =
    computedPx(containerStyle?.[isRow ? 'paddingLeft' : 'paddingTop']) +
    computedPx(containerStyle?.[isRow ? 'borderLeftWidth' : 'borderTopWidth']);
  const paddingEnd =
    computedPx(containerStyle?.[isRow ? 'paddingRight' : 'paddingBottom']) +
    computedPx(containerStyle?.[isRow ? 'borderRightWidth' : 'borderBottomWidth']);

  const children = childNodes.map((node) => {
    const rect = node.dom!.getBoundingClientRect();
    return {
      size: isRow ? rect.width : rect.height,
      // A growing child (LayoutBoxProps.grow, flex-1 min-w-0) renders at
      // whatever space is left over after this very calculation - see
      // DistributeChildMeasurement's own doc comment in lib/classes.ts.
      growing: Boolean((node.data.props as { grow?: boolean }).grow),
    };
  });
  return distributeGapPxFromMeasurements(containerMain, paddingStart, paddingEnd, children);
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
  pages = EMPTY_PAGES,
  panelMode,
  onPanelModeChange,
  collapsed,
  onToggleCollapsed,
  diagramSelection = null,
  onDiagramAction,
  selectedFrameIds = EMPTY_FRAME_SELECTION,
  onAlignFrames,
  diagramAlignment = null,
  diagramMultiSelection = null,
  onUpdateLayoutGrid,
  onUpdatePresentation,
  measuredHeights,
}: {
  screens: Screen[];
  currentScreenId: string;
  // Every page, whole-file (spec section 5) - passed straight through to
  // the Prototype panel, which groups its "Open overlay..." target select
  // by page. Optional, defaulting to EMPTY_PAGES, for the same "keep old
  // callers working" reason every other optional prop here has.
  pages?: Page[];
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
  // Matt, 2026-09-13 (multi-selection follow-up): "the Design panel must
  // show the alignment row AND, beneath it, the shape fields that make
  // sense for many shapes at once" - the actual DiagramNode objects behind
  // diagramAlignment's own `count`, built by workbench.tsx the same way
  // (from diagram.selection's node ids), so DiagramFields below can compute
  // Mixed/common values and dispatch setColor/setTextStyle to every one of
  // them. Rendered only alongside diagramAlignment, never in place of it.
  diagramMultiSelection?: DiagramNode[] | null;
  // The Design panel's Frame section (spec section 5: Columns, Gutter,
  // Margin and a "Show layout grid" switch, shown when the root frame is
  // selected) - merges a partial change into the current screen's
  // layoutGrid, same as Shift+G's own onToggleLayoutGrid in workbench.tsx.
  onUpdateLayoutGrid?: (id: string, patch: Partial<LayoutGridData>) => void;
  // The Design panel's Overlay section (spec section 5: Presentation/Side/
  // Position/Dismissible, shown when the root frame of an overlay is
  // selected) - always the WHOLE presentation object, never a patch (the
  // phase 1 contract: "the editor must always write a presentation that
  // matches its type exactly ... never adding a key to the old one, or the
  // next autosave is a 400").
  onUpdatePresentation?: (id: string, presentation: OverlayPresentation) => void;
  // Review fix wave item 8: an auto-height frame's real, current height
  // (owned by WorkbenchShell, fed by Stage/FramePreview through Canvas) -
  // used the same way canvas.tsx uses it, so the frame alignment row below
  // aligns/distributes against a frame's actual measured box, not just
  // ARTBOARD_MIN_HEIGHT. Optional so every existing caller/test keeps
  // rendering exactly as before.
  measuredHeights?: ReadonlyMap<string, number>;
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
    function asFlexLayoutBox(
      candidateId: string | null | undefined,
    ): { id: string; props: LayoutBoxProps; childCount: number } | null {
      if (!candidateId) return null;
      const candidate = state.nodes[candidateId];
      if (!candidate || candidate.data.name !== 'LayoutBox') return null;
      const candidateProps = candidate.data.props as LayoutBoxProps;
      if (candidateProps.mode === 'grid') return null;
      // Review fix wave nit 13: the container's OWN child count (not
      // whatever `childCount` below resolves to - that tracks the
      // SELECTED node/zone, which is the layoutContainer's PARENT rather
      // than itself when a child inside it is what's actually selected),
      // so Distribute's enabled state never depends on a real DOM
      // measurement (unreliable in a test environment, and unnecessary
      // work on every render just to decide whether a button is clickable).
      return { id: candidateId, props: candidateProps, childCount: candidate.data.nodes.length };
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
          frames: selectedFrames.map((screen) => snapBoxFor(screen, measuredHeights)) as AlignableFrame[],
          onAlign: (positions: FramePosition[]) => onAlignFrames?.(positions),
        }
      : null;

  const layoutAlignmentContext = layoutContainer
    ? buildLayoutAlignmentContext({ query, actions, layoutContainer, breakpoint })
    : null;

  const currentScreen = screens.find((screen) => screen.id === currentScreenId);
  const layoutGrid = resolveLayoutGrid(currentScreen?.layoutGrid);
  function updateLayoutGridField(patch: Partial<LayoutGridData>): void {
    onUpdateLayoutGrid?.(currentScreenId, patch);
  }

  // The Overlay section's four handlers: each rebuilds a complete,
  // correctly-shaped presentation object (never merges a bare patch into
  // the existing one - see onUpdatePresentation's own doc comment above).
  // Presentation switches to fresh, type-appropriate defaults (a
  // dismissible dialog, a dismissible right sheet, or a bottom-right
  // toast - createOverlayScreen's own defaults); Side/Position/Dismissible
  // each keep every OTHER field of the current presentation and replace
  // only their own, which is only possible once currentScreen is known to
  // carry a presentation of the matching type.
  function handlePresentationTypeChange(nextType: OverlayPresentationType): void {
    if (!currentScreen || !isOverlay(currentScreen) || nextType === currentScreen.presentation.type) return;
    if (nextType === 'dialog') onUpdatePresentation?.(currentScreenId, { type: 'dialog', dismissible: true });
    else if (nextType === 'sheet') {
      onUpdatePresentation?.(currentScreenId, { type: 'sheet', side: 'right', dismissible: true });
    } else onUpdatePresentation?.(currentScreenId, { type: 'toast', position: 'bottom-right' });
  }
  function handleSideChange(side: OverlaySide): void {
    if (!currentScreen || !isOverlay(currentScreen) || currentScreen.presentation.type !== 'sheet') return;
    onUpdatePresentation?.(currentScreenId, { ...currentScreen.presentation, side });
  }
  function handlePositionChange(position: ToastPosition): void {
    if (!currentScreen || !isOverlay(currentScreen) || currentScreen.presentation.type !== 'toast') return;
    onUpdatePresentation?.(currentScreenId, { ...currentScreen.presentation, position });
  }
  function handleDismissibleChange(dismissible: boolean): void {
    if (!currentScreen || !isOverlay(currentScreen) || currentScreen.presentation.type === 'toast') return;
    onUpdatePresentation?.(currentScreenId, { ...currentScreen.presentation, dismissible });
  }

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
              <PrototypePanel screens={screens} currentScreenId={currentScreenId} pages={pages} />
            ) : frameAlignmentContext ? (
              <AlignmentFields context={frameAlignmentContext} />
            ) : diagramAlignment ? (
              <>
                <AlignmentFields context={diagramAlignment} />
                {/* Matt's multi-selection follow-up: Color/Text size/Font/
                    Text color beneath the alignment row, for the same
                    selection - the single-shape-only fields (Text, Shape,
                    Width, Height) stay hidden via DiagramFields' own
                    `multi` check, since `nodes` here always has 2+
                    elements when diagramAlignment is non-null (both are
                    built from the same >= 2 guard in workbench.tsx). */}
                {diagramMultiSelection && diagramMultiSelection.length > 0 && (
                  <DiagramFields
                    selected={{ type: 'node', node: diagramMultiSelection[0], nodes: diagramMultiSelection }}
                    onAction={(action) => onDiagramAction?.(action)}
                  />
                )}
              </>
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
                {isRoot && (
                  <section className={SECTION} data-testid="frame-section">
                    <h3 className={SECTION_TITLE}>Frame</h3>
                    <div className="flex flex-col gap-3">
                      <Field
                        field={LAYOUT_GRID_COLUMNS_FIELD}
                        value={layoutGrid.columns}
                        breakpoint="mobile"
                        onChange={(next) => updateLayoutGridField({ columns: Number(next) })}
                      />
                      <Field
                        field={LAYOUT_GRID_GUTTER_FIELD}
                        value={layoutGrid.gutter}
                        breakpoint="mobile"
                        onChange={(next) => updateLayoutGridField({ gutter: Number(next) })}
                      />
                      <Field
                        field={LAYOUT_GRID_MARGIN_FIELD}
                        value={layoutGrid.margin}
                        breakpoint="mobile"
                        onChange={(next) => updateLayoutGridField({ margin: Number(next) })}
                      />
                      <Field
                        field={LAYOUT_GRID_VISIBLE_FIELD}
                        value={layoutGrid.visible}
                        breakpoint="mobile"
                        onChange={(next) => updateLayoutGridField({ visible: Boolean(next) })}
                      />
                    </div>
                  </section>
                )}
                {isRoot && currentScreen && isOverlay(currentScreen) && (
                  <section className={SECTION} data-testid="overlay-section">
                    <h3 className={SECTION_TITLE}>Overlay</h3>
                    <div className="flex flex-col gap-3">
                      <Field
                        field={OVERLAY_PRESENTATION_FIELD}
                        value={currentScreen.presentation.type}
                        breakpoint="mobile"
                        onChange={(next) => handlePresentationTypeChange(next as OverlayPresentationType)}
                      />
                      {currentScreen.presentation.type === 'sheet' && (
                        <Field
                          field={OVERLAY_SIDE_FIELD}
                          value={currentScreen.presentation.side}
                          breakpoint="mobile"
                          onChange={(next) => handleSideChange(next as OverlaySide)}
                        />
                      )}
                      {currentScreen.presentation.type === 'toast' && (
                        <Field
                          field={OVERLAY_POSITION_FIELD}
                          value={currentScreen.presentation.position}
                          breakpoint="mobile"
                          onChange={(next) => handlePositionChange(next as ToastPosition)}
                        />
                      )}
                      {currentScreen.presentation.type !== 'toast' && (
                        <Field
                          field={OVERLAY_DISMISSIBLE_FIELD}
                          value={currentScreen.presentation.dismissible}
                          breakpoint="mobile"
                          onChange={(next) => handleDismissibleChange(Boolean(next))}
                        />
                      )}
                    </div>
                  </section>
                )}
                {layoutAlignmentContext && <AlignmentFields context={layoutAlignmentContext} />}
                {SECTION_ORDER.map((section) => {
                  const fields = schema.fields.filter(
                    (field) =>
                      field.section === section &&
                      (!field.showWhen || field.showWhen(props)) &&
                      !(isRoot && field.prop === 'grow') &&
                      // Review fix wave item 7: a flex LayoutBox's own
                      // Alignment/Distribution selects are now redundant
                      // with the icon row rendered just above (from
                      // layoutAlignmentContext) whenever THIS node is the
                      // one that row edits - layout-box.tsx's schema stays
                      // untouched (a grid LayoutBox, which never gets an
                      // icon row, still shows its own plain Alignment
                      // select), this only hides them at the render site.
                      !((field.prop === 'align' || field.prop === 'justify') && id === layoutContainer?.id),
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
