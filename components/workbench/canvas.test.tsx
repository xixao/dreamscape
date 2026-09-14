import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { frameRect, toCanvasPoint, type Viewport } from '@/lib/canvas/viewport';
import { loadViewport, saveViewport } from '@/lib/canvas/viewport-store';
import { type DiagramAction, type DiagramNode, type DiagramState } from '@/lib/diagram/store';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { DEFAULT_STAGE_COMMENTS } from './comments/comment-layer';
import { Canvas, CanvasViewportProvider, useCanvasViewport, useCanvasViewportController } from './canvas';

function diagramNode(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id: 'dn1',
    kind: 'rect',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    text: '',
    color: 'neutral',
    ...overrides,
  };
}

const SCREEN_1: Screen = { id: 's1', name: 'Frame 1', layout: emptyLayoutJson(), stageWidth: 400, stageHeight: 300, x: 0, y: 0 };
const SCREEN_2: Screen = {
  id: 's2',
  name: 'Frame 2',
  layout: emptyLayoutJson(),
  stageWidth: 400,
  stageHeight: 300,
  x: 800,
  y: 0,
};

// Canvas is a controlled component now (viewport/setViewport/viewportSize
// come from context, owned by useCanvasViewportController) - this harness
// plays the role WorkbenchShell does in the real app: call the controller
// once, wrap Canvas (and, for a couple of tests, an extra sibling that also
// needs the same context) in one CanvasViewportProvider.
function Harness({
  screens,
  focusedScreenId,
  onFocusScreen,
  onRenameScreen,
  onMoveScreen,
  onMoveScreens,
  fileId,
  pageId = 'page1',
  extra,
  diagram,
  onDiagramAction,
  onDeselectDiagram,
  selectedFrameIds,
  onToggleFrameSelection,
  onSetFrameSelection,
  onClearFrameSelection,
  pixelGridVisible,
  diagramPaletteOpen,
  measuredHeights,
  onMeasuredHeight,
}: {
  screens: Screen[];
  focusedScreenId: string;
  onFocusScreen: (id: string) => void;
  onRenameScreen: (id: string, name: string) => void;
  onMoveScreen: (id: string, position: { x: number; y: number }) => void;
  onMoveScreens?: (updates: { id: string; x: number; y: number }[]) => void;
  fileId: string;
  pageId?: string;
  extra?: ReactNode;
  // The diagram marquee (spec docs/superpowers/specs/2026-09-13-diagrams-
  // design.md section 10) - absent, like every other diagram prop Canvas
  // itself already defaults, keeps every pre-existing test in this file an
  // inert, empty diagram exactly as before.
  diagram?: DiagramState;
  onDiagramAction?: (action: DiagramAction) => void;
  onDeselectDiagram?: () => void;
  selectedFrameIds?: ReadonlySet<string>;
  onToggleFrameSelection?: (id: string) => void;
  onSetFrameSelection?: (ids: string[]) => void;
  onClearFrameSelection?: () => void;
  pixelGridVisible?: boolean;
  diagramPaletteOpen?: boolean;
  measuredHeights?: ReadonlyMap<string, number>;
  onMeasuredHeight?: (id: string, height: number) => void;
}) {
  const { viewport, setViewport, viewportSize, rootRef, animateTo } = useCanvasViewportController({
    fileId,
    pageId,
    frames: screens.map((screen) => frameRect(screen)),
  });
  return (
    <CanvasViewportProvider viewport={viewport} setViewport={setViewport} viewportSize={viewportSize} animateTo={animateTo}>
      <Canvas
        screens={screens}
        focusedScreenId={focusedScreenId}
        onFocusScreen={onFocusScreen}
        onRenameScreen={onRenameScreen}
        onMoveScreen={onMoveScreen}
        onMoveScreens={onMoveScreens}
        comments={DEFAULT_STAGE_COMMENTS}
        rootRef={rootRef}
        diagram={diagram}
        onDiagramAction={onDiagramAction}
        onDeselectDiagram={onDeselectDiagram}
        selectedFrameIds={selectedFrameIds}
        onToggleFrameSelection={onToggleFrameSelection}
        onSetFrameSelection={onSetFrameSelection}
        onClearFrameSelection={onClearFrameSelection}
        pixelGridVisible={pixelGridVisible}
        diagramPaletteOpen={diagramPaletteOpen}
        measuredHeights={measuredHeights}
        onMeasuredHeight={onMeasuredHeight}
      />
      {extra}
    </CanvasViewportProvider>
  );
}

function renderCanvas({
  screens = [SCREEN_1],
  focusedScreenId = SCREEN_1.id,
  onFocusScreen = vi.fn(),
  onRenameScreen = vi.fn(),
  onMoveScreen = vi.fn(),
  onMoveScreens,
  fileId = 'file1',
  pageId = 'page1',
  extra,
  diagram,
  onDiagramAction,
  onDeselectDiagram,
  selectedFrameIds,
  onToggleFrameSelection,
  onSetFrameSelection,
  onClearFrameSelection,
  pixelGridVisible,
  diagramPaletteOpen,
  measuredHeights,
  onMeasuredHeight,
}: {
  screens?: Screen[];
  focusedScreenId?: string;
  onFocusScreen?: (id: string) => void;
  onRenameScreen?: (id: string, name: string) => void;
  onMoveScreen?: (id: string, position: { x: number; y: number }) => void;
  onMoveScreens?: (updates: { id: string; x: number; y: number }[]) => void;
  fileId?: string;
  pageId?: string;
  extra?: ReactNode;
  diagram?: DiagramState;
  onDiagramAction?: (action: DiagramAction) => void;
  onDeselectDiagram?: () => void;
  selectedFrameIds?: ReadonlySet<string>;
  onToggleFrameSelection?: (id: string) => void;
  onSetFrameSelection?: (ids: string[]) => void;
  onClearFrameSelection?: () => void;
  pixelGridVisible?: boolean;
  diagramPaletteOpen?: boolean;
  measuredHeights?: ReadonlyMap<string, number>;
  onMeasuredHeight?: (id: string, height: number) => void;
} = {}) {
  return renderInEditor(
    <Harness
      screens={screens}
      focusedScreenId={focusedScreenId}
      onFocusScreen={onFocusScreen}
      onRenameScreen={onRenameScreen}
      onMoveScreen={onMoveScreen}
      onMoveScreens={onMoveScreens}
      fileId={fileId}
      pageId={pageId}
      extra={extra}
      diagram={diagram}
      onDiagramAction={onDiagramAction}
      onDeselectDiagram={onDeselectDiagram}
      selectedFrameIds={selectedFrameIds}
      onToggleFrameSelection={onToggleFrameSelection}
      onSetFrameSelection={onSetFrameSelection}
      onClearFrameSelection={onClearFrameSelection}
      pixelGridVisible={pixelGridVisible}
      diagramPaletteOpen={diagramPaletteOpen}
      measuredHeights={measuredHeights}
      onMeasuredHeight={onMeasuredHeight}
    />,
  );
}

describe('Canvas', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom's default getBoundingClientRect returns all zeros; a non-zero
    // size is needed for fitAll's own default-viewport computation and for
    // the root-relative wheel/click math below.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1200,
      height: 800,
      right: 1200,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the focused screen with a live, interactive Stage (resize handles present)', async () => {
    renderCanvas({ screens: [SCREEN_1, SCREEN_2], focusedScreenId: SCREEN_1.id });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
    expect(screen.getAllByRole('separator', { name: 'Resize width' })).toHaveLength(1);
  });

  it('renders every non-focused screen as a read-only preview with no resize handles', async () => {
    renderCanvas({ screens: [SCREEN_1, SCREEN_2], focusedScreenId: SCREEN_1.id });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
    expect(screen.getAllByTestId('artboard-preview')).toHaveLength(1);
  });

  it('positions every frame at its own x/y in canvas space', async () => {
    renderCanvas({ screens: [SCREEN_1, SCREEN_2] });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
    const frame1 = screen.getByTestId('frame-s1');
    const frame2 = screen.getByTestId('frame-s2');
    expect(frame1).toHaveStyle({ left: '0px', top: '0px' });
    expect(frame2).toHaveStyle({ left: '800px', top: '0px' });
  });

  it('clicking inside a non-focused frame focuses it', async () => {
    const onFocusScreen = vi.fn();
    renderCanvas({ screens: [SCREEN_1, SCREEN_2], focusedScreenId: SCREEN_1.id, onFocusScreen });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

    fireEvent.pointerDown(screen.getByTestId('artboard-preview'));
    expect(onFocusScreen).toHaveBeenCalledWith(SCREEN_2.id);
  });

  it('clicking empty canvas deselects but does not change the focused frame', async () => {
    const onFocusScreen = vi.fn();
    const { editor } = renderCanvas({ screens: [SCREEN_1], onFocusScreen });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('canvas-root'));

    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(false));
    expect(onFocusScreen).not.toHaveBeenCalled();
  });

  it('clicking empty canvas also clears the diagram selection', async () => {
    const onDeselectDiagram = vi.fn();
    renderCanvas({ screens: [SCREEN_1], onDeselectDiagram });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    fireEvent.pointerDown(screen.getByTestId('canvas-root'));

    expect(onDeselectDiagram).toHaveBeenCalled();
  });

  it('hosts the diagram layer inside the transformed canvas layer', async () => {
    renderCanvas({ screens: [SCREEN_1] });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const layer = screen.getByTestId('diagram-layer');
    expect(screen.getByTestId('canvas-layer')).toContainElement(layer);
  });

  describe('frame titles', () => {
    it('renders a title for every frame, above its top-left corner', async () => {
      renderCanvas({ screens: [SCREEN_1, SCREEN_2] });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
      expect(screen.getByText(SCREEN_1.name)).toBeInTheDocument();
      expect(screen.getByText(SCREEN_2.name)).toBeInTheDocument();
    });

    it('dragging the focused frame\'s title calls onMoveScreen for that screen, snapped to 8px', async () => {
      // Pinned to zoom 1 (rather than relying on renderCanvas's own default
      // fitAll, which would pick some other zoom for two 400px-wide frames
      // 800px apart) so the drag delta below maps 1:1 to canvas px.
      saveViewport(window.localStorage, 'dragtest', 'page1', { x: 0, y: 0, zoom: 1 });
      const onMoveScreen = vi.fn();
      renderCanvas({ screens: [SCREEN_1, SCREEN_2], focusedScreenId: SCREEN_1.id, onMoveScreen, fileId: 'dragtest' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 0 });

      expect(onMoveScreen).toHaveBeenCalledWith(SCREEN_1.id, { x: 24, y: 0 });
    });

    it('dragging a non-focused frame\'s title moves it without focusing it', async () => {
      saveViewport(window.localStorage, 'dragtest2', 'page1', { x: 0, y: 0, zoom: 1 });
      const onMoveScreen = vi.fn();
      const onFocusScreen = vi.fn();
      renderCanvas({
        screens: [SCREEN_1, SCREEN_2],
        focusedScreenId: SCREEN_1.id,
        onMoveScreen,
        onFocusScreen,
        fileId: 'dragtest2',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_2.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 8, clientY: 0 });

      expect(onMoveScreen).toHaveBeenCalledWith(SCREEN_2.id, { x: SCREEN_2.x! + 8, y: SCREEN_2.y! });
      expect(onFocusScreen).not.toHaveBeenCalled();
    });

    it('double-clicking a title and pressing Enter calls onRenameScreen for that screen', async () => {
      const onRenameScreen = vi.fn();
      renderCanvas({ screens: [SCREEN_1, SCREEN_2], onRenameScreen });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      fireEvent.doubleClick(screen.getByText(SCREEN_1.name));
      const input = screen.getByRole('textbox', { name: 'Frame name' });
      fireEvent.change(input, { target: { value: 'Renamed frame' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRenameScreen).toHaveBeenCalledWith(SCREEN_1.id, 'Renamed frame');
    });

    it('snaps a drag to another frame\'s edge, nearer than the grid, and draws a guide that clears on pointerup', async () => {
      saveViewport(window.localStorage, 'snaptest', 'page1', { x: 0, y: 0, zoom: 1 });
      const onMoveScreen = vi.fn();
      const other: Screen = { ...SCREEN_2, x: 803 };
      renderCanvas({ screens: [SCREEN_1, other], focusedScreenId: SCREEN_1.id, onMoveScreen, fileId: 'snaptest' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      // Dragged right edge (0+404+400=804) sits 1px from the other frame's
      // left edge (803) - nearer than the grid's own line at 408 (4px away).
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 404, clientY: 0 });

      expect(onMoveScreen).toHaveBeenLastCalledWith(SCREEN_1.id, { x: 403, y: 0 });
      expect(screen.getAllByTestId('snap-guide-line').length).toBeGreaterThan(0);

      fireEvent.pointerUp(title, { pointerId: 1, clientX: 404, clientY: 0 });
      expect(screen.queryAllByTestId('snap-guide-line')).toHaveLength(0);
    });

    it('Cmd held while dragging a title moves it freely, ignoring the grid and other frames', async () => {
      saveViewport(window.localStorage, 'snaptest2', 'page1', { x: 0, y: 0, zoom: 1 });
      const onMoveScreen = vi.fn();
      const other: Screen = { ...SCREEN_2, x: 803 };
      renderCanvas({ screens: [SCREEN_1, other], focusedScreenId: SCREEN_1.id, onMoveScreen, fileId: 'snaptest2' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 404, clientY: 0, metaKey: true });

      expect(onMoveScreen).toHaveBeenLastCalledWith(SCREEN_1.id, { x: 404, y: 0 });
    });

    // One of the review's named missing tests (task-grid-review.md):
    // frame-title.test.tsx already proves Alt reports nearest-neighbour
    // distances in isolation - this confirms they actually reach the
    // screen as rendered snap-chip elements through the real Canvas ->
    // SnapGuides wiring, not just through FrameTitle's own onSnapGuides
    // callback.
    it('Alt held while dragging renders a nearest-neighbour distance chip through the full Canvas', async () => {
      saveViewport(window.localStorage, 'altchip', 'page1', { x: 0, y: 0, zoom: 1 });
      const far: Screen = { ...SCREEN_2, id: 'far', x: 2000 };
      renderCanvas({ screens: [SCREEN_1, far], focusedScreenId: SCREEN_1.id, fileId: 'altchip' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      // Raw (0+4)=4 grid-snaps to 8 (the only candidate within tolerance -
      // 'far' is much too distant to be an edge match). SCREEN_1's right
      // edge lands at 8+400=408; the gap to `far`'s left edge (2000) is
      // 1592, reported on its right side (no left/top/bottom neighbour).
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 4, clientY: 0, altKey: true });

      const chips = screen.getAllByTestId('snap-chip');
      expect(chips).toHaveLength(1);
      expect(chips[0]).toHaveTextContent('1592');
    });
  });

  describe('multi-select of frames', () => {
    it('Shift+click a frame title clears the diagram selection first (review re-review R9)', async () => {
      const onToggleFrameSelection = vi.fn();
      const onDeselectDiagram = vi.fn();
      renderCanvas({ screens: [SCREEN_1, SCREEN_2], onToggleFrameSelection, onDeselectDiagram });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      fireEvent.pointerDown(screen.getByText(SCREEN_1.name), { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });

      expect(onDeselectDiagram).toHaveBeenCalledTimes(1);
      expect(onToggleFrameSelection).toHaveBeenCalledWith(SCREEN_1.id);
    });

    it('Shift+click a frame title toggles it into the selection without starting a drag', async () => {
      const onToggleFrameSelection = vi.fn();
      const onMoveScreen = vi.fn();
      renderCanvas({ screens: [SCREEN_1, SCREEN_2], onToggleFrameSelection, onMoveScreen });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0, shiftKey: true });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 100, clientY: 0 });

      expect(onToggleFrameSelection).toHaveBeenCalledWith(SCREEN_1.id);
      expect(onMoveScreen).not.toHaveBeenCalled();
    });

    it('renders a thin accent outline on every selected frame', async () => {
      renderCanvas({ screens: [SCREEN_1, SCREEN_2], selectedFrameIds: new Set([SCREEN_1.id]) });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      expect(screen.getByTestId(`frame-${SCREEN_1.id}`)).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId(`frame-${SCREEN_1.id}`)).toHaveClass('outline-acc');
      expect(screen.getByTestId(`frame-${SCREEN_2.id}`)).not.toHaveAttribute('data-selected');
    });

    // Diagram-mode click-to-select (spec docs/superpowers/specs/2026-09-13-
    // overlay-frames-design.md section 5): while the Diagram palette is
    // open, a press on a frame's own body selects it into selectedFrameIds
    // instead of its usual job.
    describe('while the Diagram palette is open', () => {
      it('a plain press on the focused frame\'s body sets the frame selection to just that frame', async () => {
        const onSetFrameSelection = vi.fn();
        const onDeselectDiagram = vi.fn();
        renderCanvas({
          screens: [SCREEN_1, SCREEN_2],
          focusedScreenId: SCREEN_1.id,
          onSetFrameSelection,
          onDeselectDiagram,
          diagramPaletteOpen: true,
        });
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        fireEvent.pointerDown(screen.getByTestId('diagram-frame-cover'), { shiftKey: false });

        expect(onDeselectDiagram).toHaveBeenCalledTimes(1);
        expect(onSetFrameSelection).toHaveBeenCalledWith([SCREEN_1.id]);
      });

      it('a Shift+press on the focused frame\'s body toggles it into the selection', async () => {
        const onToggleFrameSelection = vi.fn();
        renderCanvas({
          screens: [SCREEN_1, SCREEN_2],
          focusedScreenId: SCREEN_1.id,
          onToggleFrameSelection,
          diagramPaletteOpen: true,
        });
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        fireEvent.pointerDown(screen.getByTestId('diagram-frame-cover'), { shiftKey: true });

        expect(onToggleFrameSelection).toHaveBeenCalledWith(SCREEN_1.id);
      });

      it('a press on a non-focused frame\'s body selects it instead of focusing it', async () => {
        const onSetFrameSelection = vi.fn();
        const onFocusScreen = vi.fn();
        renderCanvas({
          screens: [SCREEN_1, SCREEN_2],
          focusedScreenId: SCREEN_1.id,
          onFocusScreen,
          onSetFrameSelection,
          diagramPaletteOpen: true,
        });
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        fireEvent.pointerDown(screen.getByTestId('artboard-preview'));

        expect(onSetFrameSelection).toHaveBeenCalledWith([SCREEN_2.id]);
        expect(onFocusScreen).not.toHaveBeenCalled();
      });

      it('renders no cover, and a press focuses normally, while the palette is closed', async () => {
        const onFocusScreen = vi.fn();
        renderCanvas({ screens: [SCREEN_1, SCREEN_2], focusedScreenId: SCREEN_1.id, onFocusScreen });
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        expect(screen.queryByTestId('diagram-frame-cover')).toBeNull();
        fireEvent.pointerDown(screen.getByTestId('artboard-preview'));
        expect(onFocusScreen).toHaveBeenCalledWith(SCREEN_2.id);
      });
    });

    it('a marquee drag on empty canvas selects every frame it intersects', async () => {
      saveViewport(window.localStorage, 'marqueetest', 'page1', { x: 0, y: 0, zoom: 1 });
      const onSetFrameSelection = vi.fn();
      renderCanvas({
        screens: [SCREEN_1, SCREEN_2],
        onSetFrameSelection,
        fileId: 'marqueetest',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const root = screen.getByTestId('canvas-root');
      // A box from (50,50) to (450,450): overlaps SCREEN_1 (0,0,400,300) but
      // not SCREEN_2 (800,0,400,300).
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 450, clientY: 450 });
      expect(screen.getByTestId('marquee-selection')).toBeInTheDocument();

      fireEvent.pointerUp(root, { pointerId: 1, clientX: 450, clientY: 450 });

      expect(onSetFrameSelection).toHaveBeenCalledWith([SCREEN_1.id]);
      expect(screen.queryByTestId('marquee-selection')).toBeNull();
    });

    // Review fix wave item 8: the marquee's own hit test (frameRect, via
    // rectsIntersect) used to always fall back to the static
    // ARTBOARD_MIN_HEIGHT (640) for an auto-height frame, regardless of how
    // tall its content actually is.
    it('hit-tests an auto-height frame against its fed measured height, not just ARTBOARD_MIN_HEIGHT', async () => {
      saveViewport(window.localStorage, 'marqueeheight', 'page1', { x: 0, y: 0, zoom: 1 });
      const autoHeightScreen: Screen = { id: 'auto1', name: 'Auto Frame', layout: emptyLayoutJson(), stageWidth: 400, x: 0, y: 0 };
      const onSetFrameSelection = vi.fn();
      const { rerenderUi } = renderCanvas({
        screens: [autoHeightScreen],
        onSetFrameSelection,
        fileId: 'marqueeheight',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

      const root = screen.getByTestId('canvas-root');
      // A box from (0,700) to (400,900) - below the frame's own unmeasured
      // ARTBOARD_MIN_HEIGHT (640) bottom edge entirely, but well within its
      // fed measured height of 1000.
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 0, clientY: 700 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 400, clientY: 900 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 400, clientY: 900 });
      expect(onSetFrameSelection).toHaveBeenLastCalledWith([]);

      onSetFrameSelection.mockClear();
      rerenderUi(
        <Harness
          screens={[autoHeightScreen]}
          focusedScreenId={autoHeightScreen.id}
          onFocusScreen={vi.fn()}
          onRenameScreen={vi.fn()}
          onMoveScreen={vi.fn()}
          onSetFrameSelection={onSetFrameSelection}
          fileId="marqueeheight"
          measuredHeights={new Map([[autoHeightScreen.id, 1000]])}
        />,
      );
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 0, clientY: 700 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 400, clientY: 900 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 400, clientY: 900 });
      expect(onSetFrameSelection).toHaveBeenLastCalledWith([autoHeightScreen.id]);
    });

    it('a drag that comes back under the click threshold clears the painted marquee box (review re-review R4)', async () => {
      saveViewport(window.localStorage, 'backtest', 'page1', { x: 0, y: 0, zoom: 1 });
      renderCanvas({ screens: [SCREEN_1, SCREEN_2], fileId: 'backtest' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const root = screen.getByTestId('canvas-root');
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 90, clientY: 80 });
      expect(screen.getByTestId('marquee-selection')).toBeInTheDocument();

      fireEvent.pointerMove(root, { pointerId: 1, clientX: 52, clientY: 51 });
      expect(screen.queryByTestId('marquee-selection')).toBeNull();
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 52, clientY: 51 });
    });

    it('a plain click (no drag) on empty canvas does not treat it as a marquee', async () => {
      saveViewport(window.localStorage, 'clicktest', 'page1', { x: 0, y: 0, zoom: 1 });
      const onSetFrameSelection = vi.fn();
      const onClearFrameSelection = vi.fn();
      renderCanvas({
        screens: [SCREEN_1, SCREEN_2],
        onSetFrameSelection,
        onClearFrameSelection,
        fileId: 'clicktest',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const root = screen.getByTestId('canvas-root');
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50 });
      // Review re-review R4: pointerdown alone must never paint the box - it
      // used to set an immediate 0x0 marqueeBox, flashing a visible
      // 1px-bordered dot under the cursor on every plain click.
      expect(screen.queryByTestId('marquee-selection')).toBeNull();
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 51, clientY: 50 });

      expect(onClearFrameSelection).toHaveBeenCalledTimes(1);
      expect(onSetFrameSelection).not.toHaveBeenCalled();
      expect(screen.queryByTestId('marquee-selection')).toBeNull();
    });

    it('clicking empty canvas clears the frame selection', async () => {
      const onClearFrameSelection = vi.fn();
      renderCanvas({ screens: [SCREEN_1], onClearFrameSelection });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

      fireEvent.pointerDown(screen.getByTestId('canvas-root'));

      expect(onClearFrameSelection).toHaveBeenCalledTimes(1);
    });

    it('Shift+marquee unions with the existing selection instead of replacing it', async () => {
      saveViewport(window.localStorage, 'shiftmarquee', 'page1', { x: 0, y: 0, zoom: 1 });
      const onSetFrameSelection = vi.fn();
      const onClearFrameSelection = vi.fn();
      renderCanvas({
        screens: [SCREEN_1, SCREEN_2],
        selectedFrameIds: new Set([SCREEN_2.id]),
        onSetFrameSelection,
        onClearFrameSelection,
        fileId: 'shiftmarquee',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const root = screen.getByTestId('canvas-root');
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50, shiftKey: true });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 450, clientY: 450, shiftKey: true });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 450, clientY: 450, shiftKey: true });

      expect(onClearFrameSelection).not.toHaveBeenCalled();
      expect(onSetFrameSelection).toHaveBeenCalledWith(
        expect.arrayContaining([SCREEN_1.id, SCREEN_2.id]),
      );
    });

    it('dragging one selected title moves every selected frame by the same delta and saves them together', async () => {
      saveViewport(window.localStorage, 'multidrag', 'page1', { x: 0, y: 0, zoom: 1 });
      const onMoveScreens = vi.fn();
      const onMoveScreen = vi.fn();
      renderCanvas({
        screens: [SCREEN_1, SCREEN_2],
        focusedScreenId: SCREEN_1.id,
        onMoveScreens,
        onMoveScreen,
        selectedFrameIds: new Set([SCREEN_1.id, SCREEN_2.id]),
        fileId: 'multidrag',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 0 });

      // Raw (20,0) grid-snaps to (24,0) - the same +24/+0 delta is applied
      // to SCREEN_2's own starting position (800,0) unresolved a second time.
      expect(onMoveScreens).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          { id: SCREEN_1.id, x: 24, y: 0 },
          { id: SCREEN_2.id, x: 824, y: 0 },
        ]),
      );
      expect(onMoveScreen).not.toHaveBeenCalled();
    });

    it('skips a selected id with no known start position instead of teleporting it to the origin (review fix wave item 2)', async () => {
      // 'ghost' is not in `screens` at all - the sort of stale id that used
      // to slip in before frame selection was made page-scoped (an id left
      // over from a page the user has since switched away from, still
      // present in selectedFrameIds because nothing had cleared it yet).
      // startPositions.get('ghost') is undefined, and the old code's
      // `?? { x: 0, y: 0 }` fallback sent it flying to the canvas origin
      // the instant SCREEN_1 moved.
      saveViewport(window.localStorage, 'ghostdrag', 'page1', { x: 0, y: 0, zoom: 1 });
      const onMoveScreens = vi.fn();
      renderCanvas({
        screens: [SCREEN_1, SCREEN_2],
        focusedScreenId: SCREEN_1.id,
        onMoveScreens,
        selectedFrameIds: new Set([SCREEN_1.id, SCREEN_2.id, 'ghost']),
        fileId: 'ghostdrag',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 0 });

      const updates = onMoveScreens.mock.calls.at(-1)?.[0] as Array<{ id: string; x: number; y: number }>;
      expect(updates).toHaveLength(2);
      expect(updates.find((update) => update.id === 'ghost')).toBeUndefined();
      expect(updates).toEqual(
        expect.arrayContaining([
          { id: SCREEN_1.id, x: 24, y: 0 },
          { id: SCREEN_2.id, x: 824, y: 0 },
        ]),
      );
    });

    it('a solo drag of a frame outside the selection still uses the single-screen path', async () => {
      saveViewport(window.localStorage, 'solodrag', 'page1', { x: 0, y: 0, zoom: 1 });
      const onMoveScreens = vi.fn();
      const onMoveScreen = vi.fn();
      renderCanvas({
        screens: [SCREEN_1, SCREEN_2],
        focusedScreenId: SCREEN_1.id,
        onMoveScreens,
        onMoveScreen,
        selectedFrameIds: new Set([SCREEN_2.id]),
        fileId: 'solodrag',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const title = screen.getByText(SCREEN_1.name);
      fireEvent.pointerDown(title, { pointerId: 1, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(title, { pointerId: 1, clientX: 20, clientY: 0 });

      expect(onMoveScreen).toHaveBeenCalledWith(SCREEN_1.id, { x: 24, y: 0 });
      expect(onMoveScreens).not.toHaveBeenCalled();
    });

    // Review fix wave nit 16: the marquee's start/current corners are
    // resolved to canvas space the moment each is captured (pointerdown for
    // start, each pointermove for current), instead of deferring both
    // conversions to pointerup through whatever viewport happens to be
    // current by then.
    it('anchors the marquee in canvas space, so a wheel-pan mid-drag does not shift the resulting selection', async () => {
      saveViewport(window.localStorage, 'wheelmidmarquee', 'page1', { x: 0, y: 0, zoom: 1 });
      const target: Screen = { id: 'target', name: 'Target', layout: emptyLayoutJson(), stageWidth: 100, stageHeight: 300, x: 250, y: 0 };
      const onSetFrameSelection = vi.fn();
      renderCanvas({ screens: [target], onSetFrameSelection, fileId: 'wheelmidmarquee' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

      const root = screen.getByTestId('canvas-root');
      // Marquee starts at screen x=500 while the viewport is still at x=0 -
      // canvas-space start = 500 (right of `target`, which spans canvas x
      // 250-350).
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 500, clientY: 0 });

      // A wheel-pan mid-drag shifts the viewport's x by +300 (panBy negates
      // deltaX) - screen x=500 now corresponds to a different canvas point
      // than it did at pointerdown.
      fireEvent.wheel(root, { deltaX: -300, deltaY: 0 });

      // Ends the drag with a further move to screen x=520 - under the
      // now-panned viewport, canvas x = 520-300 = 220, just left of
      // target's own left edge (250).
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 520, clientY: 300 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 520, clientY: 300 });

      // Fixed canvas-space rect: [min(500,220), max(500,220)] = [220,500] on
      // x - overlaps target (250-350). The old, late-conversion code
      // reinterpreted the START corner (500) through the POST-pan viewport
      // too (500-300=200), producing [200,220] on x - entirely left of
      // target, missing it.
      expect(onSetFrameSelection).toHaveBeenCalledWith(['target']);
    });

    // Review fix wave nit 12.
    describe('marquee robustness (review fix wave nit 12)', () => {
      it('only a primary (left) button press starts a marquee', async () => {
        saveViewport(window.localStorage, 'rightclickmarquee', 'page1', { x: 0, y: 0, zoom: 1 });
        const onSetFrameSelection = vi.fn();
        renderCanvas({ screens: [SCREEN_1, SCREEN_2], onSetFrameSelection, fileId: 'rightclickmarquee' });
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        const root = screen.getByTestId('canvas-root');
        fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50, button: 2 });
        expect(screen.queryByTestId('marquee-selection')).toBeNull();

        fireEvent.pointerMove(root, { pointerId: 1, clientX: 450, clientY: 450 });
        expect(screen.queryByTestId('marquee-selection')).toBeNull();

        fireEvent.pointerUp(root, { pointerId: 1, clientX: 450, clientY: 450 });
        expect(onSetFrameSelection).not.toHaveBeenCalled();
      });

      it('clears on window blur, discarding the gesture instead of turning it into a selection', async () => {
        saveViewport(window.localStorage, 'blurmarquee', 'page1', { x: 0, y: 0, zoom: 1 });
        const onSetFrameSelection = vi.fn();
        renderCanvas({ screens: [SCREEN_1, SCREEN_2], onSetFrameSelection, fileId: 'blurmarquee' });
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        const root = screen.getByTestId('canvas-root');
        fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50 });
        fireEvent.pointerMove(root, { pointerId: 1, clientX: 450, clientY: 450 });
        expect(screen.getByTestId('marquee-selection')).toBeInTheDocument();

        fireEvent.blur(window);
        expect(screen.queryByTestId('marquee-selection')).toBeNull();

        // The mouse button may physically still be down - a later pointerup
        // for the same gesture must be a no-op, not a late selection.
        fireEvent.pointerUp(root, { pointerId: 1, clientX: 450, clientY: 450 });
        expect(onSetFrameSelection).not.toHaveBeenCalled();
      });

      it('Escape cancels an in-progress marquee without selecting anything', async () => {
        saveViewport(window.localStorage, 'escapemarquee', 'page1', { x: 0, y: 0, zoom: 1 });
        const onSetFrameSelection = vi.fn();
        renderCanvas({ screens: [SCREEN_1, SCREEN_2], onSetFrameSelection, fileId: 'escapemarquee' });
        await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

        const root = screen.getByTestId('canvas-root');
        fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50 });
        fireEvent.pointerMove(root, { pointerId: 1, clientX: 450, clientY: 450 });
        expect(screen.getByTestId('marquee-selection')).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByTestId('marquee-selection')).toBeNull();

        fireEvent.pointerUp(root, { pointerId: 1, clientX: 450, clientY: 450 });
        expect(onSetFrameSelection).not.toHaveBeenCalled();
      });
    });
  });

  describe('CanvasViewportProvider / useCanvasViewport', () => {
    it('throws when used outside the provider', () => {
      function Bad() {
        useCanvasViewport();
        return null;
      }
      expect(() => render(<Bad />)).toThrow(/useCanvasViewport must be used inside/);
    });

    it('exposes viewport, setViewport and viewportSize to descendants', () => {
      function Probe() {
        const { viewport, viewportSize } = useCanvasViewport();
        return (
          <output data-testid="probe">
            {viewport.x},{viewport.y},{viewport.zoom},{viewportSize.width}x{viewportSize.height}
          </output>
        );
      }
      render(
        <CanvasViewportProvider
          viewport={{ x: 1, y: 2, zoom: 1 }}
          setViewport={() => {}}
          viewportSize={{ width: 300, height: 200 }}
          animateTo={() => {}}
        >
          <Probe />
        </CanvasViewportProvider>,
      );
      expect(screen.getByTestId('probe')).toHaveTextContent('1,2,1,300x200');
    });
  });

  describe('viewport persistence', () => {
    it('defaults to fitting all frames when nothing is stored for this file', async () => {
      renderCanvas({ screens: [SCREEN_1, SCREEN_2], fileId: 'newfile' });
      await waitFor(() => {
        const stored = loadViewport(window.localStorage, 'newfile', 'page1');
        expect(stored).not.toBeNull();
      });
    });

    it('restores a previously saved viewport for this file instead of fitting all', async () => {
      saveViewport(window.localStorage, 'restoredfile', 'page1', { x: 42, y: 24, zoom: 2 });
      renderCanvas({ fileId: 'restoredfile' });
      // Restored, not overwritten with a freshly computed fit-all - saving
      // again immediately should read back the same values.
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      expect(loadViewport(window.localStorage, 'restoredfile', 'page1')).toEqual({ x: 42, y: 24, zoom: 2 });
    });

    it('keeps different files\' viewports independent', async () => {
      saveViewport(window.localStorage, 'fileA', 'page1', { x: 5, y: 5, zoom: 1 });
      renderCanvas({ fileId: 'fileB' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      expect(loadViewport(window.localStorage, 'fileA', 'page1')).toEqual({ x: 5, y: 5, zoom: 1 });
    });

    it('keeps different pages of the same file independent, keyed by pageId', async () => {
      saveViewport(window.localStorage, 'pagesfile', 'pageA', { x: 1, y: 1, zoom: 1 });
      saveViewport(window.localStorage, 'pagesfile', 'pageB', { x: 9, y: 9, zoom: 2 });
      renderCanvas({ fileId: 'pagesfile', pageId: 'pageA' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      expect(loadViewport(window.localStorage, 'pagesfile', 'pageA')).toEqual({ x: 1, y: 1, zoom: 1 });
      expect(loadViewport(window.localStorage, 'pagesfile', 'pageB')).toEqual({ x: 9, y: 9, zoom: 2 });
    });

    it('swaps to the new page\'s own remembered viewport when pageId changes on an already-mounted canvas', async () => {
      function Readout() {
        const { viewport } = useCanvasViewport();
        return (
          <output data-testid="page-switch-readout">
            {viewport.x},{viewport.y},{viewport.zoom}
          </output>
        );
      }

      saveViewport(window.localStorage, 'switchfile', 'pageB', { x: 77, y: 88, zoom: 1.5 });
      const result = renderCanvas({ fileId: 'switchfile', pageId: 'pageA', extra: <Readout /> });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

      result.rerenderUi(
        <Harness
          screens={[SCREEN_1]}
          focusedScreenId={SCREEN_1.id}
          onFocusScreen={vi.fn()}
          onRenameScreen={vi.fn()}
          onMoveScreen={vi.fn()}
          fileId="switchfile"
          pageId="pageB"
          extra={<Readout />}
        />,
      );

      await waitFor(() => expect(screen.getByTestId('page-switch-readout')).toHaveTextContent('77,88,1.5'));
    });

    it('fits all of the new page\'s frames when it has no remembered viewport of its own', async () => {
      function Readout() {
        const { viewport } = useCanvasViewport();
        return (
          <output data-testid="page-switch-fit-readout">
            {viewport.x.toFixed(1)},{viewport.y.toFixed(1)},{viewport.zoom.toFixed(3)}
          </output>
        );
      }

      saveViewport(window.localStorage, 'switchfile2', 'pageA', { x: 500, y: 500, zoom: 3 });
      const result = renderCanvas({ fileId: 'switchfile2', pageId: 'pageA', extra: <Readout /> });
      await waitFor(() => expect(screen.getByTestId('page-switch-fit-readout')).toHaveTextContent('500.0,500.0,3.000'));

      // pageB has never been visited before: no remembered viewport, so
      // switching to it must fit its own frame instead of inheriting
      // pageA's 500,500,3 (which would leave pageB's frame off screen).
      result.rerenderUi(
        <Harness
          screens={[SCREEN_1]}
          focusedScreenId={SCREEN_1.id}
          onFocusScreen={vi.fn()}
          onRenameScreen={vi.fn()}
          onMoveScreen={vi.fn()}
          fileId="switchfile2"
          pageId="pageB"
          extra={<Readout />}
        />,
      );

      await waitFor(() => {
        const text = screen.getByTestId('page-switch-fit-readout').textContent ?? '';
        expect(text).not.toBe('500.0,500.0,3.000');
      });
    });
  });

  describe('pan and zoom interactions', () => {
    function Readout() {
      const { viewport } = useCanvasViewport();
      return (
        <output data-testid="viewport-readout">
          {Math.round(viewport.x)},{Math.round(viewport.y)},{viewport.zoom.toFixed(3)}
        </output>
      );
    }

    function renderWithReadout(overrides: Parameters<typeof renderCanvas>[0] = {}) {
      return renderCanvas({ ...overrides, extra: <Readout /> });
    }

    it('plain wheel pans the canvas and prevents the default (page) scroll', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const before = screen.getByTestId('viewport-readout').textContent;

      const notCancelled = fireEvent.wheel(root, { deltaX: 10, deltaY: 20 });

      expect(notCancelled).toBe(false);
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).not.toHaveTextContent(before!));
    });

    it('Cmd+wheel zooms around the pointer and prevents default', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const [, , beforeZoom] = screen.getByTestId('viewport-readout').textContent!.split(',');

      const notCancelled = fireEvent.wheel(root, { deltaY: -100, metaKey: true, clientX: 600, clientY: 400 });

      expect(notCancelled).toBe(false);
      await waitFor(() => {
        const [, , afterZoom] = screen.getByTestId('viewport-readout').textContent!.split(',');
        expect(afterZoom).not.toBe(beforeZoom);
      });
    });

    it('Ctrl+wheel also zooms (trackpad pinch is reported as a ctrl wheel event)', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const [, , beforeZoom] = screen.getByTestId('viewport-readout').textContent!.split(',');

      fireEvent.wheel(root, { deltaY: 50, ctrlKey: true, clientX: 600, clientY: 400 });

      await waitFor(() => {
        const [, , afterZoom] = screen.getByTestId('viewport-readout').textContent!.split(',');
        expect(afterZoom).not.toBe(beforeZoom);
      });
    });

    it('holding Space shows a grab cursor; releasing it (keyup) restores the default cursor', () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      expect(root).not.toHaveClass('cursor-grab');

      fireEvent.keyDown(window, { code: 'Space' });
      expect(root).toHaveClass('cursor-grab');

      fireEvent.keyUp(window, { code: 'Space' });
      expect(root).not.toHaveClass('cursor-grab');
    });

    it('Space + drag pans the canvas and shows a grabbing cursor while dragging', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const before = screen.getByTestId('viewport-readout').textContent;

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 100, clientY: 100, screenX: 100, screenY: 100, button: 0 });
      expect(root).toHaveClass('cursor-grabbing');
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 150, clientY: 130, screenX: 150, screenY: 130 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 150, clientY: 130, screenX: 150, screenY: 130 });

      await waitFor(() => expect(screen.getByTestId('viewport-readout')).not.toHaveTextContent(before!));
      expect(root).not.toHaveClass('cursor-grabbing');
    });

    // One of the review's named missing tests (task-grid-review.md): Space
    // held on empty canvas must take the pan path, never the marquee one -
    // shouldStartPan(button) gates handleRootPointerDown's own branch
    // between the two, and this is the one thing that existing "Space +
    // drag pans" test above never actually checked.
    it('Space held on empty canvas pans, never starting a marquee', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const before = screen.getByTestId('viewport-readout').textContent;

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 100, clientY: 100, screenX: 100, screenY: 100, button: 0 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 150, clientY: 130, screenX: 150, screenY: 130 });
      expect(screen.queryByTestId('marquee-selection')).toBeNull();

      fireEvent.pointerUp(root, { pointerId: 1, clientX: 150, clientY: 130, screenX: 150, screenY: 130 });
      expect(screen.queryByTestId('marquee-selection')).toBeNull();
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).not.toHaveTextContent(before!));
    });

    it('releasing Space mid-drag ends the pan (a later move does nothing)', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
      fireEvent.keyUp(window, { code: 'Space' });
      const midway = screen.getByTestId('viewport-readout').textContent;

      fireEvent.pointerMove(root, { pointerId: 1, clientX: 400, clientY: 400 });

      expect(screen.getByTestId('viewport-readout')).toHaveTextContent(midway!);
    });

    it('middle mouse drag pans without needing Space', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const before = screen.getByTestId('viewport-readout').textContent;

      fireEvent.pointerDown(root, { pointerId: 1, clientX: 100, clientY: 100, screenX: 100, screenY: 100, button: 1 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 160, clientY: 120, screenX: 160, screenY: 120 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 160, clientY: 120, screenX: 160, screenY: 120 });

      await waitFor(() => expect(screen.getByTestId('viewport-readout')).not.toHaveTextContent(before!));
    });

    it('a plain left-button drag (no Space, no middle mouse) does not pan', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const before = screen.getByTestId('viewport-readout').textContent;

      fireEvent.pointerDown(root, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 400, clientY: 400 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 400, clientY: 400 });

      expect(screen.getByTestId('viewport-readout')).toHaveTextContent(before!);
    });

  describe('wheel over the focused frame lets it scroll its own content when possible', () => {
    // The focused frame's own iframe body - components/workbench/canvas.tsx
    // mirrors wheel handling onto its document so panning/zooming also work
    // while the pointer is over the frame being edited, not only over the
    // empty canvas around it.
    function focusedFrameBody(): HTMLElement {
      const iframe = document.querySelector('[data-testid="artboard"] [data-testid="canvas-frame"]') as
        | HTMLIFrameElement
        | null;
      const body = iframe?.contentDocument?.body;
      if (!body) throw new Error('focused frame body not ready');
      return body;
    }

    function makeBodyScrollable({ scrollTop }: { scrollTop: number }): HTMLElement {
      const body = focusedFrameBody();
      Object.defineProperty(body, 'scrollHeight', { value: 2000, configurable: true });
      Object.defineProperty(body, 'clientHeight', { value: 300, configurable: true });
      Object.defineProperty(body, 'scrollTop', { value: scrollTop, configurable: true });
      return body;
    }

    it('is not prevented and does not pan the canvas when the frame document can still scroll down', async () => {
      renderWithReadout();
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const body = makeBodyScrollable({ scrollTop: 0 });
      const before = screen.getByTestId('viewport-readout').textContent;

      const notCancelled = fireEvent.wheel(body, { deltaY: 50 });

      expect(notCancelled).toBe(true);
      expect(screen.getByTestId('viewport-readout')).toHaveTextContent(before!);
    });

    it('pans the canvas once the frame is at the bottom of its own scroll range', async () => {
      renderWithReadout();
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      // scrollTop + clientHeight === scrollHeight: no room left to scroll down.
      const body = makeBodyScrollable({ scrollTop: 1700 });
      const before = screen.getByTestId('viewport-readout').textContent;

      const notCancelled = fireEvent.wheel(body, { deltaY: 50 });

      expect(notCancelled).toBe(false);
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).not.toHaveTextContent(before!));
    });

    it('Ctrl/Cmd+wheel always zooms, even when the frame document can still scroll', async () => {
      renderWithReadout();
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      makeBodyScrollable({ scrollTop: 0 });
      const [, , beforeZoom] = screen.getByTestId('viewport-readout').textContent!.split(',');

      const notCancelled = fireEvent.wheel(focusedFrameBody(), { deltaY: -50, ctrlKey: true });

      expect(notCancelled).toBe(false);
      await waitFor(() => {
        const [, , afterZoom] = screen.getByTestId('viewport-readout').textContent!.split(',');
        expect(afterZoom).not.toBe(beforeZoom);
      });
    });
  });

  describe('Space + drag pans from a non-focused frame too', () => {
    function previewFrameBody(): HTMLElement {
      const iframe = document.querySelector('[data-testid="artboard-preview"] [data-testid="canvas-frame"]') as
        | HTMLIFrameElement
        | null;
      const body = iframe?.contentDocument?.body;
      if (!body) throw new Error('preview frame body not ready');
      return body;
    }

    it('pans the canvas by the drag delta and leaves the focused screen unchanged', async () => {
      const onFocusScreen = vi.fn();
      renderWithReadout({ screens: [SCREEN_1, SCREEN_2], focusedScreenId: SCREEN_1.id, onFocusScreen });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
      const body = previewFrameBody();
      const before = screen.getByTestId('viewport-readout').textContent;

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(body, { pointerId: 1, clientX: 100, clientY: 100, screenX: 100, screenY: 100, button: 0 });
      fireEvent.pointerMove(body, { pointerId: 1, clientX: 150, clientY: 130, screenX: 150, screenY: 130 });
      fireEvent.pointerUp(body, { pointerId: 1, clientX: 150, clientY: 130, screenX: 150, screenY: 130 });

      await waitFor(() => expect(screen.getByTestId('viewport-readout')).not.toHaveTextContent(before!));
      expect(onFocusScreen).not.toHaveBeenCalled();
    });

    it('a plain press with no Space still focuses the non-focused frame, unchanged', async () => {
      const onFocusScreen = vi.fn();
      renderWithReadout({ screens: [SCREEN_1, SCREEN_2], focusedScreenId: SCREEN_1.id, onFocusScreen });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      fireEvent.pointerDown(previewFrameBody(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });

      expect(onFocusScreen).toHaveBeenCalledWith(SCREEN_2.id);
    });
  });

  describe('screen-coordinate pan tracking (single pointer owner)', () => {
    // The focused frame's own iframe - a pan that starts here is driven by
    // startFramePan/moveFramePan (canvas.tsx), same as "wheel over the
    // focused frame..." above.
    function frameIframe(): HTMLIFrameElement {
      const iframe = document.querySelector('[data-testid="artboard"] [data-testid="canvas-frame"]') as
        | HTMLIFrameElement
        | null;
      if (!iframe) throw new Error('focused frame iframe not ready');
      return iframe;
    }

    function frameBody(): HTMLElement {
      const body = frameIframe().contentDocument?.body;
      if (!body) throw new Error('focused frame body not ready');
      return body;
    }

    it('tracks three consecutive in-frame moves by their cumulative screen delta, even while the frame\'s own bounding rect is mocked to move with the pan', async () => {
      saveViewport(window.localStorage, 'screenpan-cumulative', 'page1', { x: 0, y: 0, zoom: 1 });
      renderWithReadout({ fileId: 'screenpan-cumulative' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const body = frameBody();

      // A naive implementation that re-derives a window point from
      // clientX/Y plus the frame's current rect (rather than trusting
      // screenX/Y outright) would see this rect "chase" the pointer by
      // exactly the amount each tick pans by, reproducing the stall this
      // fix removes - clientX/Y are held constant throughout to make that
      // trap obvious: only screenX/Y ever change below, and a correct
      // implementation never has to look at the rect at all.
      let rectLeft = 0;
      vi.spyOn(frameIframe(), 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            left: rectLeft,
            top: 0,
            width: 400,
            height: 300,
            right: rectLeft + 400,
            bottom: 300,
            x: rectLeft,
            y: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      );

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(body, { pointerId: 1, screenX: 100, screenY: 100, clientX: 50, clientY: 50, button: 0 });
      rectLeft = 30;
      fireEvent.pointerMove(body, { pointerId: 1, screenX: 130, screenY: 100, clientX: 50, clientY: 50 });
      rectLeft = 60;
      fireEvent.pointerMove(body, { pointerId: 1, screenX: 160, screenY: 100, clientX: 50, clientY: 50 });
      rectLeft = 90;
      fireEvent.pointerMove(body, { pointerId: 1, screenX: 190, screenY: 100, clientX: 50, clientY: 50 });
      fireEvent.pointerUp(body, { pointerId: 1, screenX: 190, screenY: 100 });

      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toHaveTextContent('90,0,1.000'));
    });

    it('keeps panning with no jump when a move continues in the parent document after leaving the frame', async () => {
      saveViewport(window.localStorage, 'screenpan-handoff', 'page1', { x: 0, y: 0, zoom: 1 });
      renderWithReadout({ fileId: 'screenpan-handoff' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const body = frameBody();
      const root = screen.getByTestId('canvas-root');

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(body, { pointerId: 1, screenX: 100, screenY: 100, clientX: 50, clientY: 50, button: 0 });
      fireEvent.pointerMove(body, { pointerId: 1, screenX: 130, screenY: 100, clientX: 80, clientY: 50 });
      // The gesture "leaves the frame": the next move for the same pointer
      // arrives at the root instead, with a clientX/Y in a totally
      // different (parent-document) range than the frame-local values
      // above - the old bug compared this raw against frame-local
      // lastX/lastY and jumped; screenX/Y never cares which document an
      // event came from.
      fireEvent.pointerMove(root, { pointerId: 1, screenX: 160, screenY: 100, clientX: 500, clientY: 500 });
      fireEvent.pointerUp(root, { pointerId: 1, screenX: 160, screenY: 100 });

      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toHaveTextContent('60,0,1.000'));
    });

    it('a pan started on the root ignores frame events for its duration', async () => {
      saveViewport(window.localStorage, 'screenpan-root-owns', 'page1', { x: 0, y: 0, zoom: 1 });
      renderWithReadout({ fileId: 'screenpan-root-owns' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const root = screen.getByTestId('canvas-root');
      const body = frameBody();

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(root, { pointerId: 1, screenX: 100, screenY: 100, clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(root, { pointerId: 1, screenX: 130, screenY: 100, clientX: 130, clientY: 100 });

      // A stray frame pointerdown for a different pointer must not hijack
      // the already-active root pan...
      fireEvent.pointerDown(body, { pointerId: 2, screenX: 500, screenY: 500, clientX: 10, clientY: 10, button: 0 });
      // ...nor does a frame move for the SAME pointer get to touch it: the
      // active pan is not "inFrame", so moveFramePan's own guard must
      // ignore this regardless of pointerId matching.
      fireEvent.pointerMove(body, { pointerId: 1, screenX: 999, screenY: 999, clientX: 10, clientY: 10 });

      fireEvent.pointerMove(root, { pointerId: 1, screenX: 160, screenY: 100, clientX: 160, clientY: 100 });
      fireEvent.pointerUp(root, { pointerId: 1, screenX: 160, screenY: 100 });

      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toHaveTextContent('60,0,1.000'));
    });

    it('ends an in-progress pan on window blur, so a later move does nothing', async () => {
      renderWithReadout();
      const root = screen.getByTestId('canvas-root');
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());
      const before = screen.getByTestId('viewport-readout').textContent;

      fireEvent.keyDown(window, { code: 'Space' });
      fireEvent.pointerDown(root, { pointerId: 1, screenX: 100, screenY: 100, clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(root, { pointerId: 1, screenX: 130, screenY: 100, clientX: 130, clientY: 100 });
      const midway = screen.getByTestId('viewport-readout').textContent;
      expect(midway).not.toBe(before);

      fireEvent.blur(window);
      fireEvent.pointerMove(root, { pointerId: 1, screenX: 400, screenY: 400, clientX: 400, clientY: 400 });

      expect(screen.getByTestId('viewport-readout')).toHaveTextContent(midway!);
    });

    it('removes the window blur listener on unmount', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderWithReadout();
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toBeInTheDocument());

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    });
  });

  describe('wheel over a non-focused frame reaches it too', () => {
    // Mirrors "wheel over the focused frame..." above, but against a
    // preview's own iframe instead of the focused frame's - the fix this
    // covers wires the same bridge to every frame document, not only the
    // focused one (spec section 3: two-finger scroll and Cmd/Ctrl+wheel
    // pinch-zoom are general canvas interactions, not carved out for
    // whichever frame happens to be focused).
    function previewFrameBody(): HTMLElement {
      const iframe = document.querySelector('[data-testid="artboard-preview"] [data-testid="canvas-frame"]') as
        | HTMLIFrameElement
        | null;
      const body = iframe?.contentDocument?.body;
      if (!body) throw new Error('preview frame body not ready');
      return body;
    }

    it('a plain wheel pans the viewport by the delta, leaving the focused screen unchanged', async () => {
      saveViewport(window.localStorage, 'previewwheel-pan', 'page1', { x: 0, y: 0, zoom: 1 });
      const onFocusScreen = vi.fn();
      renderWithReadout({
        screens: [SCREEN_1, SCREEN_2],
        focusedScreenId: SCREEN_1.id,
        onFocusScreen,
        fileId: 'previewwheel-pan',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));

      const notCancelled = fireEvent.wheel(previewFrameBody(), { deltaX: 10, deltaY: 20 });

      expect(notCancelled).toBe(false);
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).toHaveTextContent('-10,-20,1.000'));
      expect(onFocusScreen).not.toHaveBeenCalled();
    });

    it('a ctrlKey wheel zooms around the pointer position converted from the preview\'s own frame coordinates, keeping the canvas point under the pointer fixed', async () => {
      const initial: Viewport = { x: 50, y: 30, zoom: 2 };
      saveViewport(window.localStorage, 'previewwheel-zoom', 'page1', initial);
      renderWithReadout({
        screens: [SCREEN_1, SCREEN_2],
        focusedScreenId: SCREEN_1.id,
        fileId: 'previewwheel-zoom',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
      await waitFor(() =>
        expect(screen.getByTestId('viewport-readout')).toHaveTextContent(`50,30,${initial.zoom.toFixed(3)}`),
      );

      const clientX = 40;
      const clientY = 25;
      // The preview's iframe rect is stubbed flat to {left:0,top:0} by this
      // file's own beforeEach (like every element), so the frame-to-window
      // conversion this test exists to prove (frame rect + zoom) reduces to
      // `clientX/clientY * zoom` here - still enough to catch a fix that
      // dropped the zoom factor or the rect entirely, since either would
      // keep a DIFFERENT point fixed whenever zoom is not 1, as it is here.
      const windowPoint = { x: clientX * initial.zoom, y: clientY * initial.zoom };
      const canvasPointUnderPointer = toCanvasPoint(windowPoint, initial);

      fireEvent.wheel(previewFrameBody(), { deltaY: -50, ctrlKey: true, clientX, clientY });

      await waitFor(() => {
        const [x, y, zoom] = screen.getByTestId('viewport-readout').textContent!.split(',').map(Number);
        expect(zoom).not.toBe(initial.zoom);
        const canvasPointAfter = toCanvasPoint(windowPoint, { x, y, zoom });
        expect(Math.abs(canvasPointAfter.x - canvasPointUnderPointer.x)).toBeLessThan(1);
        expect(Math.abs(canvasPointAfter.y - canvasPointUnderPointer.y)).toBeLessThan(1);
      });
    });

    it('does not pan or prevent default while the preview\'s own document can still scroll, but still pans once it can\'t', async () => {
      saveViewport(window.localStorage, 'previewwheel-scroll', 'page1', { x: 0, y: 0, zoom: 1 });
      renderWithReadout({
        screens: [SCREEN_1, SCREEN_2],
        focusedScreenId: SCREEN_1.id,
        fileId: 'previewwheel-scroll',
      });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(2));
      const body = previewFrameBody();
      Object.defineProperty(body, 'scrollHeight', { value: 2000, configurable: true });
      Object.defineProperty(body, 'clientHeight', { value: 300, configurable: true });
      Object.defineProperty(body, 'scrollTop', { value: 0, configurable: true });

      const notCancelledWhileScrollable = fireEvent.wheel(body, { deltaY: 50 });
      expect(notCancelledWhileScrollable).toBe(true);
      expect(screen.getByTestId('viewport-readout')).toHaveTextContent('0,0,1.000');

      // Proves the wheel bridge really is wired up here (not merely silent
      // because nothing is listening at all): once there is no more room to
      // scroll down, the exact same gesture falls through to panning the
      // canvas - mirrors "wheel over the focused frame..."'s own pair of
      // tests above.
      Object.defineProperty(body, 'scrollTop', { value: 1700, configurable: true });
      const notCancelledAtBottom = fireEvent.wheel(body, { deltaY: 50 });
      expect(notCancelledAtBottom).toBe(false);
      await waitFor(() => expect(screen.getByTestId('viewport-readout')).not.toHaveTextContent('0,0,1.000'));
    });
  });
  });

  describe('the dot grid', () => {
    it('is visible at 100% zoom, at full opacity', () => {
      renderCanvas();
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toContain('radial-gradient');
      expect(root.style.opacity).toBe('1');
    });

    it('is gone below 15% zoom', async () => {
      saveViewport(window.localStorage, 'zoomedout', 'page1', { x: 0, y: 0, zoom: 0.1 });
      renderCanvas({ fileId: 'zoomedout' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toBeFalsy();
    });

    // Matt, 2026-09-14 ("the background seems to change color" while
    // zooming): a single hard cutoff used to blink the whole dot layer in
    // or out on one wheel tick, right where the dots are densest and
    // closest to reading as a solid tint - a visible jump, not a fade.
    // 25% zoom (the old exact cutoff) now sits mid-band, at partial
    // opacity, proving the transition is a smooth ramp rather than a snap.
    it('fades smoothly through the 15%-35% zoom band, rather than snapping at one cutoff', async () => {
      saveViewport(window.localStorage, 'midfade', 'page1', { x: 0, y: 0, zoom: 0.25 });
      renderCanvas({ fileId: 'midfade' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toContain('radial-gradient');
      const opacity = Number(root.style.opacity);
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    });

    it('is hidden when pixelGridVisible is false, regardless of zoom', () => {
      renderCanvas({ pixelGridVisible: false });
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toBeFalsy();
    });
  });
});

describe('useCanvasViewportController animateTo', () => {
  // requestAnimationFrame, fully under this test's control: `flush` invokes
  // whatever callback(s) are currently pending with a chosen timestamp,
  // mirroring how a real browser would call back with the frame time -
  // deterministic without depending on fake-timer/RAF integration details.
  function mockRaf() {
    let pending: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      pending.push(cb);
      return pending.length;
    }) as typeof requestAnimationFrame);
    return {
      flush(timestamp: number) {
        // The callbacks call setState outside of any React-recognized event,
        // so React does not necessarily commit synchronously afterward -
        // act() forces the commit before the assertion right after this
        // returns ever runs.
        act(() => {
          const callbacks = pending;
          pending = [];
          callbacks.forEach((cb) => cb(timestamp));
        });
      },
    };
  }

  function AnimationHarness({ fileId = 'animfile' }: { fileId?: string }) {
    const { viewport, animateTo, setViewport, rootRef } = useCanvasViewportController({
      fileId,
      pageId: 'page1',
      frames: [],
    });
    return (
      <div ref={rootRef}>
        <output data-testid="readout">
          {viewport.x.toFixed(2)},{viewport.y.toFixed(2)},{viewport.zoom.toFixed(3)}
        </output>
        <button type="button" onClick={() => animateTo({ x: 100, y: 200, zoom: 2 }, 200)}>
          animate
        </button>
        <button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: 5 }))}>
          pan
        </button>
      </div>
    );
  }

  beforeEach(() => {
    // Every test below uses the same default fileId - without this, a
    // viewport an earlier test animated to (and so persisted, via the
    // controller's own save-on-change effect) would leak in as the NEXT
    // test's starting point instead of the plain {x:0,y:0,zoom:1} default.
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('eases from the current viewport to the exact target over the given duration', () => {
    const raf = mockRaf();
    render(<AnimationHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'animate' }));

    raf.flush(1000); // establishes the animation's own start time
    expect(screen.getByTestId('readout')).toHaveTextContent('0.00,0.00,1.000');

    raf.flush(1100); // 100 of 200ms => t=0.5, ease-out cubic(0.5) = 0.875
    expect(screen.getByTestId('readout')).toHaveTextContent('87.50,175.00,1.875');

    raf.flush(1200); // 200 of 200ms => t=1, exactly the target
    expect(screen.getByTestId('readout')).toHaveTextContent('100.00,200.00,2.000');
  });

  it('stops scheduling frames once it reaches the target', () => {
    const raf = mockRaf();
    render(<AnimationHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'animate' }));
    raf.flush(0);
    raf.flush(200);
    expect(screen.getByTestId('readout')).toHaveTextContent('100.00,200.00,2.000');

    raf.flush(300);
    expect(screen.getByTestId('readout')).toHaveTextContent('100.00,200.00,2.000');
  });

  it('is cancelled by a direct setViewport call - any pan or zoom input - leaving the viewport where the animation had reached', () => {
    const raf = mockRaf();
    render(<AnimationHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'animate' }));
    raf.flush(0);
    raf.flush(100); // t=0.5, zoom 1.875

    fireEvent.click(screen.getByRole('button', { name: 'pan' }));
    expect(screen.getByTestId('readout')).toHaveTextContent('87.50,175.00,5.000');

    // The cancelled animation's own next frame (already scheduled before the
    // pan) must not overwrite the pan with further eased values.
    raf.flush(200);
    expect(screen.getByTestId('readout')).toHaveTextContent('87.50,175.00,5.000');
  });
});

// Spec docs/superpowers/specs/2026-09-13-diagrams-design.md section 10: the
// same marquee gesture tested above for frames also selects diagram shapes
// and connectors - no separate gesture, no new pointer-events wiring (see
// canvas.tsx's own comment on endMarquee): every diagram element that
// already reaches this far (nothing starts on a shape, connector, handle,
// quick-add circle or frame - each stops its own pointerdown from
// propagating this far in diagram-layer.tsx) is exactly the "empty canvas"
// case the existing `event.target === event.currentTarget` gate already
// scopes the frame marquee to.
describe('Canvas marquee also selects diagram shapes and connectors', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('selects a diagram node whose box intersects the marquee', async () => {
    saveViewport(window.localStorage, 'diagrammarquee1', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 500, y: 500, width: 100, height: 60 })],
      edges: [],
      selection: [],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, fileId: 'diagrammarquee1' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    // A box from (450,450) to (700,650): fully contains n1 (500,500,100,60)
    // and stays well clear of SCREEN_1 (0,0,400,300).
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 450, clientY: 450 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 700, clientY: 650 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 700, clientY: 650 });

    expect(onDiagramAction).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'n1' }] });
  });

  it('selects a connector whose path bounding box intersects the marquee', async () => {
    saveViewport(window.localStorage, 'diagrammarquee2', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const diagram: DiagramState = {
      nodes: [
        diagramNode({ id: 'n1', x: 500, y: 500, width: 40, height: 40 }),
        diagramNode({ id: 'n2', x: 700, y: 500, width: 40, height: 40 }),
      ],
      edges: [{ id: 'e1', source: { nodeId: 'n1' }, target: { nodeId: 'n2' }, kind: 'step', arrow: 'end' }],
      selection: [],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, fileId: 'diagrammarquee2' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    // Touches the connector's own span (x 500..740) without touching either
    // shape's box directly (a thin strip between them, y 460..490).
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 500, clientY: 460 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 740, clientY: 550 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 740, clientY: 550 });

    const call = onDiagramAction.mock.calls.find((c) => c[0].type === 'select');
    expect(call).toBeDefined();
    expect(call![0].selection).toContainEqual({ type: 'edge', id: 'e1' });
  });

  it('expands a marquee-caught node to its whole group, plus the connector between members', async () => {
    saveViewport(window.localStorage, 'diagrammarquee3', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const diagram: DiagramState = {
      nodes: [
        diagramNode({ id: 'n1', x: 500, y: 500, groupId: 'g1' }),
        diagramNode({ id: 'n2', x: 900, y: 900, groupId: 'g1' }),
      ],
      edges: [{ id: 'e1', source: { nodeId: 'n1' }, target: { nodeId: 'n2' }, kind: 'step', arrow: 'end' }],
      selection: [],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, fileId: 'diagrammarquee3' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    // Only reaches n1 (500,500,100,60); n2 sits far away at (900,900).
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 450, clientY: 450 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 650, clientY: 650 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 650, clientY: 650 });

    const call = onDiagramAction.mock.calls.find((c) => c[0].type === 'select');
    expect(call![0].selection).toEqual(
      expect.arrayContaining([
        { type: 'node', id: 'n1' },
        { type: 'node', id: 'n2' },
        { type: 'edge', id: 'e1' },
      ]),
    );
    expect(call![0].selection).toHaveLength(3);
  });

  it('Shift+marquee unions with the existing diagram selection', async () => {
    saveViewport(window.localStorage, 'diagrammarquee4', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 500, y: 500 }), diagramNode({ id: 'n2', x: 900, y: 500 })],
      edges: [],
      selection: [{ type: 'node', id: 'n2' }],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, fileId: 'diagrammarquee4' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 450, clientY: 450, shiftKey: true });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 700, clientY: 650, shiftKey: true });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 700, clientY: 650, shiftKey: true });

    const call = onDiagramAction.mock.calls.find((c) => c[0].type === 'select');
    expect(call![0].selection).toEqual(
      expect.arrayContaining([
        { type: 'node', id: 'n1' },
        { type: 'node', id: 'n2' },
      ]),
    );
    expect(call![0].selection).toHaveLength(2);
  });

  it('a plain click (no drag) on empty canvas does not dispatch a diagram marquee selection', async () => {
    saveViewport(window.localStorage, 'diagrammarquee5', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 500, y: 500 })],
      edges: [],
      selection: [],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, fileId: 'diagrammarquee5' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 450, clientY: 450 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 451, clientY: 450 });

    expect(onDiagramAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'select' }));
  });

  it('Escape cancels an in-progress marquee without dispatching a diagram selection', async () => {
    saveViewport(window.localStorage, 'diagrammarquee6', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 500, y: 500 })],
      edges: [],
      selection: [],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, fileId: 'diagrammarquee6' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 450, clientY: 450 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 700, clientY: 650 });
    expect(screen.getByTestId('marquee-selection')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('marquee-selection')).toBeNull();

    fireEvent.pointerUp(root, { pointerId: 1, clientX: 700, clientY: 650 });
    expect(onDiagramAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'select' }));
  });

  it('a drag starting on a diagram shape moves it instead of starting a marquee', async () => {
    saveViewport(window.localStorage, 'diagrammarquee7', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const onSetFrameSelection = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 500, y: 500 })],
      edges: [],
      selection: [{ type: 'node', id: 'n1' }],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, onSetFrameSelection, fileId: 'diagrammarquee7' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const shape = screen.getByTestId('diagram-node-n1');
    fireEvent.pointerDown(shape, { pointerId: 1, clientX: 520, clientY: 520 });
    fireEvent.pointerMove(shape, { pointerId: 1, clientX: 528, clientY: 520 });
    fireEvent.pointerUp(shape, { pointerId: 1, clientX: 528, clientY: 520 });

    expect(onDiagramAction).toHaveBeenCalledWith({ type: 'move', ids: ['n1'], dx: 8, dy: 0 });
    expect(onSetFrameSelection).not.toHaveBeenCalled();
    expect(screen.queryByTestId('marquee-selection')).toBeNull();
  });
});

// Review finding C: frames and the diagram are one selection model at a
// time, even under Shift - the same rule FrameTitle's own Shift+click
// handler already enforces unconditionally elsewhere in canvas.tsx
// (`Shift+click a frame title clears the diagram selection first`).
// Failing scenario from the review: select a diagram shape, then
// Shift+marquee an area with a frame but NO diagram elements - the
// diagram selection is unchanged (shift unions with nothing new) so it
// never transitions to empty, and workbench.tsx's own "one selection
// model" effect only fires on THAT transition, so both ended up non-empty
// at once.
describe('Canvas marquee keeps one selection model (Shift adds within it only)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Shift+marquee that touches only a frame clears an existing diagram selection', async () => {
    saveViewport(window.localStorage, 'onemodel1', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const onSetFrameSelection = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 900, y: 900 })], // far from SCREEN_1 and the drag box below
      edges: [],
      selection: [{ type: 'node', id: 'n1' }],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, onSetFrameSelection, fileId: 'onemodel1' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    // Entirely inside SCREEN_1 (0,0,400,300); nowhere near n1.
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 50, clientY: 50, shiftKey: true });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 350, clientY: 250, shiftKey: true });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 350, clientY: 250, shiftKey: true });

    expect(onSetFrameSelection).toHaveBeenCalledWith([SCREEN_1.id]);
    expect(onDiagramAction).toHaveBeenCalledWith({ type: 'select', selection: [] });
  });

  it('Shift+marquee that touches only diagram elements clears an existing frame selection', async () => {
    saveViewport(window.localStorage, 'onemodel2', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const onSetFrameSelection = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 900, y: 900, width: 40, height: 40 })],
      edges: [],
      selection: [],
      history: { past: [], future: [] },
    };
    renderCanvas({
      screens: [SCREEN_1],
      diagram,
      onDiagramAction,
      onSetFrameSelection,
      selectedFrameIds: new Set([SCREEN_1.id]),
      fileId: 'onemodel2',
    });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    // Around n1 (900,900,40,40); nowhere near SCREEN_1 (0,0,400,300).
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 850, clientY: 850, shiftKey: true });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 950, clientY: 950, shiftKey: true });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 950, clientY: 950, shiftKey: true });

    expect(onDiagramAction).toHaveBeenCalledWith({ type: 'select', selection: [{ type: 'node', id: 'n1' }] });
    expect(onSetFrameSelection).toHaveBeenCalledWith([]);
  });

  it('Shift+marquee that touches neither model is a true no-op, leaving an existing diagram selection untouched', async () => {
    saveViewport(window.localStorage, 'onemodel3', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const onSetFrameSelection = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 900, y: 900 })],
      edges: [],
      selection: [{ type: 'node', id: 'n1' }],
      history: { past: [], future: [] },
    };
    renderCanvas({ screens: [SCREEN_1], diagram, onDiagramAction, onSetFrameSelection, fileId: 'onemodel3' });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    // Nowhere near SCREEN_1 or n1.
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 1500, clientY: 1500, shiftKey: true });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 1700, clientY: 1700, shiftKey: true });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 1700, clientY: 1700, shiftKey: true });

    expect(onSetFrameSelection).not.toHaveBeenCalled();
    expect(onDiagramAction).not.toHaveBeenCalled();
  });

  it('a plain (non-Shift) marquee that touches neither model clears both', async () => {
    saveViewport(window.localStorage, 'onemodel4', 'page1', { x: 0, y: 0, zoom: 1 });
    const onDiagramAction = vi.fn();
    const onSetFrameSelection = vi.fn();
    const diagram: DiagramState = {
      nodes: [diagramNode({ id: 'n1', x: 900, y: 900 })],
      edges: [],
      selection: [{ type: 'node', id: 'n1' }],
      history: { past: [], future: [] },
    };
    renderCanvas({
      screens: [SCREEN_1],
      diagram,
      onDiagramAction,
      onSetFrameSelection,
      selectedFrameIds: new Set([SCREEN_1.id]),
      fileId: 'onemodel4',
    });
    await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));

    const root = screen.getByTestId('canvas-root');
    fireEvent.pointerDown(root, { pointerId: 1, clientX: 1500, clientY: 1500 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 1700, clientY: 1700 });
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 1700, clientY: 1700 });

    expect(onSetFrameSelection).toHaveBeenCalledWith([]);
    expect(onDiagramAction).toHaveBeenCalledWith({ type: 'select', selection: [] });
  });
});
