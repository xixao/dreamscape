import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Editor, ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import type { Viewport } from '@/lib/canvas/viewport';
import type { CommentThread } from '@/lib/comments/store';
import type { Screen } from '@/lib/files/repository';
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
    };
  }

  it('renders a read-only artboard sized to the screen, with no resize handles', async () => {
    renderInEditor(<FramePreview screen={SCREEN_1} onFocusScreen={vi.fn()} {...noPanProps()} />);
    expect(screen.getByTestId('artboard-preview')).toHaveStyle({ width: '1440px' });
    expect(screen.queryByRole('separator')).toBeNull();
    const body = await previewFrameBody();
    expect(within(body).getByText('This frame is empty')).toBeInTheDocument();
  });

  it('sizes to the screen\'s own stageHeight when set, else ARTBOARD_MIN_HEIGHT', () => {
    renderInEditor(
      <FramePreview screen={{ ...SCREEN_1, stageHeight: 900 }} onFocusScreen={vi.fn()} {...noPanProps()} />,
    );
    expect(screen.getByTestId('artboard-preview')).toHaveStyle({ height: '900px' });
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
});
