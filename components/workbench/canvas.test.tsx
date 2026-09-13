import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { toCanvasPoint, type Viewport } from '@/lib/canvas/viewport';
import { loadViewport, saveViewport } from '@/lib/canvas/viewport-store';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { DEFAULT_STAGE_COMMENTS } from './comments/comment-layer';
import { Canvas, CanvasViewportProvider, frameRect, useCanvasViewport, useCanvasViewportController } from './canvas';

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
  onDeselectDiagram,
  selectedFrameIds,
  onToggleFrameSelection,
  onSetFrameSelection,
  onClearFrameSelection,
  pixelGridVisible,
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
  onDeselectDiagram?: () => void;
  selectedFrameIds?: ReadonlySet<string>;
  onToggleFrameSelection?: (id: string) => void;
  onSetFrameSelection?: (ids: string[]) => void;
  onClearFrameSelection?: () => void;
  pixelGridVisible?: boolean;
}) {
  const { viewport, setViewport, viewportSize, rootRef, animateTo } = useCanvasViewportController({
    fileId,
    pageId,
    frames: screens.map(frameRect),
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
        onDeselectDiagram={onDeselectDiagram}
        selectedFrameIds={selectedFrameIds}
        onToggleFrameSelection={onToggleFrameSelection}
        onSetFrameSelection={onSetFrameSelection}
        onClearFrameSelection={onClearFrameSelection}
        pixelGridVisible={pixelGridVisible}
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
  onDeselectDiagram,
  selectedFrameIds,
  onToggleFrameSelection,
  onSetFrameSelection,
  onClearFrameSelection,
  pixelGridVisible,
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
  onDeselectDiagram?: () => void;
  selectedFrameIds?: ReadonlySet<string>;
  onToggleFrameSelection?: (id: string) => void;
  onSetFrameSelection?: (ids: string[]) => void;
  onClearFrameSelection?: () => void;
  pixelGridVisible?: boolean;
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
      onDeselectDiagram={onDeselectDiagram}
      selectedFrameIds={selectedFrameIds}
      onToggleFrameSelection={onToggleFrameSelection}
      onSetFrameSelection={onSetFrameSelection}
      onClearFrameSelection={onClearFrameSelection}
      pixelGridVisible={pixelGridVisible}
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
      const input = screen.getByRole('textbox', { name: 'Screen name' });
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
  });

  describe('multi-select of frames', () => {
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
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 51, clientY: 50 });

      expect(onClearFrameSelection).toHaveBeenCalledTimes(1);
      expect(onSetFrameSelection).not.toHaveBeenCalled();
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
    it('is visible at 100% zoom', () => {
      renderCanvas();
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toContain('radial-gradient');
    });

    it('fades out below 25% zoom', async () => {
      saveViewport(window.localStorage, 'zoomedout', 'page1', { x: 0, y: 0, zoom: 0.1 });
      renderCanvas({ fileId: 'zoomedout' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toBeFalsy();
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
