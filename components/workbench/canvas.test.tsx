import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { loadViewport, saveViewport } from '@/lib/canvas/viewport-store';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { DEFAULT_STAGE_COMMENTS } from './comments/comment-layer';
import { Canvas, CanvasViewportProvider, useCanvasViewport } from './canvas';

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

function renderCanvas({
  screens = [SCREEN_1],
  focusedScreenId = SCREEN_1.id,
  onFocusScreen = vi.fn(),
  fileId = 'file1',
  overlays,
}: {
  screens?: Screen[];
  focusedScreenId?: string;
  onFocusScreen?: (id: string) => void;
  fileId?: string;
  overlays?: ReactNode;
} = {}) {
  return renderInEditor(
    <Canvas
      fileId={fileId}
      screens={screens}
      focusedScreenId={focusedScreenId}
      onFocusScreen={onFocusScreen}
      comments={DEFAULT_STAGE_COMMENTS}
      overlays={overlays}
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
        <CanvasViewportProvider viewport={{ x: 1, y: 2, zoom: 1 }} setViewport={() => {}} viewportSize={{ width: 300, height: 200 }}>
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
        const stored = loadViewport(window.localStorage, 'newfile');
        expect(stored).not.toBeNull();
      });
    });

    it('restores a previously saved viewport for this file instead of fitting all', async () => {
      saveViewport(window.localStorage, 'restoredfile', { x: 42, y: 24, zoom: 2 });
      renderCanvas({ fileId: 'restoredfile' });
      // Restored, not overwritten with a freshly computed fit-all - saving
      // again immediately should read back the same values.
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      expect(loadViewport(window.localStorage, 'restoredfile')).toEqual({ x: 42, y: 24, zoom: 2 });
    });

    it('keeps different files\' viewports independent', async () => {
      saveViewport(window.localStorage, 'fileA', { x: 5, y: 5, zoom: 1 });
      renderCanvas({ fileId: 'fileB' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      expect(loadViewport(window.localStorage, 'fileA')).toEqual({ x: 5, y: 5, zoom: 1 });
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
      return renderCanvas({ ...overrides, overlays: <Readout /> });
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
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
      expect(root).toHaveClass('cursor-grabbing');
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 150, clientY: 130 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 150, clientY: 130 });

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

      fireEvent.pointerDown(root, { pointerId: 1, clientX: 100, clientY: 100, button: 1 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 160, clientY: 120 });
      fireEvent.pointerUp(root, { pointerId: 1, clientX: 160, clientY: 120 });

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
  });

  describe('the dot grid', () => {
    it('is visible at 100% zoom', () => {
      renderCanvas();
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toContain('radial-gradient');
    });

    it('fades out below 25% zoom', async () => {
      saveViewport(window.localStorage, 'zoomedout', { x: 0, y: 0, zoom: 0.1 });
      renderCanvas({ fileId: 'zoomedout' });
      await waitFor(() => expect(screen.getAllByTestId('canvas-frame')).toHaveLength(1));
      const root = screen.getByTestId('canvas-root');
      expect(root.style.backgroundImage).toBeFalsy();
    });
  });
});
