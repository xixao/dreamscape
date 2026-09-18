import { AppearanceContext } from '../appearance-context';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { Card } from '@/components/blocks/card';
import { LayoutBox } from '@/components/blocks/layout-box';
import type { Screen } from '@/lib/files/repository';
import { createOverlayScreen } from '@/lib/files/screens';
import { renderInEditor } from '@/test/craft-harness';
import type { DiagramAction, DiagramNode } from '@/lib/diagram/store';
import type { DiagramFieldsSelection } from '../diagram/diagram-fields';
import { POINTER_TOOL, type DiagramTool } from '../diagram/diagram-layer';
import { useStage } from '../stage-context';
import type { DiagramAlignmentContext } from './alignment-fields';
import { Inspector, type PanelMode } from './inspector';

function WidthProbe() {
  return <output data-testid="width">{useStage().width}</output>;
}

const ONE_SCREEN: Screen[] = [{ id: 's1', name: 'Frame 1', layout: '{}', stageWidth: 1440 }];

const TWO_FRAMES: Screen[] = [
  { id: 's1', name: 'Frame 1', layout: '{}', stageWidth: 400, stageHeight: 300, x: 0, y: 0 },
  { id: 's2', name: 'Frame 2', layout: '{}', stageWidth: 400, stageHeight: 300, x: 800, y: 0 },
];

function mount(
  width = 1440,
  {
    panelMode = 'design',
    onPanelModeChange = vi.fn(),
    collapsed = false,
    onToggleCollapsed = vi.fn(),
    diagramSelection,
    onDiagramAction,
    screens = ONE_SCREEN,
    selectedFrameIds,
    onAlignFrames,
    diagramAlignment,
    diagramMultiSelection,
    onUpdateLayoutGrid,
    onUpdatePresentation,
    measuredHeights,
    diagramTool,
    onSelectDiagramTool,
  }: {
    panelMode?: PanelMode;
    onPanelModeChange?: (mode: PanelMode) => void;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    diagramSelection?: DiagramFieldsSelection | null;
    onDiagramAction?: (action: DiagramAction) => void;
    screens?: Screen[];
    selectedFrameIds?: ReadonlySet<string>;
    onAlignFrames?: (positions: { id: string; x: number; y: number }[]) => void;
    diagramAlignment?: DiagramAlignmentContext | null;
    diagramMultiSelection?: DiagramNode[] | null;
    onUpdateLayoutGrid?: (id: string, patch: Partial<Screen['layoutGrid']>) => void;
    onUpdatePresentation?: ComponentProps<typeof Inspector>['onUpdatePresentation'];
    measuredHeights?: ReadonlyMap<string, number>;
    // The Diagrams tab's own armed tool (spec docs/superpowers/specs/2026-
    // 09-14-panel-tabs-icons-design.md) - threaded through the same way
    // every other optional prop above is, for the tests below that need it.
    diagramTool?: DiagramTool;
    onSelectDiagramTool?: (tool: DiagramTool) => void;
  } = {},
) {
  return renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          <Card title="Billing" />
          <Button label="Pay" />
        </Element>
      </Frame>
      <Inspector
        screens={screens}
        currentScreenId={screens[0]?.id ?? 's1'}
        panelMode={panelMode}
        onPanelModeChange={onPanelModeChange}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        diagramSelection={diagramSelection}
        onDiagramAction={onDiagramAction}
        selectedFrameIds={selectedFrameIds}
        onAlignFrames={onAlignFrames}
        diagramAlignment={diagramAlignment}
        diagramMultiSelection={diagramMultiSelection}
        onUpdateLayoutGrid={onUpdateLayoutGrid}
        onUpdatePresentation={onUpdatePresentation}
        measuredHeights={measuredHeights}
        diagramTool={diagramTool}
        onSelectDiagramTool={onSelectDiagramTool}
      />
      <WidthProbe />
    </>,
    { width },
  );
}

function diagramNode(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'node000001',
    kind: 'rect',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    text: 'Hello',
    color: 'neutral',
    ...overrides,
  };
}

async function select(editor: ReturnType<typeof mount>['editor'], pick: 'root' | 'card' | 'button') {
  const nodes = editor().query.node(ROOT_NODE).get().data.nodes;
  const id = pick === 'root' ? ROOT_NODE : pick === 'card' ? nodes[0] : nodes[1];
  act(() => editor().actions.selectNode(id));
  await waitFor(() => expect(editor().query.getEvent('selected').contains(id)).toBe(true));
  return id;
}

describe('Inspector', () => {
  it('shows the empty state when nothing is selected', async () => {
    mount();
    await screen.findByText('Billing');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    expect(within(panel).getByText('Nothing selected')).toBeInTheDocument();
    expect(within(panel).getByText('Select a layer on the canvas to edit it.')).toBeInTheDocument();
  });

  describe('a selected diagram element', () => {
    it('shows its fields on the Design tab instead of the empty state', async () => {
      mount(1440, { diagramSelection: { type: 'node', node: diagramNode({ text: 'Login' }) } });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).queryByText('Nothing selected')).not.toBeInTheDocument();
      expect(within(panel).getByLabelText('Text')).toHaveValue('Login');
    });

    it('still labels the panel "Design", not something diagram-specific', async () => {
      mount(1440, { diagramSelection: { type: 'node', node: diagramNode() } });
      await screen.findByText('Billing');
      expect(screen.getByRole('complementary', { name: 'Design' })).toBeInTheDocument();
    });

    it('does not leak into the Prototype tab', async () => {
      mount(1440, { panelMode: 'prototype', diagramSelection: { type: 'node', node: diagramNode() } });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Prototype' });
      expect(within(panel).queryByLabelText('Text')).not.toBeInTheDocument();
    });

    it('forwards field edits through onDiagramAction', async () => {
      const onDiagramAction = vi.fn();
      mount(1440, {
        diagramSelection: { type: 'node', node: diagramNode({ text: '' }) },
        onDiagramAction,
      });
      const panel = await screen.findByRole('complementary', { name: 'Design' });

      await userEvent.type(within(panel).getByLabelText('Text'), '!');

      expect(onDiagramAction).toHaveBeenCalledWith({ type: 'setText', id: 'node000001', text: '!' });
    });

    it('takes priority over the usual empty state even with nothing selected in Craft', async () => {
      mount(1440, { diagramSelection: { type: 'edge', edge: { id: 'e1', source: { nodeId: 'a' }, target: { nodeId: 'b' }, kind: 'step', arrow: 'end' } } });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).getByRole('heading', { name: 'Connector' })).toBeInTheDocument();
    });
  });

  describe('a canvas selection of two or more frames', () => {
    it('shows the alignment row instead of the usual empty state, even with nothing selected in Craft', async () => {
      mount(1440, { screens: TWO_FRAMES, selectedFrameIds: new Set(['s1', 's2']) });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).getByTestId('alignment-fields')).toBeInTheDocument();
      expect(within(panel).queryByText('Nothing selected')).not.toBeInTheDocument();
    });

    it('Align left calls onAlignFrames with every selected frame moved to the leftmost edge', async () => {
      const onAlignFrames = vi.fn();
      mount(1440, { screens: TWO_FRAMES, selectedFrameIds: new Set(['s1', 's2']), onAlignFrames });
      const panel = await screen.findByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Align left' }));

      expect(onAlignFrames).toHaveBeenCalledWith([
        { id: 's1', x: 0, y: 0 },
        { id: 's2', x: 0, y: 0 },
      ]);
    });

    it('does not show with fewer than two frames selected', async () => {
      mount(1440, { screens: TWO_FRAMES, selectedFrameIds: new Set(['s1']) });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).queryByTestId('alignment-fields')).not.toBeInTheDocument();
    });

    // Review fix wave item 8: alignment/distribute used to fall back to the
    // static ARTBOARD_MIN_HEIGHT for any selected frame with no fixed
    // stageHeight of its own, regardless of how tall its content actually
    // is.
    it('Align bottom uses a fed measured height for an auto-height frame, not ARTBOARD_MIN_HEIGHT', async () => {
      const autoHeightFrames: Screen[] = [
        { id: 's1', name: 'Frame 1', layout: '{}', stageWidth: 400, stageHeight: 300, x: 0, y: 0 },
        // s2 has no stageHeight of its own - only its fed measured height
        // (1000) should determine where "bottom" ends up.
        { id: 's2', name: 'Frame 2', layout: '{}', stageWidth: 400, x: 800, y: 0 },
      ];
      const onAlignFrames = vi.fn();
      mount(1440, {
        screens: autoHeightFrames,
        selectedFrameIds: new Set(['s1', 's2']),
        onAlignFrames,
        measuredHeights: new Map([['s2', 1000]]),
      });
      const panel = await screen.findByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Align bottom' }));

      // bounds.bottom = max(0+300, 0+1000) = 1000; s1 -> 1000-300=700, s2 (already at the bottom) -> 1000-1000=0.
      expect(onAlignFrames).toHaveBeenCalledWith([
        { id: 's1', x: 0, y: 700 },
        { id: 's2', x: 800, y: 0 },
      ]);
    });
  });

  // Matt's multi-selection follow-up, 2026-09-13: "the Design panel must
  // show the alignment row AND, beneath it, the shape fields that make
  // sense for many shapes at once: Color, Text size, Font and Text color".
  describe('a diagram selection of two or more shapes', () => {
    function alignmentStub(overrides: Partial<DiagramAlignmentContext> = {}): DiagramAlignmentContext {
      return { type: 'diagram', count: 2, onAlign: vi.fn(), onDistribute: vi.fn(), ...overrides };
    }

    it('shows the alignment row and the Color/Text size/Font/Text color fields, not the empty state', async () => {
      const nodes = [diagramNode({ id: 'a' }), diagramNode({ id: 'b' })];
      mount(1440, { diagramAlignment: alignmentStub(), diagramMultiSelection: nodes });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).getByTestId('alignment-fields')).toBeInTheDocument();
      expect(within(panel).queryByText('Nothing selected')).not.toBeInTheDocument();
      expect(within(panel).getByRole('combobox', { name: 'Color' })).toBeInTheDocument();
      expect(within(panel).getByRole('combobox', { name: 'Text color' })).toBeInTheDocument();
      // Font has only 3 real options, so with no Mixed entry (both nodes
      // agree, the diagramNode() default) it renders as a ToggleGroup
      // (radio), same as a single-shape selection. Text size has five
      // options now, past the Field component's own <= 3 ToggleGroup
      // threshold, so it is a Select (combobox) regardless of Mixed - see
      // diagram-fields.test.tsx for that widget-choice behaviour directly.
      expect(within(panel).getByRole('combobox', { name: 'Text size' })).toBeInTheDocument();
      expect(within(panel).getByRole('radio', { name: 'Sans' })).toBeInTheDocument();
    });

    it('hides the single-shape-only fields: Text, Shape, Width and Height', async () => {
      const nodes = [diagramNode({ id: 'a' }), diagramNode({ id: 'b' })];
      mount(1440, { diagramAlignment: alignmentStub(), diagramMultiSelection: nodes });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).queryByLabelText('Text')).not.toBeInTheDocument();
      expect(within(panel).queryByRole('combobox', { name: 'Shape' })).not.toBeInTheDocument();
      expect(within(panel).queryByLabelText('Width')).not.toBeInTheDocument();
      expect(within(panel).queryByLabelText('Height')).not.toBeInTheDocument();
    });

    it('shows Mixed for Text size when the selected shapes differ, and dispatches setTextStyle for both ids when Large is chosen', async () => {
      const onDiagramAction = vi.fn();
      const nodes = [diagramNode({ id: 'a', textSize: 'small' }), diagramNode({ id: 'b', textSize: 'medium' })];
      mount(1440, { diagramAlignment: alignmentStub(), diagramMultiSelection: nodes, onDiagramAction });
      const panel = await screen.findByRole('complementary', { name: 'Design' });

      // A 4th synthetic "Mixed" option pushes Text size past 3, so it is a
      // Select (combobox) here rather than the ToggleGroup the agreeing
      // case above showed.
      expect(within(panel).getByRole('combobox', { name: 'Text size' })).toHaveTextContent('Mixed');

      await userEvent.click(within(panel).getByRole('combobox', { name: 'Text size' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Large' }));

      expect(onDiagramAction).toHaveBeenCalledWith({ type: 'setTextStyle', ids: ['a', 'b'], textSize: 'large' });
    });

    it('dispatches setColor for every selected id, as one call, when a color is chosen', async () => {
      const onDiagramAction = vi.fn();
      const nodes = [diagramNode({ id: 'a', color: 'neutral' }), diagramNode({ id: 'b', color: 'neutral' })];
      mount(1440, { diagramAlignment: alignmentStub(), diagramMultiSelection: nodes, onDiagramAction });
      const panel = await screen.findByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('combobox', { name: 'Color' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Violet' }));

      expect(onDiagramAction).toHaveBeenCalledTimes(1);
      expect(onDiagramAction).toHaveBeenCalledWith({ type: 'setColor', ids: ['a', 'b'], color: 'violet' });
    });

    it('does not show the multi-shape fields with no diagramMultiSelection given, even if diagramAlignment is set', async () => {
      mount(1440, { diagramAlignment: alignmentStub() });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).getByTestId('alignment-fields')).toBeInTheDocument();
      expect(within(panel).queryByRole('combobox', { name: 'Color' })).not.toBeInTheDocument();
    });
  });

  describe('a layer inside Auto layout', () => {
    it('shows the alignment row for the container itself, mapped onto its own align/justify', async () => {
      const { editor } = mount();
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const alignmentRow = within(panel).getByTestId('alignment-fields');

      // The root LayoutBox resolves to row direction at desktop width
      // (LAYOUT_BOX_DEFAULTS.direction.desktop) - horizontal icons map to
      // justify, written only for the current (desktop) breakpoint, same as
      // the existing Distribution select field already does.
      await userEvent.click(within(alignmentRow).getByRole('button', { name: 'Align horizontal centers' }));
      expect(editor().query.node(ROOT_NODE).get().data.props.justify).toEqual({ mobile: 'start', desktop: 'center' });
    });

    it('shows the alignment row for a child, writing to the PARENT container instead of the child', async () => {
      const { editor } = mount();
      await screen.findByText('Billing');
      const buttonId = await select(editor, 'button');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const alignmentRow = within(panel).getByTestId('alignment-fields');

      await userEvent.click(within(alignmentRow).getByRole('button', { name: 'Align top' }));

      // Row direction: the vertical icon (top) maps to align, not justify -
      // written only for the current (desktop) breakpoint; mobile keeps its
      // default ('stretch').
      expect(editor().query.node(ROOT_NODE).get().data.props.align).toEqual({ mobile: 'stretch', desktop: 'start' });
      // The button's own props are untouched.
      expect(editor().query.node(buttonId).get().data.props.align).toBeUndefined();
    });

    it('enables only the on-axis distribute button for the container\'s current direction', async () => {
      const { editor } = mount();
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const alignmentRow = within(panel).getByTestId('alignment-fields');

      // Row direction (desktop default): horizontal is the main axis.
      expect(within(alignmentRow).getByRole('button', { name: 'Distribute horizontal spacing' })).not.toBeDisabled();
      expect(within(alignmentRow).getByRole('button', { name: 'Distribute vertical spacing' })).toBeDisabled();
    });

    // Review fix wave nit 13: the real DOM measurement behind Distribute
    // (getBoundingClientRect, on the container and every child) must run
    // only when the button is actually clicked - not on every Inspector
    // render, which used to force a needless layout reflow each time
    // (rendering the panel, selecting a different node, or re-selecting the
    // same one, all included).
    it('measures the DOM only on an actual Distribute click, not on every render', async () => {
      const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
      const { editor } = mount();
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const horizontal = within(panel).getByRole('button', { name: 'Distribute horizontal spacing' });
      expect(horizontal).not.toBeDisabled();

      // Re-selecting the same node re-renders the alignment row with no
      // click involved - must not measure anything on its own.
      rectSpy.mockClear();
      await select(editor, 'root');
      expect(rectSpy).not.toHaveBeenCalled();

      await userEvent.click(horizontal);
      expect(rectSpy).toHaveBeenCalled();

      rectSpy.mockRestore();
    });

    it('does not show the alignment row when nothing is selected', async () => {
      mount();
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).queryByTestId('alignment-fields')).not.toBeInTheDocument();
    });

    // Review fix wave item 7: the icon row above already writes align/
    // justify for a flex container, so its own plain Alignment/Distribution
    // selects further down the SAME panel are now a redundant second
    // control for the identical two props - hidden at the render site
    // (inspector.tsx), not by touching layout-box.tsx's own schema.
    it('hides the flex LayoutBox\'s own Alignment and Distribution selects once the icon row covers them', async () => {
      const { editor } = mount();
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).getByTestId('alignment-fields')).toBeInTheDocument();
      expect(within(panel).queryByText('Alignment')).not.toBeInTheDocument();
      expect(within(panel).queryByText('Distribution')).not.toBeInTheDocument();
    });

    it('still shows the plain Alignment select (and no icon row) for a grid LayoutBox', async () => {
      const { editor } = mount();
      await screen.findByText('Billing');
      act(() => {
        editor().actions.setProp(ROOT_NODE, (draft: { mode?: string }) => {
          draft.mode = 'grid';
        });
      });
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).queryByTestId('alignment-fields')).not.toBeInTheDocument();
      expect(within(panel).getByText('Alignment')).toBeInTheDocument();
      // Distribution was already grid-hidden before this fix wave (showWhen: isFlex).
      expect(within(panel).queryByText('Distribution')).not.toBeInTheDocument();
    });
  });

  describe('the Frame section (root only)', () => {
    it('shows Columns/Gutter/Margin/Show layout grid, defaulting to 12/24/32/false', async () => {
      const { editor } = mount();
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const frameSection = within(panel).getByTestId('frame-section');

      expect(within(frameSection).getByLabelText('Columns')).toHaveTextContent('12');
      expect(within(frameSection).getByLabelText('Gutter')).toHaveValue('24');
      expect(within(frameSection).getByLabelText('Margin')).toHaveValue('32');
      expect(within(frameSection).getByLabelText('Show layout grid')).not.toBeChecked();
    });

    it('does not show for a non-root selection', async () => {
      const { editor } = mount();
      await screen.findByText('Billing');
      await select(editor, 'button');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).queryByTestId('frame-section')).not.toBeInTheDocument();
    });

    it('does not show when nothing is selected', async () => {
      mount();
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).queryByTestId('frame-section')).not.toBeInTheDocument();
    });

    it('toggling "Show layout grid" calls onUpdateLayoutGrid with the current screen id', async () => {
      const onUpdateLayoutGrid = vi.fn();
      const { editor } = mount(1440, { onUpdateLayoutGrid });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByLabelText('Show layout grid'));

      expect(onUpdateLayoutGrid).toHaveBeenCalledWith('s1', { visible: true });
    });

    it('changing Columns calls onUpdateLayoutGrid with the picked number', async () => {
      const onUpdateLayoutGrid = vi.fn();
      const { editor } = mount(1440, { onUpdateLayoutGrid });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByLabelText('Columns'));
      await userEvent.click(await screen.findByRole('option', { name: '6' }));

      expect(onUpdateLayoutGrid).toHaveBeenCalledWith('s1', { columns: 6 });
    });

    it('reflects an already-saved layoutGrid instead of the defaults', async () => {
      const screensWithGrid: Screen[] = [
        { ...ONE_SCREEN[0], layoutGrid: { columns: 4, gutter: 8, margin: 16, visible: true } },
      ];
      const { editor } = mount(1440, { screens: screensWithGrid });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const frameSection = within(panel).getByTestId('frame-section');

      expect(within(frameSection).getByLabelText('Columns')).toHaveTextContent('4');
      expect(within(frameSection).getByLabelText('Show layout grid')).toBeChecked();
    });
  });

  describe('the Overlay section (root only, overlay frames)', () => {
    function overlayScreens(type: 'dialog' | 'sheet' | 'toast', overrides: Partial<Screen> = {}): Screen[] {
      return [{ ...createOverlayScreen({ type, id: 's1', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 }), ...overrides }];
    }

    it('does not show for a plain screen', async () => {
      const { editor } = mount(1440, { screens: ONE_SCREEN });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).queryByTestId('overlay-section')).not.toBeInTheDocument();
    });

    it('does not show for a non-root selection on an overlay frame', async () => {
      const { editor } = mount(1440, { screens: overlayScreens('dialog') });
      await screen.findByText('Billing');
      await select(editor, 'button');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      expect(within(panel).queryByTestId('overlay-section')).not.toBeInTheDocument();
    });

    it('shows Presentation and Dismissible for a dialog overlay, with no Side or Position', async () => {
      const { editor } = mount(1440, { screens: overlayScreens('dialog') });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const overlaySection = within(panel).getByTestId('overlay-section');

      expect(within(overlaySection).getByLabelText('Presentation')).toBeInTheDocument();
      expect(within(overlaySection).getByLabelText('Dismissible')).toBeChecked();
      expect(within(overlaySection).queryByLabelText('Side')).toBeNull();
      expect(within(overlaySection).queryByLabelText('Position')).toBeNull();
    });

    it('shows Presentation, Side and Dismissible for a sheet overlay, with no Position', async () => {
      const { editor } = mount(1440, { screens: overlayScreens('sheet') });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const overlaySection = within(panel).getByTestId('overlay-section');

      expect(within(overlaySection).getByLabelText('Side')).toHaveTextContent('Right');
      expect(within(overlaySection).getByLabelText('Dismissible')).toBeChecked();
      expect(within(overlaySection).queryByLabelText('Position')).toBeNull();
    });

    it('shows Presentation and Position for a toast overlay, with no Side or Dismissible', async () => {
      const { editor } = mount(1440, { screens: overlayScreens('toast') });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });
      const overlaySection = within(panel).getByTestId('overlay-section');

      expect(within(overlaySection).getByLabelText('Position')).toHaveTextContent('Bottom right');
      expect(within(overlaySection).queryByLabelText('Side')).toBeNull();
      expect(within(overlaySection).queryByLabelText('Dismissible')).toBeNull();
    });

    // Phase 2 review finding 2/3: overlayScreens('dialog') names the screen
    // "Dialog 1" - the dialog type's own default - so switching away from
    // it must also rename it to the new type's next free default (there is
    // no other sheet yet, so "Sheet 1").
    it('switching Presentation to Sheet rebuilds the whole object with the sheet defaults, and renames a still-default name', async () => {
      const onUpdatePresentation = vi.fn();
      const { editor } = mount(1440, { screens: overlayScreens('dialog'), onUpdatePresentation });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByText('Sheet'));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'sheet', side: 'right', dismissible: true }, 'Sheet 1');
    });

    it('switching Presentation to Toast rebuilds the whole object with the toast defaults, and renames a still-default name', async () => {
      const onUpdatePresentation = vi.fn();
      const { editor } = mount(1440, { screens: overlayScreens('dialog'), onUpdatePresentation });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByText('Toast'));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'toast', position: 'bottom-right' }, 'Toast 1');
    });

    it('switching Presentation keeps a custom name unchanged, calling onUpdatePresentation with no third argument', async () => {
      const onUpdatePresentation = vi.fn();
      const { editor } = mount(1440, {
        screens: overlayScreens('dialog', { name: 'Checkout confirmation' }),
        onUpdatePresentation,
      });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByText('Sheet'));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'sheet', side: 'right', dismissible: true });
      expect(onUpdatePresentation).toHaveBeenCalledTimes(1);
      expect(onUpdatePresentation.mock.calls[0]).toHaveLength(2);
    });

    // A name that merely LOOKS like a default - but for some type other
    // than the one this overlay is switching away FROM - is left alone too
    // (isDefaultOverlayName checks against the OLD type specifically): this
    // can only happen from data older than this feature, or hand-edited,
    // but must not be swept up and renamed regardless.
    it('switching Presentation keeps a default-looking name for a DIFFERENT type unchanged', async () => {
      const onUpdatePresentation = vi.fn();
      const { editor } = mount(1440, {
        screens: overlayScreens('dialog', { name: 'Sheet 3' }),
        onUpdatePresentation,
      });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByText('Toast'));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'toast', position: 'bottom-right' });
      expect(onUpdatePresentation.mock.calls[0]).toHaveLength(2);
    });

    // Numbering only ever counts existing OVERLAY names (nextOverlayDefaultName's
    // own doc comment) - a second dialog already named "Dialog 2" means the
    // freed-up "Dialog 1" is not reused; the next free slot is "Dialog 3".
    it('renaming on switch skips a default name already used by another overlay', async () => {
      const onUpdatePresentation = vi.fn();
      const other: Screen = { ...createOverlayScreen({ type: 'dialog', id: 's2', name: 'Dialog 2', pageId: 'p1', x: 400, y: 0 }) };
      const { editor } = mount(1440, { screens: [...overlayScreens('sheet', { name: 'Sheet 1' }), other], onUpdatePresentation });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByText('Dialog'));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'dialog', dismissible: true }, 'Dialog 3');
    });

    it('changing Side keeps dismissible and only replaces the side', async () => {
      const onUpdatePresentation = vi.fn();
      const { editor } = mount(1440, { screens: overlayScreens('sheet', { presentation: { type: 'sheet', side: 'right', dismissible: false } }), onUpdatePresentation });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByLabelText('Side'));
      await userEvent.click(await screen.findByRole('option', { name: 'Left' }));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'sheet', side: 'left', dismissible: false });
    });

    it('changing Position only replaces the position', async () => {
      const onUpdatePresentation = vi.fn();
      const { editor } = mount(1440, { screens: overlayScreens('toast'), onUpdatePresentation });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByLabelText('Position'));
      await userEvent.click(await screen.findByRole('option', { name: 'Top left' }));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'toast', position: 'top-left' });
    });

    it('toggling Dismissible keeps the side and only replaces dismissible', async () => {
      const onUpdatePresentation = vi.fn();
      const { editor } = mount(1440, { screens: overlayScreens('sheet'), onUpdatePresentation });
      await screen.findByText('Billing');
      await select(editor, 'root');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByLabelText('Dismissible'));

      expect(onUpdatePresentation).toHaveBeenCalledWith('s1', { type: 'sheet', side: 'right', dismissible: false });
    });
  });

  it('builds the fields for a selected Button from its schema and edits them', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    const buttonId = await select(editor, 'button');
    const panel = screen.getByRole('complementary', { name: 'Design' });

    expect(within(panel).getByTestId('inspector-type')).toHaveTextContent('Button');
    expect(within(panel).getByText('Frame')).toBeInTheDocument();
    for (const section of ['Content', 'Appearance', 'State', 'Layout', 'Accessibility']) {
      expect(within(panel).getByRole('heading', { name: section })).toBeInTheDocument();
    }
    expect(within(panel).queryByRole('heading', { name: 'Editor' })).toBeNull();

    const label = within(panel).getByLabelText('Label');
    expect(label).toHaveValue('Pay');
    await userEvent.clear(label);
    await userEvent.type(label, 'Checkout');
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.label).toBe('Checkout'));

    await userEvent.click(within(panel).getByRole('combobox', { name: 'Size' }));
    await userEvent.click(screen.getByRole('option', { name: 'Small' }));
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.size).toBe('sm'));

    await userEvent.click(within(panel).getByRole('switch', { name: 'Fill container' }));
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.grow).toBe(true));

    expect(within(panel).getByRole('combobox', { name: 'Variant' })).toHaveTextContent('Default');
  });

  it('conditionally shows icon controls and preserves button edits through undo and reload', async () => {
    const user = userEvent.setup();
    const { editor } = mount();
    await screen.findByText('Billing');
    const id = await select(editor, 'button');
    const panel = within(screen.getByRole('complementary', { name: 'Design' }));
    expect(panel.getAllByRole('heading').map(heading => heading.textContent).filter(name => name !== 'Align')).toEqual(['Content', 'Appearance', 'State', 'Layout', 'Accessibility']);
    expect(panel.queryByRole('switch', { name: 'Icon only' })).toBeNull();
    expect(panel.queryByRole('radiogroup', { name: 'Icon position' })).toBeNull();
    expect(panel.getByRole('textbox', { name: 'Accessible label' })).toBeVisible();
    await user.click(panel.getByRole('combobox', { name: 'Icon' }));
    await user.click(screen.getByRole('option', { name: 'Microphone' }));
    await user.click(panel.getByRole('switch', { name: 'Icon only' }));
    expect(panel.queryByRole('textbox', { name: 'Label' })).toBeNull();
    expect(panel.queryByRole('radiogroup', { name: 'Icon position' })).toBeNull();
    await user.type(panel.getByRole('textbox', { name: 'Accessible label' }), 'Record audio');
    expect(screen.getByRole('button', { name: 'Record audio' })).toBeVisible();
    await user.click(panel.getByRole('switch', { name: 'Loading' }));
    expect(screen.getByRole('button', { name: 'Record audio' })).toHaveAttribute('aria-busy', 'true');
    act(() => editor().actions.history.undo());
    expect(screen.getByRole('button', { name: 'Record audio' })).not.toHaveAttribute('aria-busy');
    act(() => editor().actions.history.redo());
    const saved = editor().query.serialize();
    act(() => { editor().actions.selectNode(ROOT_NODE); });
    act(() => { editor().actions.deserialize(saved); editor().actions.selectNode(id); });
    expect(panel.getByRole('switch', { name: 'Loading' })).toBeChecked();
    expect(panel.getByRole('textbox', { name: 'Accessible label' })).toHaveValue('Record audio');
    await user.click(panel.getByText('Advanced', { exact: true }));
    expect(panel.getByRole('combobox', { name: 'Min width' })).toBeVisible();
  });

  it('edits the current breakpoint of a LayoutBox and jumps to the other one', async () => {
    const { editor } = mount(375);
    await screen.findByText('Billing');
    await select(editor, 'root');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    expect(within(panel).getByTestId('inspector-type')).toHaveTextContent('Frame');

    const direction = within(panel).getByText('Direction').closest('[data-field]') as HTMLElement;
    expect(within(direction).getByText('mobile')).toBeInTheDocument();
    // The root here is a bare `<Element is={LayoutBox} canvas>`, so it takes
    // LayoutBox.craft.props (LAYOUT_BOX_DEFAULTS from lib/classes.ts), whose
    // `direction` default is `{ mobile: 'column', desktop: 'row' }` -- not the
    // app's ROOT_LAYOUT_PROPS override (`desktop: 'column'`), which only applies
    // via emptyLayoutJson()/renderTree(). Verified directly against the
    // installed default, independent of the Inspector code under test.
    expect(within(direction).getByTestId('breakpoint-caption')).toHaveTextContent('desktop: row');

    await userEvent.click(within(direction).getByText('Horizontal'));
    await waitFor(() =>
      expect(editor().query.node(ROOT_NODE).get().data.props.direction).toEqual({
        mobile: 'row',
        desktop: 'row',
      }),
    );

    await userEvent.click(within(direction).getByTestId('breakpoint-caption'));
    await waitFor(() => expect(screen.getByTestId('width')).toHaveTextContent('1440'));
  });

  it('hides Grow and Delete for the root and counts a container\'s children', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    await select(editor, 'root');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    expect(within(panel).queryByRole('switch', { name: 'Fill container' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(panel).getByText('2 items')).toBeInTheDocument();

    await select(editor, 'card');
    expect(within(panel).getByText('0 items')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('deletes the selected block', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    await select(editor, 'button');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pay' })).toBeNull());
    expect(within(panel).getByText('Nothing selected')).toBeInTheDocument();
  });

  describe('Design / Prototype / Elements / Diagrams panel mode', () => {
    it('shows a Design | Prototype | Elements | Diagrams segmented control, Design active by default', () => {
      mount();
      const seg = screen.getByRole('radiogroup', { name: 'Panel mode' });
      expect(within(seg).getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
      expect(within(seg).getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'off');
      expect(within(seg).getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'off');
      expect(within(seg).getByRole('radio', { name: 'Diagrams' })).toHaveAttribute('data-state', 'off');
    });

    it('renders every tab icon-only: no visible tab text, just each item\'s own accessible name', () => {
      mount();
      const seg = screen.getByRole('radiogroup', { name: 'Panel mode' });
      for (const label of ['Design', 'Prototype', 'Components', 'Diagrams']) {
        expect(within(seg).getByRole('radio', { name: label })).not.toHaveTextContent(label);
      }
    });

    it('calls onPanelModeChange when Prototype is clicked', async () => {
      const onPanelModeChange = vi.fn();
      mount(1440, { onPanelModeChange });
      await userEvent.click(screen.getByRole('radio', { name: 'Prototype' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('prototype');
    });

    it('calls onPanelModeChange when Elements is clicked', async () => {
      const onPanelModeChange = vi.fn();
      mount(1440, { onPanelModeChange });
      await userEvent.click(screen.getByRole('radio', { name: 'Components' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('components');
    });

    it('calls onPanelModeChange when Diagrams is clicked', async () => {
      const onPanelModeChange = vi.fn();
      mount(1440, { onPanelModeChange });
      await userEvent.click(screen.getByRole('radio', { name: 'Diagrams' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('diagrams');
    });

    it('shows the Prototype tab content instead of the Design fields when panelMode is prototype', async () => {
      const { editor } = mount(1440, { panelMode: 'prototype' });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Prototype' });

      expect(within(panel).getByText('Select a layer to add an interaction.')).toBeInTheDocument();
      expect(within(panel).queryByText('Nothing selected')).toBeNull();

      await select(editor, 'button');
      expect(within(panel).getByRole('combobox', { name: 'On click' })).toBeInTheDocument();
      expect(within(panel).queryByTestId('inspector-type')).toBeNull();
    });

    it('shows the Components tab content (search field, grouped list, drag sources) when panelMode is components', async () => {
      mount(1440, { panelMode: 'components' });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Components' });

      expect(within(panel).getByLabelText('Search components')).toBeInTheDocument();
      expect(within(panel).getByText('Layout')).toBeInTheDocument();
      expect(within(panel).getByText('Frame')).toBeInTheDocument();
      expect(within(panel).queryByText('Nothing selected')).toBeNull();
      expect(within(panel).queryByText('Select a layer to add an interaction.')).toBeNull();
    });

    // The Diagrams tab (spec docs/superpowers/specs/2026-09-14-panel-tabs-
    // icons-design.md): the same seven tools the floating palette (Shift+D)
    // offers, moved here from the Components tab's now-removed Diagram group.
    describe('the Diagrams tab', () => {
      it('shows the seven diagram tools when panelMode is diagrams', async () => {
        mount(1440, { panelMode: 'diagrams' });
        await screen.findByText('Billing');
        const panel = screen.getByRole('complementary', { name: 'Diagrams' });

        for (const label of ['Rectangle', 'Rounded', 'Decision', 'Terminal', 'Text', 'Note', 'Connector']) {
          expect(within(panel).getByRole('button', { name: label })).toBeInTheDocument();
        }
        expect(within(panel).getByLabelText('Search tools')).toBeInTheDocument();
        expect(within(panel).queryByText('Nothing selected')).toBeNull();
        expect(within(panel).queryByText('Select a layer to add an interaction.')).toBeNull();
      });

      it('arming a tool from the tab calls onSelectDiagramTool, same as the floating palette would', async () => {
        const onSelectDiagramTool = vi.fn();
        mount(1440, { panelMode: 'diagrams', diagramTool: POINTER_TOOL, onSelectDiagramTool });
        const panel = await screen.findByRole('complementary', { name: 'Diagrams' });

        await userEvent.click(within(panel).getByRole('button', { name: 'Decision' }));

        expect(onSelectDiagramTool).toHaveBeenCalledWith({ kind: 'shape', shape: 'decision' });
      });

      it("reflects the currently-armed diagramTool as the pressed row", async () => {
        mount(1440, { panelMode: 'diagrams', diagramTool: { kind: 'shape', shape: 'note' } });
        const panel = await screen.findByRole('complementary', { name: 'Diagrams' });

        expect(within(panel).getByRole('button', { name: 'Note' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(panel).getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'false');
      });
    });

    it('keeps the tab list keyboard operable with four items (roving focus)', async () => {
      mount();
      const design = screen.getByRole('radio', { name: 'Design' });
      const prototype = screen.getByRole('radio', { name: 'Prototype' });
      const elements = screen.getByRole('radio', { name: 'Components' });
      const diagrams = screen.getByRole('radio', { name: 'Diagrams' });

      design.focus();
      expect(design).toHaveFocus();

      await userEvent.keyboard('{ArrowRight}');
      expect(prototype).toHaveFocus();

      await userEvent.keyboard('{ArrowRight}');
      expect(elements).toHaveFocus();

      await userEvent.keyboard('{ArrowRight}');
      expect(diagrams).toHaveFocus();

      await userEvent.keyboard('{ArrowLeft}');
      expect(elements).toHaveFocus();
    });
  });

  describe('Minimize panel', () => {
    it('shows a Minimize panel button when expanded; clicking it calls onToggleCollapsed', async () => {
      const onToggleCollapsed = vi.fn();
      mount(1440, { onToggleCollapsed });
      const button = screen.getByRole('button', { name: 'Minimize panel' });
      expect(button).toHaveAttribute('aria-expanded', 'true');

      await userEvent.click(button);
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });

    it('collapses to a rail with an Expand panel button and the four tab icons, hiding the tab list and fields', () => {
      mount(1440, { collapsed: true });
      const panel = screen.getByRole('complementary', { name: 'Design' });

      const expandButton = within(panel).getByRole('button', { name: 'Expand panel' });
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');
      expect(within(panel).getByRole('button', { name: 'Design' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Prototype' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Components' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Diagrams' })).toBeInTheDocument();
      expect(within(panel).queryByRole('radiogroup', { name: 'Panel mode' })).toBeNull();
      expect(within(panel).queryByText('Nothing selected')).toBeNull();
    });

    it('clicking a rail icon expands the panel on that tab', async () => {
      const onPanelModeChange = vi.fn();
      const onToggleCollapsed = vi.fn();
      mount(1440, { collapsed: true, onPanelModeChange, onToggleCollapsed });
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Prototype' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('prototype');
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });

    it('clicking the Elements rail icon selects Elements and expands', async () => {
      const onPanelModeChange = vi.fn();
      const onToggleCollapsed = vi.fn();
      mount(1440, { collapsed: true, onPanelModeChange, onToggleCollapsed });
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Components' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('components');
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });

    it('clicking the Diagrams rail icon selects Diagrams and expands', async () => {
      const onPanelModeChange = vi.fn();
      const onToggleCollapsed = vi.fn();
      mount(1440, { collapsed: true, onPanelModeChange, onToggleCollapsed });
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Diagrams' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('diagrams');
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });
  });
});

it('offers inherited and explicit appearance only on the root frame', async () => {
  const update = vi.fn();
  const { editor } = renderInEditor(<AppearanceContext.Provider value={{ appearance: 'dark', setFrameAppearance: update }}><Frame><Element is={LayoutBox} canvas><Button /></Element></Frame><Inspector screens={ONE_SCREEN} currentScreenId="s1" panelMode="design" onPanelModeChange={() => {}} collapsed={false} onToggleCollapsed={() => {}} /></AppearanceContext.Provider>);
  act(() => editor().actions.selectNode(ROOT_NODE));
  const control = await screen.findByRole('combobox', { name: 'Frame appearance' });
  expect(screen.getByRole('option', { name: 'File default · External - Dark' })).toBeInTheDocument();
  for (const name of ['External - Light', 'External - Dark', 'Internal - Light', 'Internal - Dark']) expect(screen.getByRole('option', { name })).toBeInTheDocument();
  await userEvent.selectOptions(control, 'light');
  expect(update).toHaveBeenLastCalledWith('s1', 'light');
  await userEvent.selectOptions(control, 'inherit');
  expect(update).toHaveBeenLastCalledWith('s1', undefined);
  act(() => editor().actions.selectNode(editor().query.node(ROOT_NODE).get().data.nodes[0]));
  await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Frame appearance' })).not.toBeInTheDocument());
});

it('undoes an image aspect preset and its linked size as one inspector edit', async () => {
  const { Image } = await import('@/components/blocks/image');
  const { editor } = renderInEditor(<><Frame><Element is={LayoutBox} canvas><Image size={{ width: 400, height: 400, locked: true }} /></Element></Frame><Inspector screens={ONE_SCREEN} currentScreenId="s1" panelMode="design" onPanelModeChange={() => {}} collapsed={false} onToggleCollapsed={() => {}} /></>);
  const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
  act(() => { editor().actions.selectNode(id); editor().actions.history.clear(); });
  await userEvent.click(await screen.findByRole('combobox', { name: 'Aspect ratio' }));
  await userEvent.click(screen.getByRole('option', { name: 'Video (16:9)' }));
  expect(editor().query.node(id).get().data.props.size.height).toBe(225);
  act(() => editor().actions.history.undo());
  expect(editor().query.node(id).get().data.props).toMatchObject({ aspect: 'square', size: { width: 400, height: 400 } });
  expect(editor().query.history.canUndo()).toBe(false);
  act(() => editor().actions.history.redo());
  expect(editor().query.node(id).get().data.props).toMatchObject({ aspect: 'video', size: { height: 225 } });
});
