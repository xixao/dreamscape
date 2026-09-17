import { memo, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { frameRect } from '@/lib/canvas/viewport';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { DEFAULT_STAGE_COMMENTS } from './comments/comment-layer';

// A render-count probe for the fix in canvas.tsx/stage.tsx: FramePreview (and
// the focused frame host, Stage) must be memoized with stable props so that
// panning or zooming - which necessarily re-renders Canvas itself, to update
// the viewport transform - does not cascade into re-rendering every frame's
// own CanvasFrame (and so its Craft editor and its iframe) on every tick.
//
// This is its own file, separate from canvas.test.tsx, specifically so its
// vi.mock('./canvas-frame', ...) below - needed to count renders - cannot
// affect any of that file's ~30 other tests: Vitest gives each test file its
// own isolated module registry, so a mock here has zero reach outside it.
//
// The fake CanvasFrame renders nothing (a real one sets up a real iframe,
// style-sync MutationObservers, a ResizeObserver, etc. - all irrelevant to
// the one thing this file checks: how many times it gets called). It
// distinguishes a preview's call from the focused frame's the same way the
// real components already do it: FramePreview is the only caller that ever
// passes `reportDocument={false}` (canvas-frame.tsx's own doc comment on
// that prop explains why); Stage never does.
//
// Wrapped in memo() here too, exactly like the real CanvasFrame the fix
// wraps it in (canvas-frame.tsx) - a fake that skipped that wrapping would
// always be re-invoked by React on every parent re-render regardless of
// props (memo(), not the component itself, is what lets React skip calling
// it again for prop-equal renders), which would make this probe fail even
// when the real CanvasFrame is correctly configured, and pass even when it
// is not - the exact inversion of what it is meant to catch.
const canvasFrameRenderCount = vi.fn<(kind: 'preview' | 'focused') => void>();

vi.mock('./canvas-frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./canvas-frame')>();
  return {
    ...actual,
    CanvasFrame: memo(function FakeCanvasFrame(props: { reportDocument?: boolean; onCanvasDocument?: (canvas: { document: Document; window: Window } | null) => void }) {
      useEffect(() => { props.onCanvasDocument?.({ document, window }); return () => props.onCanvasDocument?.(null); }, [props.onCanvasDocument]);
      canvasFrameRenderCount(props.reportDocument === false ? 'preview' : 'focused');
      return null;
    }),
  };
});

const { Canvas, CanvasViewportProvider, useCanvasViewportController } = await import('./canvas');

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

// Module-level, never-changing no-ops - deliberately NOT written inline in
// Harness's own JSX below. Harness owns the viewport controller, so it
// re-renders on every one of this file's wheel-pan updates; an inline
// `() => {}` there would be a fresh closure every one of those renders,
// exactly the unstable-prop bug this whole file exists to catch, except
// self-inflicted by the test harness instead of the real component.
const NOOP_FOCUS = () => {};
const NOOP_RENAME = () => {};
const NOOP_MOVE = () => {};

// Mirrors canvas.test.tsx's own Harness: Canvas is a controlled component,
// so this plays the role WorkbenchShell does in the real app.
function Harness({ screens, focusedScreenId, fileId }: { screens: Screen[]; focusedScreenId: string; fileId: string }) {
  const { viewport, setViewport, viewportSize, rootRef, animateTo } = useCanvasViewportController({
    fileId,
    pageId: 'page1',
    frames: screens.map((screen) => frameRect(screen)),
  });
  return (
    <CanvasViewportProvider viewport={viewport} setViewport={setViewport} viewportSize={viewportSize} animateTo={animateTo}>
      <Canvas
        screens={screens}
        focusedScreenId={focusedScreenId}
        onFocusScreen={NOOP_FOCUS}
        onRenameScreen={NOOP_RENAME}
        onMoveScreen={NOOP_MOVE}
        comments={DEFAULT_STAGE_COMMENTS}
        rootRef={rootRef}
      />
    </CanvasViewportProvider>
  );
}

function countRenders(kind: 'preview' | 'focused'): number {
  return canvasFrameRenderCount.mock.calls.filter((call) => call[0] === kind).length;
}

describe('Canvas frame render counts across viewport updates', () => {
  beforeEach(() => {
    canvasFrameRenderCount.mockClear();
    localStorage.clear();
    // A non-zero size so panning/zooming below produces real, observable
    // viewport changes (fitAll's own default-viewport computation needs one
    // too) - same stub canvas.test.tsx's own beforeEach uses.
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

  it('does not re-render a non-focused preview\'s CanvasFrame across 20 viewport updates', () => {
    renderInEditor(<Harness screens={[SCREEN_1, SCREEN_2]} focusedScreenId={SCREEN_1.id} fileId="rendercount-preview" />);
    const before = countRenders('preview');
    expect(before).toBeGreaterThan(0);

    const root = screen.getByTestId('canvas-root');
    for (let i = 0; i < 20; i++) {
      fireEvent.wheel(root, { deltaX: 3, deltaY: 5 });
    }

    expect(countRenders('preview')).toBe(before);
  });

  it('does not re-render the focused frame\'s CanvasFrame across 20 viewport updates', () => {
    renderInEditor(<Harness screens={[SCREEN_1, SCREEN_2]} focusedScreenId={SCREEN_1.id} fileId="rendercount-focused" />);
    const before = countRenders('focused');
    expect(before).toBeGreaterThan(0);

    const root = screen.getByTestId('canvas-root');
    for (let i = 0; i < 20; i++) {
      fireEvent.wheel(root, { deltaX: 3, deltaY: 5 });
    }

    expect(countRenders('focused')).toBe(before);
  });
});
