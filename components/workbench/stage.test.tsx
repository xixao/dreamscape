import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Editor, ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import type { Viewport } from '@/lib/canvas/viewport';
import type { CommentThread } from '@/lib/comments/store';
import type { Screen } from '@/lib/files/repository';
import { OVERLAY_MIN_HEIGHT, createOverlayScreen } from '@/lib/files/screens';
import { renderInEditor } from '@/test/craft-harness';
import { DEFAULT_STAGE_COMMENTS } from './comments/comment-layer';
import { FramePreview, Stage } from './stage';
import { StageProvider, useStage } from './stage-context';

const IDENTITY_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

const SCREEN_1: Screen = { id: 's1', name: 'Frame 1', layout: emptyLayoutJson(), stageWidth: 1440 };

// Craft's <Frame> content renders inside the CanvasFrame iframe now, a
// separate document `screen` (bound to the outer document) cannot see into -
// find it here instead. Waits for the iframe and its body to exist (both are
// synchronous once React has committed, per canvas-frame.test.tsx, but this
// stays robust if that ever changes).
async function frameBody(): Promise<HTMLElement> {
  return waitFor(() => {
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error('canvas frame body not ready');
    return body;
  });
}

function makeThread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: 't1',
    fileId: 'f1',
    x: 100,
    y: 50,
    author: 'Matt',
    text: 'hi',
    createdAt: '2026-09-12T00:00:00.000Z',
    replies: [],
    ...overrides,
  };
}

// Sets a device (and its fixed height) on mount, through the real context -
// there is no prop on Stage itself for this, it always reads useStage().
function DeviceSetter({ children }: { children: ReactNode }) {
  const { setDevice } = useStage();
  useEffect(() => {
    setDevice({ name: 'iPhone 16 & 17 Pro', width: 402, height: 874 });
  }, [setDevice]);
  return <>{children}</>;
}

// Sets the viewport's zoom directly through context, the same way
// components/workbench/canvas.tsx keeps useStage().zoom in sync with the
// canvas viewport in the real app - Stage itself no longer computes a zoom.
function ZoomSetter({ zoom }: { zoom: number }) {
  const { setZoom } = useStage();
  useEffect(() => {
    setZoom(zoom);
  }, [zoom, setZoom]);
  return null;
}

// Exposes width/height/deviceName/zoom from context for assertions, the same
// pattern stage-context.test.tsx's own Probe uses.
function StageProbe() {
  const { width, height, deviceName, zoom } = useStage();
  return (
    <div>
      <output data-testid="probe-width">{width}</output>
      <output data-testid="probe-height">{height ?? 'auto'}</output>
      <output data-testid="probe-device">{deviceName ?? 'none'}</output>
      <output data-testid="probe-zoom">{zoom}</output>
    </div>
  );
}

describe('Stage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the artboard at the stage width, in an iframe whose body is theme-basic', async () => {
    renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />, { width: 768 });
    const artboard = screen.getByTestId('artboard');
    expect(artboard).toHaveStyle({ width: '768px' });

    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    expect(iframe).toHaveStyle({ width: '768px' });
    // The ancestor canvas layer applies the visual zoom now - CanvasFrame's
    // own transform is always a no-op scale(1) from inside Stage.
    expect(iframe.style.transform).toBe('scale(1)');
    const body = await frameBody();
    expect(body.className).toBe('theme-basic');
    expect(within(body).getByText('This frame is empty')).toBeInTheDocument();
  });

  describe('overlay frame chrome (spec docs/superpowers/specs/2026-09-13-overlay-frames-design.md section 5)', () => {
    it('keeps a plain screen\'s unconditional square-cornered, full-border chrome', () => {
      renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />);
      const artboard = screen.getByTestId('artboard');
      expect(artboard).toHaveClass('border', 'border-line-strong', 'shadow-panel-lg');
      expect(artboard).not.toHaveClass('rounded-lg');
    });

    it('gives a dialog overlay a full border, shadow and 8px radius (rounded-lg)', () => {
      const dialog = createOverlayScreen({ type: 'dialog', id: 'o1', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<Stage screen={dialog} viewport={IDENTITY_VIEWPORT} />);
      expect(screen.getByTestId('artboard')).toHaveClass('border', 'border-line-strong', 'shadow-panel-lg', 'rounded-lg');
    });

    it('gives a toast overlay the same full border, shadow and radius as a dialog', () => {
      const toast = createOverlayScreen({ type: 'toast', id: 'o2', name: 'Saved', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<Stage screen={toast} viewport={IDENTITY_VIEWPORT} />);
      expect(screen.getByTestId('artboard')).toHaveClass('border', 'shadow-panel-lg', 'rounded-lg');
    });

    // "1 px border on the attached side only" (spec) mirrors the real
    // shadcn Sheet primitive (components/ui/sheet.tsx), whose real seam is
    // on the side OPPOSITE the one named by `side` - a right sheet's own
    // `data-[side=right]:border-l`, since its right edge is flush with the
    // browser edge it slides from and never shows a seam there. Matching
    // that (rather than a literal border on the named side) is what makes
    // this chrome actually match Play, the chrome's own stated goal.
    it('gives a right sheet a border on its left (opposite Play\'s attached edge) and no radius', () => {
      const sheet = createOverlayScreen({ type: 'sheet', side: 'right', id: 'o3', name: 'Filters', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<Stage screen={sheet} viewport={IDENTITY_VIEWPORT} />);
      const artboard = screen.getByTestId('artboard');
      expect(artboard).toHaveClass('border-l', 'border-line-strong', 'shadow-panel-lg');
      expect(artboard).not.toHaveClass('rounded-lg', 'border-r', 'border-t', 'border-b');
      expect(artboard.className.split(' ')).not.toContain('border');
    });

    it('gives a left sheet a border on its right instead', () => {
      const sheet = createOverlayScreen({ type: 'sheet', side: 'left', id: 'o4', name: 'Nav', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<Stage screen={sheet} viewport={IDENTITY_VIEWPORT} />);
      const artboard = screen.getByTestId('artboard');
      expect(artboard).toHaveClass('border-r');
      expect(artboard).not.toHaveClass('border-l', 'rounded-lg');
    });

    it('gives a top sheet a bottom border, and a bottom sheet a top border', () => {
      const top = createOverlayScreen({ type: 'sheet', side: 'top', id: 'o5', name: 'Top', pageId: 'p1', x: 0, y: 0 });
      const { unmount } = renderInEditor(<Stage screen={top} viewport={IDENTITY_VIEWPORT} />);
      expect(screen.getByTestId('artboard')).toHaveClass('border-b');
      unmount();

      const bottom = createOverlayScreen({ type: 'sheet', side: 'bottom', id: 'o6', name: 'Bottom', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<Stage screen={bottom} viewport={IDENTITY_VIEWPORT} />);
      expect(screen.getByTestId('artboard')).toHaveClass('border-t');
    });

    it('uses OVERLAY_MIN_HEIGHT, not ARTBOARD_MIN_HEIGHT, as an overlay\'s initial auto height', async () => {
      const dialog = createOverlayScreen({ type: 'dialog', id: 'o7', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });
      const onMeasuredHeight = vi.fn();
      renderInEditor(<Stage screen={dialog} viewport={IDENTITY_VIEWPORT} onMeasuredHeight={onMeasuredHeight} />);
      await frameBody();
      await waitFor(() => expect(onMeasuredHeight).toHaveBeenCalledWith(dialog.id, OVERLAY_MIN_HEIGHT));
      expect(OVERLAY_MIN_HEIGHT).toBeLessThan(ARTBOARD_MIN_HEIGHT);
    });
  });

  // Diagram-mode click-to-select (spec docs/superpowers/specs/2026-09-13-
  // overlay-frames-design.md section 5): while the Diagram palette is
  // open, a press on the focused frame's own body selects it into the
  // canvas-level frame selection instead of reaching Craft's live content.
  describe('diagramFrameSelect', () => {
    it('renders a cover over the artboard and calls onSelect(false) on a plain press', async () => {
      const onSelect = vi.fn();
      renderInEditor(
        <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} diagramFrameSelect={{ active: true, onSelect }} />,
      );
      const cover = screen.getByTestId('diagram-frame-cover');
      fireEvent.pointerDown(cover, { shiftKey: false });
      expect(onSelect).toHaveBeenCalledWith(false);
    });

    it('calls onSelect(true) on a Shift+press', async () => {
      const onSelect = vi.fn();
      renderInEditor(
        <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} diagramFrameSelect={{ active: true, onSelect }} />,
      );
      fireEvent.pointerDown(screen.getByTestId('diagram-frame-cover'), { shiftKey: true });
      expect(onSelect).toHaveBeenCalledWith(true);
    });

    it('renders no cover when diagramFrameSelect is absent or inactive', () => {
      const { rerenderUi } = renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />);
      expect(screen.queryByTestId('diagram-frame-cover')).toBeNull();

      rerenderUi(
        <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} diagramFrameSelect={{ active: false, onSelect: vi.fn() }} />,
      );
      expect(screen.queryByTestId('diagram-frame-cover')).toBeNull();
    });
  });

  // Review fix wave item 8: relays this frame's real, current height up to
  // canvas.tsx's measuredHeights map, so an auto-height frame's actual
  // content height (not just ARTBOARD_MIN_HEIGHT) reaches snapping, the
  // frame alignment row, distribute and the marquee's hit test.
  describe('onMeasuredHeight (review fix wave item 8)', () => {
    it('reports the initial (unmeasured) height for an auto-height screen', async () => {
      const onMeasuredHeight = vi.fn();
      renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} onMeasuredHeight={onMeasuredHeight} />);
      await frameBody();
      await waitFor(() => expect(onMeasuredHeight).toHaveBeenCalledWith(SCREEN_1.id, ARTBOARD_MIN_HEIGHT));
    });

    it('reports the fixed height instead, once a device sets one (same fixed-height source as the artboard itself)', async () => {
      // Stage's own fixed height comes from useStage() (a device, or the
      // height resize handle), NOT from screen.stageHeight directly - only
      // FramePreview reads that straight off the screen, via its own
      // per-preview StageProvider (see the FramePreview describe block
      // below). DeviceSetter is the same helper "gives the frame a fixed
      // height once a device sets one" (above) already uses.
      const onMeasuredHeight = vi.fn();
      renderInEditor(
        <DeviceSetter>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} onMeasuredHeight={onMeasuredHeight} />
        </DeviceSetter>,
      );
      await frameBody();
      await waitFor(() => expect(onMeasuredHeight).toHaveBeenCalledWith(SCREEN_1.id, 874));
    });
  });

  it('renders the layout grid overlay inside the iframe when the screen has one visible', async () => {
    const withGrid: Screen = { ...SCREEN_1, layoutGrid: { columns: 6, gutter: 16, margin: 24, visible: true } };
    renderInEditor(<Stage screen={withGrid} viewport={IDENTITY_VIEWPORT} />);
    const body = await frameBody();
    const overlay = within(body).getByTestId('layout-grid');
    expect(overlay.children).toHaveLength(6);
  });

  it('renders no layout grid overlay when the screen has none (defaults to hidden)', async () => {
    renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />);
    const body = await frameBody();
    expect(within(body).queryByTestId('layout-grid')).toBeNull();
  });

  it('sizes the artboard in plain unscaled px regardless of the current zoom (the ancestor canvas layer scales it)', () => {
    renderInEditor(
      <>
        <ZoomSetter zoom={0.5} />
        <Stage screen={SCREEN_1} viewport={{ x: 0, y: 0, zoom: 0.5 }} />
      </>,
      { width: 1000 },
    );
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1000px' });
  });

  it('gives the frame a fixed height once a device sets one, and returns to auto when the width handle clears it', async () => {
    renderInEditor(
      <DeviceSetter>
        <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
        <StageProbe />
      </DeviceSetter>,
    );
    await waitFor(() => expect(screen.getByTestId('probe-height')).toHaveTextContent('874'));
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => expect(iframe).toHaveStyle({ width: '402px', height: '874px' }));

    const widthHandle = screen.getByRole('separator', { name: 'Resize width' });
    fireEvent.pointerDown(widthHandle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(widthHandle, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(widthHandle, { clientX: 50, pointerId: 1 });

    expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
    expect(screen.getByTestId('probe-height')).toHaveTextContent('auto');
    await waitFor(() => expect(iframe).toHaveStyle({ height: `${ARTBOARD_MIN_HEIGHT}px` }));
  });

  describe('resize handles', () => {
    it('renders three handles with the right aria roles, orientation and values', async () => {
      renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />, { width: 1000 });
      const width = screen.getByRole('separator', { name: 'Resize width' });
      const height = screen.getByRole('separator', { name: 'Resize height' });
      const corner = screen.getByRole('separator', { name: 'Resize frame' });

      expect(width).toHaveAttribute('aria-orientation', 'vertical');
      expect(width).toHaveAttribute('aria-valuenow', '1000');
      expect(width).toHaveAttribute('aria-valuemin', '120');
      expect(width).toHaveAttribute('aria-valuemax', '3840');

      expect(height).toHaveAttribute('aria-orientation', 'horizontal');
      expect(height).toHaveAttribute('aria-valuenow', String(ARTBOARD_MIN_HEIGHT));
      expect(height).toHaveAttribute('aria-valuemin', '120');
      expect(height).toHaveAttribute('aria-valuemax', '8192');

      expect(corner).toHaveAttribute('aria-valuenow', '1000');
    });

    it('dragging the width handle changes width, dividing the pointer delta by the current viewport zoom, and clears the device', async () => {
      renderInEditor(
        <DeviceSetter>
          <ZoomSetter zoom={0.5} />
          <Stage screen={SCREEN_1} viewport={{ x: 0, y: 0, zoom: 0.5 }} />
          <StageProbe />
        </DeviceSetter>,
        { width: 1000 },
      );
      await waitFor(() => expect(screen.getByTestId('probe-device')).toHaveTextContent('iPhone 16 & 17 Pro'));
      await waitFor(() => expect(screen.getByTestId('probe-zoom')).toHaveTextContent('0.5'));

      const handle = screen.getByRole('separator', { name: 'Resize width' });
      fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
      // 402 + 200/0.5 = 802.
      expect(screen.getByTestId('probe-width')).toHaveTextContent('802');
      expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
      fireEvent.pointerUp(handle, { clientX: 300, pointerId: 1 });
    });

    it('dragging the corner handle changes both width and height together', async () => {
      renderInEditor(
        <>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = screen.getByRole('separator', { name: 'Resize frame' });

      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 40, clientY: 24, pointerId: 1 });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1040');
      expect(screen.getByTestId('probe-height')).toHaveTextContent(String(ARTBOARD_MIN_HEIGHT + 24));
      fireEvent.pointerUp(handle, { clientX: 40, clientY: 24, pointerId: 1 });
    });

    it('dragging the height handle sets a fixed height without touching width or the device', async () => {
      renderInEditor(
        <DeviceSetter>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </DeviceSetter>,
        { width: 1000 },
      );
      await waitFor(() => expect(screen.getByTestId('probe-height')).toHaveTextContent('874'));

      const handle = screen.getByRole('separator', { name: 'Resize height' });
      fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 30, pointerId: 1 });
      expect(screen.getByTestId('probe-height')).toHaveTextContent('904');
      expect(screen.getByTestId('probe-width')).toHaveTextContent('402');
      expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
      fireEvent.pointerUp(handle, { clientY: 30, pointerId: 1 });
    });

    it('double-clicking the height handle returns the height to auto', async () => {
      renderInEditor(
        <DeviceSetter>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </DeviceSetter>,
        { width: 1000 },
      );
      await waitFor(() => expect(screen.getByTestId('probe-height')).toHaveTextContent('874'));

      fireEvent.doubleClick(screen.getByRole('separator', { name: 'Resize height' }));
      expect(screen.getByTestId('probe-height')).toHaveTextContent('auto');
      expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
    });

    it('steps the width by 8 px with the arrow keys', async () => {
      renderInEditor(
        <>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = screen.getByRole('separator', { name: 'Resize width' });
      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1008');
      fireEvent.keyDown(handle, { key: 'ArrowLeft' });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1000');
    });

    it('stops an arrow key from bubbling past the handle, so it does not ALSO fire a window-level shortcut (e.g. a diagram nudge)', async () => {
      renderInEditor(
        <>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = screen.getByRole('separator', { name: 'Resize width' });
      const onWindowKeyDown = vi.fn();
      window.addEventListener('keydown', onWindowKeyDown);
      try {
        fireEvent.keyDown(handle, { key: 'ArrowRight' });
        expect(screen.getByTestId('probe-width')).toHaveTextContent('1008');
        expect(onWindowKeyDown).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('keydown', onWindowKeyDown);
      }
    });

    it('steps the height by 8 px with the arrow keys, starting from the measured auto height', async () => {
      renderInEditor(
        <>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = screen.getByRole('separator', { name: 'Resize height' });
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(screen.getByTestId('probe-height')).toHaveTextContent(String(ARTBOARD_MIN_HEIGHT + 8));
    });

    it('steps both axes on the corner handle depending on which arrow key is pressed', async () => {
      renderInEditor(
        <>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = screen.getByRole('separator', { name: 'Resize frame' });
      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1008');
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(screen.getByTestId('probe-height')).toHaveTextContent(String(ARTBOARD_MIN_HEIGHT + 8));
    });

    it('ends the drag on pointer cancel, so a later move does not resize', async () => {
      renderInEditor(
        <>
          <Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = screen.getByRole('separator', { name: 'Resize width' });
      fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
      expect(handle.firstElementChild).toHaveClass('bg-acc');
      fireEvent.pointerCancel(handle, { clientX: 100, pointerId: 1 });
      expect(handle.firstElementChild).toHaveClass('bg-border');
      fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1000');
    });

    it('shows a live width x height readout while dragging', async () => {
      renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />, { width: 1000 });
      const handle = screen.getByRole('separator', { name: 'Resize width' });
      expect(screen.queryByTestId('resize-readout')).toBeNull();
      fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
      expect(screen.getByTestId('resize-readout')).toHaveTextContent(`1000 × ${ARTBOARD_MIN_HEIGHT}`);
      fireEvent.pointerMove(handle, { clientX: 40, pointerId: 1 });
      expect(screen.getByTestId('resize-readout')).toHaveTextContent(`1040 × ${ARTBOARD_MIN_HEIGHT}`);
      fireEvent.pointerUp(handle, { clientX: 40, pointerId: 1 });
      expect(screen.queryByTestId('resize-readout')).toBeNull();
    });

    it('keeps the selection when a handle is pressed', async () => {
      const { editor } = renderInEditor(<Stage screen={SCREEN_1} viewport={IDENTITY_VIEWPORT} />);
      await frameBody();
      editor().actions.selectNode(ROOT_NODE);
      await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));
      fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize width' }), {
        clientX: 0,
        pointerId: 1,
      });
      expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true);
    });
  });

  it('re-measures the comment layer\'s artboard rect when the viewport pans or zooms', async () => {
    const rectA = {
      left: 0,
      top: 0,
      width: 1440,
      height: 800,
      right: 1440,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    const rectB = {
      left: 200,
      top: 100,
      width: 1440,
      height: 800,
      right: 1640,
      bottom: 900,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect;
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectA);

    // renderInEditor's own `rerender` would replace its whole Editor/
    // StageProvider wrapper (RTL's rerender re-renders whatever element it is
    // given at the SAME root), so this test wraps Stage directly instead, to
    // rerender just the `viewport` prop while keeping the same providers
    // mounted underneath.
    function Harness({ viewport }: { viewport: Viewport }) {
      return (
        <Editor resolver={resolver} enabled>
          <StageProvider>
            <Stage
              screen={SCREEN_1}
              viewport={viewport}
              comments={{ ...DEFAULT_STAGE_COMMENTS, threads: [makeThread({ x: 0, y: 0 })] }}
            />
          </StageProvider>
        </Editor>
      );
    }

    const { rerender } = render(<Harness viewport={IDENTITY_VIEWPORT} />);

    const pin = await screen.findByRole('button', { name: 'Comment 1' });
    await waitFor(() => expect(pin).toHaveStyle({ left: '0px' }));

    rectSpy.mockReturnValue(rectB);
    // A pan changes viewport.x/y with no window resize/scroll event of its
    // own (an ancestor CSS transform fires neither) - Stage must still
    // re-measure from the `viewport` prop alone.
    rerender(<Harness viewport={{ x: 200, y: 100, zoom: 1 }} />);

    await waitFor(() => expect(pin).toHaveStyle({ left: '200px' }));
    rectSpy.mockRestore();
  });
});

describe('FramePreview', () => {
  async function previewFrameBody(): Promise<HTMLElement> {
    return waitFor(() => {
      const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
      const body = iframe.contentDocument?.body;
      if (!body) throw new Error('canvas frame body not ready');
      return body;
    });
  }

  // The pan props canvas.tsx always supplies in the real app - a plain
  // `() => false` shouldStartPan (so a press always falls through to
  // onFocusScreen, matching every test below that is not specifically about
  // panning) plus spy no-ops for the rest, overridable per test.
  function noPanProps() {
    return {
      shouldStartPan: () => false,
      onPanPointerDown: vi.fn(),
      onPanPointerMove: vi.fn(),
      onPanPointerUp: vi.fn(),
      onFrameWheel: vi.fn(),
    };
  }

  it('renders a read-only artboard sized to the screen, with no resize handles', async () => {
    renderInEditor(<FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} />);
    expect(screen.getByTestId('artboard-preview')).toHaveStyle({ width: '1440px' });
    expect(screen.queryByRole('separator')).toBeNull();
    const body = await previewFrameBody();
    expect(within(body).getByText('This frame is empty')).toBeInTheDocument();
  });

  describe('overlay frame chrome (spec docs/superpowers/specs/2026-09-13-overlay-frames-design.md section 5)', () => {
    it('keeps a plain screen\'s unconditional square-cornered, full-border chrome', () => {
      renderInEditor(<FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} />);
      const artboard = screen.getByTestId('artboard-preview');
      expect(artboard).toHaveClass('border', 'border-line-strong', 'shadow-panel-lg');
      expect(artboard).not.toHaveClass('rounded-lg');
    });

    it('gives a dialog overlay a full border, shadow and 8px radius (rounded-lg)', () => {
      const dialog = createOverlayScreen({ type: 'dialog', id: 'o1', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<FramePreview screen={dialog} onFocusScreen={vi.fn()} {...noPanProps()} />);
      expect(screen.getByTestId('artboard-preview')).toHaveClass('border', 'shadow-panel-lg', 'rounded-lg');
    });

    it('gives a toast overlay the same treatment as a dialog', () => {
      const toast = createOverlayScreen({ type: 'toast', id: 'o2', name: 'Saved', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<FramePreview screen={toast} onFocusScreen={vi.fn()} {...noPanProps()} />);
      expect(screen.getByTestId('artboard-preview')).toHaveClass('border', 'shadow-panel-lg', 'rounded-lg');
    });

    it('gives a right sheet a left border only (matching Play\'s own shadcn Sheet), and no radius', () => {
      const sheet = createOverlayScreen({ type: 'sheet', side: 'right', id: 'o3', name: 'Filters', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<FramePreview screen={sheet} onFocusScreen={vi.fn()} {...noPanProps()} />);
      const artboard = screen.getByTestId('artboard-preview');
      expect(artboard).toHaveClass('border-l');
      expect(artboard).not.toHaveClass('rounded-lg', 'border-r');
      expect(artboard.className.split(' ')).not.toContain('border');
    });

    it('gives a left sheet a right border instead', () => {
      const sheet = createOverlayScreen({ type: 'sheet', side: 'left', id: 'o4', name: 'Nav', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<FramePreview screen={sheet} onFocusScreen={vi.fn()} {...noPanProps()} />);
      expect(screen.getByTestId('artboard-preview')).toHaveClass('border-r');
    });

    it('uses OVERLAY_MIN_HEIGHT, not ARTBOARD_MIN_HEIGHT, as an overlay\'s initial auto height', () => {
      const dialog = createOverlayScreen({ type: 'dialog', id: 'o5', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });
      renderInEditor(<FramePreview screen={dialog} onFocusScreen={vi.fn()} {...noPanProps()} />);
      expect(screen.getByTestId('artboard-preview')).toHaveStyle({ height: `${OVERLAY_MIN_HEIGHT}px` });
    });
  });

  describe('diagramFrameSelect', () => {
    it('calls onSelect instead of onFocusScreen on a plain press when active', () => {
      const onFocusScreen = vi.fn();
      const onSelect = vi.fn();
      renderInEditor(
        <FramePreview
          screen={SCREEN_1}
          onFocusScreen={onFocusScreen}
          {...noPanProps()}
          diagramFrameSelect={{ active: true, onSelect }}
        />,
      );
      fireEvent.pointerDown(screen.getByTestId('artboard-preview'), { shiftKey: false });
      expect(onSelect).toHaveBeenCalledWith(false);
      expect(onFocusScreen).not.toHaveBeenCalled();
    });

    it('calls onSelect(true) on a Shift+press', () => {
      const onSelect = vi.fn();
      renderInEditor(
        <FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} diagramFrameSelect={{ active: true, onSelect }} />,
      );
      fireEvent.pointerDown(screen.getByTestId('artboard-preview'), { shiftKey: true });
      expect(onSelect).toHaveBeenCalledWith(true);
    });

    it('still calls onFocusScreen when diagramFrameSelect is absent or inactive', () => {
      const onFocusScreen = vi.fn();
      renderInEditor(
        <FramePreview
          screen={SCREEN_1}
          onFocusScreen={onFocusScreen}
          {...noPanProps()}
          diagramFrameSelect={{ active: false, onSelect: vi.fn() }}
        />,
      );
      fireEvent.pointerDown(screen.getByTestId('artboard-preview'));
      expect(onFocusScreen).toHaveBeenCalledWith(SCREEN_1.id);
    });
  });

  it('also renders the layout grid overlay when the screen has one visible', async () => {
    const withGrid: Screen = { ...SCREEN_1, layoutGrid: { columns: 4, gutter: 8, margin: 16, visible: true } };
    renderInEditor(<FramePreview screen={withGrid} onFocusScreen={vi.fn()} {...noPanProps()} />);
    const body = await previewFrameBody();
    expect(within(body).getByTestId('layout-grid').children).toHaveLength(4);
  });

  it('sizes to the screen\'s own stageHeight when set, else ARTBOARD_MIN_HEIGHT', () => {
    renderInEditor(
      <FramePreview screen={{ ...SCREEN_1, stageHeight: 900 }} onFocusScreen={vi.fn()} {...noPanProps()} />,
    );
    expect(screen.getByTestId('artboard-preview')).toHaveStyle({ height: '900px' });
  });

  // Review fix wave item 8: a non-focused, auto-height frame had no
  // content-height tracking of its own at all before this - its wrapper's
  // own height was always the static ARTBOARD_MIN_HEIGHT, and nothing
  // reached canvas.tsx's measuredHeights map for it.
  describe('onMeasuredHeight (review fix wave item 8)', () => {
    it('reports the initial (unmeasured) height for an auto-height screen', async () => {
      const onMeasuredHeight = vi.fn();
      renderInEditor(
        <FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} onMeasuredHeight={onMeasuredHeight} />,
      );
      await previewFrameBody();
      await waitFor(() => expect(onMeasuredHeight).toHaveBeenCalledWith(SCREEN_1.id, ARTBOARD_MIN_HEIGHT));
    });

    it('reports the fixed stageHeight instead, for a screen with one', async () => {
      const fixedHeightScreen: Screen = { ...SCREEN_1, stageHeight: 900 };
      const onMeasuredHeight = vi.fn();
      renderInEditor(
        <FramePreview screen={fixedHeightScreen} onFocusScreen={vi.fn()} {...noPanProps()} onMeasuredHeight={onMeasuredHeight} />,
      );
      await previewFrameBody();
      await waitFor(() => expect(onMeasuredHeight).toHaveBeenCalledWith(fixedHeightScreen.id, 900));
    });
  });

  it('does not report into the shared StageContext canvasDocument slot (that stays scoped to the focused frame)', async () => {
    function Probe() {
      const { canvasDocument } = useStage();
      return <output data-testid="probe">{canvasDocument ? 'set' : 'none'}</output>;
    }
    renderInEditor(
      <>
        <FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} />
        <Probe />
      </>,
    );
    await previewFrameBody();
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('calls onFocusScreen with the screen id when the wrapper is pressed', () => {
    const onFocusScreen = vi.fn();
    renderInEditor(<FramePreview screen={SCREEN_1} onFocusScreen={onFocusScreen} {...noPanProps()} />);
    fireEvent.pointerDown(screen.getByTestId('artboard-preview'));
    expect(onFocusScreen).toHaveBeenCalledExactlyOnceWith(SCREEN_1.id);
  });

  it('calls onFocusScreen with the screen id when a press lands inside the frame\'s own iframe document', async () => {
    const onFocusScreen = vi.fn();
    renderInEditor(<FramePreview screen={SCREEN_1} onFocusScreen={onFocusScreen} {...noPanProps()} />);
    const body = await previewFrameBody();
    fireEvent.pointerDown(body);
    expect(onFocusScreen).toHaveBeenCalledExactlyOnceWith(SCREEN_1.id);
  });

  describe('Space + drag (or middle mouse) pans instead of focusing', () => {
    it('calls onPanPointerDown instead of onFocusScreen when shouldStartPan is true', async () => {
      const onFocusScreen = vi.fn();
      const onPanPointerDown = vi.fn();
      renderInEditor(
        <FramePreview
          screen={SCREEN_1}
          onFocusScreen={onFocusScreen}
          {...noPanProps()}
          shouldStartPan={() => true}
          onPanPointerDown={onPanPointerDown}
        />,
      );
      const body = await previewFrameBody();

      fireEvent.pointerDown(body, { pointerId: 7, clientX: 10, clientY: 20 });

      expect(onPanPointerDown).toHaveBeenCalledTimes(1);
      expect(onFocusScreen).not.toHaveBeenCalled();
    });

    it('forwards pointermove and pointerup from the frame document unconditionally', async () => {
      const onPanPointerMove = vi.fn();
      const onPanPointerUp = vi.fn();
      renderInEditor(
        <FramePreview
          screen={SCREEN_1}
          onFocusScreen={vi.fn()}
          {...noPanProps()}
          onPanPointerMove={onPanPointerMove}
          onPanPointerUp={onPanPointerUp}
        />,
      );
      const body = await previewFrameBody();

      fireEvent.pointerMove(body, { pointerId: 7, clientX: 15, clientY: 25 });
      fireEvent.pointerUp(body, { pointerId: 7, clientX: 15, clientY: 25 });

      expect(onPanPointerMove).toHaveBeenCalledTimes(1);
      expect(onPanPointerUp).toHaveBeenCalledTimes(1);
    });
  });

  describe('wheel bridge (same as the focused frame gets)', () => {
    it('forwards a wheel event from the frame document to onFrameWheel, with this preview\'s own window', async () => {
      const onFrameWheel = vi.fn();
      renderInEditor(
        <FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} onFrameWheel={onFrameWheel} />,
      );
      const body = await previewFrameBody();
      const frameWindow = body.ownerDocument.defaultView;

      fireEvent.wheel(body, { deltaY: 20 });

      expect(onFrameWheel).toHaveBeenCalledTimes(1);
      const [event, passedWindow] = onFrameWheel.mock.calls[0];
      expect((event as WheelEvent).deltaY).toBe(20);
      expect(passedWindow).toBe(frameWindow);
    });

    it('removes its listeners, including the wheel bridge, when the preview unmounts', async () => {
      const { unmount } = renderInEditor(
        <FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} />,
      );
      const body = await previewFrameBody();
      const frameDoc = body.ownerDocument;
      const removeSpy = vi.spyOn(frameDoc, 'removeEventListener');

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
    });
  });
});
