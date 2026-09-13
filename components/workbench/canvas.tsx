'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useEditor } from '@craftjs/core';
import type { Screen } from '@/lib/files/repository';
import { fitAll, panBy, zoomAround, type FrameRect, type Size, type Viewport } from '@/lib/canvas/viewport';
import { loadViewport, saveViewport } from '@/lib/canvas/viewport-store';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { useCanvasDocument } from './canvas-frame';
import type { StageCommentsProps } from './comments/comment-layer';
import { FrameTitle } from './frame-title';
import { isEditableTarget } from './keyboard';
import { FramePreview, Stage } from './stage';
import { useStage } from './stage-context';

export type ViewportSize = Size;

interface CanvasViewportContextValue {
  viewport: Viewport;
  setViewport: (update: Viewport | ((current: Viewport) => Viewport)) => void;
  viewportSize: ViewportSize;
  // Eases the viewport to `target` over `durationMs` (spec: clicking a
  // screens tab animates to fit that frame, 200ms ease-out) - cancelled the
  // instant anything calls the plain setViewport above instead (any pan or
  // zoom input), per the spec's "cancelled by any pan/zoom input".
  animateTo: (target: Viewport, durationMs: number) => void;
}

const CanvasViewportContext = createContext<CanvasViewportContextValue | null>(null);

/**
 * Exposes the canvas's `{ viewport, setViewport, viewportSize }` to anything
 * that needs to convert canvas-space coordinates to window coordinates, or
 * change the viewport, without measuring the DOM itself - the top bar's zoom
 * menu, keyboard shortcuts, frame titles, the layer stack menu, and any
 * future overlay (spec docs/superpowers/specs/2026-09-12-infinite-canvas-
 * design.md section 5). `useCanvasViewportController` below is the one real
 * owner of this state; WorkbenchShell calls it once and wraps this provider
 * around Canvas and every sibling that needs the same context, so all of
 * them share one instance rather than each computing their own.
 */
export function CanvasViewportProvider({
  viewport,
  setViewport,
  viewportSize,
  animateTo,
  children,
}: CanvasViewportContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ viewport, setViewport, viewportSize, animateTo }),
    [viewport, setViewport, viewportSize, animateTo],
  );
  return <CanvasViewportContext.Provider value={value}>{children}</CanvasViewportContext.Provider>;
}

export function useCanvasViewport(): CanvasViewportContextValue {
  const context = useContext(CanvasViewportContext);
  if (!context) throw new Error('useCanvasViewport must be used inside CanvasViewportProvider');
  return context;
}

export function frameRect(screen: Screen): FrameRect {
  return {
    x: screen.x ?? 0,
    y: screen.y ?? 0,
    width: screen.stageWidth,
    // The real height of an auto-height frame is not known until it
    // renders and measures its own content - ARTBOARD_MIN_HEIGHT is the
    // same starting estimate the artboard itself uses, good enough for
    // "roughly fit everything," which is all a default viewport needs to be.
    height: screen.stageHeight ?? ARTBOARD_MIN_HEIGHT,
  };
}

/**
 * Owns the canvas viewport's state: per-file localStorage persistence
 * (lib/canvas/viewport-store.ts), measuring the canvas's own on-screen size
 * (`rootRef` - the caller attaches it to whatever element fills the window),
 * and the one-time "fit every frame" default for a file with nothing saved
 * yet (spec: "default: fit all frames"). Called once, by WorkbenchShell -
 * not by Canvas itself - so the same viewport/setViewport/viewportSize can
 * be shared, through CanvasViewportProvider, with everything that needs it:
 * Canvas, the top bar's zoom menu, keyboard shortcuts and the layer stack
 * menu alike.
 */
// Clicking a screens tab animates to fit that frame over this long, eased
// out (spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
// section 5's "200 ms ease-out").
const TAB_FOCUS_ANIMATION_MS = 200;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function useCanvasViewportController({
  fileId,
  frames,
}: {
  fileId: string;
  frames: readonly FrameRect[];
}): {
  viewport: Viewport;
  setViewport: (update: Viewport | ((current: Viewport) => Viewport)) => void;
  viewportSize: ViewportSize;
  rootRef: RefObject<HTMLDivElement | null>;
  animateTo: (target: Viewport, durationMs?: number) => void;
} {
  const rootRef = useRef<HTMLDivElement>(null);
  // Frames change constantly (a resize, a rename, a new screen) but the
  // default-viewport computation below must only ever run once, the first
  // time this canvas learns its own on-screen size - re-running it on every
  // frames change would silently reset a pan/zoom the user has already set.
  // A ref sidesteps that without needing frames as an effect dependency.
  // Synced through an effect, never written during render (refs are for
  // event handlers and effects, not render - see the measurement effect
  // below for why an effect here still races correctly against it).
  const framesRef = useRef(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  const [initialViewport] = useState(() => loadViewport(window.localStorage, fileId));
  const [viewport, setViewportState] = useState<Viewport>(initialViewport ?? { x: 0, y: 0, zoom: 1 });
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const hasFitRef = useRef(initialViewport !== null);
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // The in-flight tab-focus animation, if any - a plain mutable token
  // (rather than state) since cancelling it must never itself trigger a
  // render; `cancelled` is read by the animation's own rAF loop (animateTo,
  // below) and set by the public setViewport (any direct pan/zoom input
  // cancels whatever animation is running - spec: "cancelled by any pan/
  // zoom input").
  const animationRef = useRef<{ cancelled: boolean } | null>(null);

  const setViewport = useCallback((update: Viewport | ((current: Viewport) => Viewport)) => {
    if (animationRef.current) animationRef.current.cancelled = true;
    setViewportState(update);
  }, []);

  const animateTo = useCallback((target: Viewport, durationMs: number = TAB_FOCUS_ANIMATION_MS) => {
    const token = { cancelled: false };
    animationRef.current = token;
    const from = viewportRef.current;
    let startTime: number | null = null;
    function tick(timestamp: number) {
      if (token.cancelled) return;
      if (startTime === null) startTime = timestamp;
      const t = durationMs <= 0 ? 1 : Math.min(1, (timestamp - startTime) / durationMs);
      const eased = easeOutCubic(t);
      // The internal setter, deliberately not the public setViewport above:
      // the animation's own frames must never cancel themselves.
      setViewportState({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        zoom: from.zoom + (target.zoom - from.zoom) * eased,
      });
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
      }
    }
    requestAnimationFrame(tick);
  }, []);

  // Measures the root's own size once (and on every resize); the very first
  // measurement also supplies the default viewport (fit every frame) when
  // nothing was saved for this file yet.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function update() {
      const rect = root!.getBoundingClientRect();
      const size = { width: rect.width, height: rect.height };
      setViewportSize(size);
      // A zero-size measurement is not real information to fit anything
      // against (fitAll would zoom all the way to MIN_ZOOM trying to cram
      // every frame into a 0x0 box) - it means the canvas has not actually
      // been laid out yet (a real browser lays out an `absolute inset-0`
      // element before any script can observe it, so in practice this only
      // ever happens in a test environment with no real layout engine).
      // Left at the plain `{ x: 0, y: 0, zoom: 1 }` default until a genuine
      // size comes in, same as the pre-infinite-canvas Stage's own
      // computeZoom, which returned 1 outright for the same "nothing to
      // measure yet" case.
      if (!hasFitRef.current && size.width > 0 && size.height > 0) {
        hasFitRef.current = true;
        setViewportState(fitAll(framesRef.current, size));
      }
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Persists on every change, keyed per file (lib/canvas/viewport-store.ts).
  useEffect(() => {
    saveViewport(window.localStorage, fileId, viewport);
  }, [fileId, viewport]);

  return { viewport, setViewport, viewportSize, rootRef, animateTo };
}

// The dot grid fades out below this zoom (spec section 3) - dots that close
// together are visual noise, not a useful reference, once zoomed out this far.
const GRID_FADE_ZOOM = 0.25;
const GRID_SPACING = 8;

function dotGridStyle(viewport: Viewport): CSSProperties {
  if (viewport.zoom < GRID_FADE_ZOOM) return {};
  const spacing = GRID_SPACING * viewport.zoom;
  return {
    backgroundImage: 'radial-gradient(circle, var(--line-soft) 1px, transparent 0)',
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };
}

const MIDDLE_MOUSE_BUTTON = 1;
// Wheel-to-zoom sensitivity: exp() keeps repeated small deltaY ticks
// (trackpad pinch, mostly) composing multiplicatively rather than linearly,
// which is what keeps the point under the pointer exactly fixed regardless
// of how many ticks a single gesture is split into.
const WHEEL_ZOOM_SENSITIVITY = 0.01;

/**
 * The infinite canvas (spec docs/superpowers/specs/2026-09-12-infinite-
 * canvas-design.md): a full-window pannable, zoomable surface with every
 * screen of the file rendered as an absolutely positioned frame inside one
 * transformed layer. The focused screen hosts the real, interactive Stage
 * (Craft's live editing session, the resize handles, comments); every other
 * screen is a read-only FramePreview that focuses itself on the first press
 * inside it. A controlled component: the viewport itself is owned by
 * useCanvasViewportController above (called once, by WorkbenchShell) and
 * read here through useCanvasViewport(), not computed locally - the same
 * context the top bar's zoom menu, keyboard shortcuts and the layer stack
 * menu all share.
 */
export function Canvas({
  screens,
  focusedScreenId,
  onFocusScreen,
  onRenameScreen,
  onMoveScreen,
  comments,
  rootRef,
}: {
  screens: Screen[];
  focusedScreenId: string;
  onFocusScreen: (id: string) => void;
  onRenameScreen: (id: string, name: string) => void;
  onMoveScreen: (id: string, position: { x: number; y: number }) => void;
  comments: StageCommentsProps;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const { actions } = useEditor();
  const setStageZoom = useStage().setZoom;
  const focusedCanvasDocument = useCanvasDocument();
  const { viewport, setViewport } = useCanvasViewport();
  // Read from event handlers and listener callbacks only (applyPanDelta,
  // onFrameWheel) - never during render, so synced through an effect rather
  // than assigned directly in the render body.
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Keeps the focused Stage's own resize-handle math and the comment layer's
  // zoom-based positioning (both read useStage().zoom, unchanged from before
  // the infinite canvas) in sync with the viewport that now actually owns
  // zoom.
  useEffect(() => {
    setStageZoom(viewport.zoom);
  }, [viewport.zoom, setStageZoom]);

  // Space-to-pan key tracking, on the parent window and the focused frame's
  // own window (a keydown inside that iframe never reaches the parent - see
  // keyboard.tsx's identical reasoning). Not attached to every non-focused
  // preview's iframe: those are disabled/read-only and pressing into one
  // focuses it first (see FramePreview), which is the more natural way to
  // start panning from over a frame that was not already focused.
  const [spaceDown, setSpaceDown] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space' && !isEditableTarget(event.target)) setSpaceDown(true);
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      setSpaceDown(false);
      // Releasing Space ends the pan immediately (spec section 3), same as
      // releasing the pointer - but only for a pan Space itself started; a
      // middle-mouse pan keeps going regardless of Space's state.
      if (panRef.current?.viaSpace) endPan();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    focusedCanvasDocument?.window.addEventListener('keydown', onKeyDown);
    focusedCanvasDocument?.window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      focusedCanvasDocument?.window.removeEventListener('keydown', onKeyDown);
      focusedCanvasDocument?.window.removeEventListener('keyup', onKeyUp);
    };
  }, [focusedCanvasDocument]);

  // The active pan gesture, if any: which pointer started it, the last
  // point seen (in whichever document the gesture started - a drag never
  // crosses from one document to another), whether that document is the
  // focused iframe (whose local px must be scaled by the current zoom to get
  // a parent-space delta - see onFramePointerMove below), and whether Space
  // (rather than the middle mouse button) is what started it - releasing
  // Space only ends a pan it started itself (see the keyup handler above).
  const panRef = useRef<{ pointerId: number; lastX: number; lastY: number; inFrame: boolean; viaSpace: boolean } | null>(
    null,
  );
  const [panning, setPanning] = useState(false);

  function shouldStartPan(button: number): boolean {
    return spaceDown || button === MIDDLE_MOUSE_BUTTON;
  }

  function applyPanDelta(dxLocal: number, dyLocal: number, inFrame: boolean): void {
    const scale = inFrame ? viewportRef.current.zoom : 1;
    setViewport((current) => panBy(current, dxLocal * scale, dyLocal * scale));
  }

  function handleRootPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!shouldStartPan(event.button)) {
      // Clicking empty canvas (not a frame, not while starting a pan)
      // deselects and keeps the focused frame (spec section 3) - a press
      // on a frame itself is handled by that frame's own Stage/FramePreview,
      // both descendants of this element, so by the time a plain click
      // reaches all the way out here nothing under the pointer claimed it.
      if (event.target === event.currentTarget) actions.selectNode();
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      inFrame: false,
      viaSpace: event.button !== MIDDLE_MOUSE_BUTTON,
    };
    setPanning(true);
  }

  function handleRootPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    applyPanDelta(event.clientX - pan.lastX, event.clientY - pan.lastY, pan.inFrame);
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
  }

  function endPan(): void {
    panRef.current = null;
    setPanning(false);
  }

  // The focused frame's own iframe is a separate document: neither the root
  // pointer handlers above nor a plain wheel listener on the root element
  // ever see an event that originates inside it. Space+drag and wheel pan/
  // zoom are mirrored onto that one document so panning and zooming also
  // work while the pointer is over the frame actually being edited, not
  // only over the empty canvas around it - every non-focused preview is
  // read-only and, per FramePreview, focuses itself (and so gains this same
  // wiring) on the very first press inside it.
  useEffect(() => {
    const frameWindow = focusedCanvasDocument?.window;
    const frameDocument = focusedCanvasDocument?.document;
    if (!frameWindow || !frameDocument) return;

    function onFramePointerDown(event: PointerEvent) {
      if (!shouldStartPan(event.button)) return;
      event.preventDefault();
      panRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        inFrame: true,
        viaSpace: event.button !== MIDDLE_MOUSE_BUTTON,
      };
      setPanning(true);
    }
    function onFramePointerMove(event: PointerEvent) {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId || !pan.inFrame) return;
      applyPanDelta(event.clientX - pan.lastX, event.clientY - pan.lastY, true);
      pan.lastX = event.clientX;
      pan.lastY = event.clientY;
    }
    function onFramePointerUp(event: PointerEvent) {
      if (panRef.current?.pointerId === event.pointerId) endPan();
    }
    function onFrameWheel(event: WheelEvent) {
      event.preventDefault();
      // Guarded above (this effect returns early when frameWindow is
      // undefined) - TS narrowing does not persist into a nested function
      // declaration, hence the assertion.
      const iframeElement = frameWindow!.frameElement as HTMLElement | null;
      const iframeRect = iframeElement?.getBoundingClientRect();
      const zoom = viewportRef.current.zoom;
      const point = iframeRect
        ? { x: iframeRect.left + event.clientX * zoom, y: iframeRect.top + event.clientY * zoom }
        : { x: event.clientX, y: event.clientY };
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
        setViewport((current) => zoomAround(current, point, factor));
      } else {
        setViewport((current) => panBy(current, -event.deltaX, -event.deltaY));
      }
    }

    frameDocument.addEventListener('pointerdown', onFramePointerDown);
    frameWindow.addEventListener('pointermove', onFramePointerMove);
    frameWindow.addEventListener('pointerup', onFramePointerUp);
    frameWindow.addEventListener('pointercancel', onFramePointerUp);
    frameDocument.addEventListener('wheel', onFrameWheel, { passive: false });
    return () => {
      frameDocument.removeEventListener('pointerdown', onFramePointerDown);
      frameWindow.removeEventListener('pointermove', onFramePointerMove);
      frameWindow.removeEventListener('pointerup', onFramePointerUp);
      frameWindow.removeEventListener('pointercancel', onFramePointerUp);
      frameDocument.removeEventListener('wheel', onFrameWheel);
    };
    // spaceDown is read through shouldStartPan's closure - re-subscribing
    // whenever it changes keeps that check current without needing a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedCanvasDocument, spaceDown]);

  // The root's own wheel handling: a non-passive listener (React's onWheel
  // is passive by default in modern browsers, which would make
  // preventDefault a no-op) so plain wheel/two-finger-scroll pans and
  // Cmd/Ctrl+wheel zooms around the pointer without ever scrolling or
  // zooming the actual page.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = root!.getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
        setViewport((current) => zoomAround(current, point, factor));
      } else {
        setViewport((current) => panBy(current, -event.deltaX, -event.deltaY));
      }
    }
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [rootRef, setViewport]);

  return (
    <div
      ref={rootRef}
      data-testid="canvas-root"
      className={cn(
        'absolute inset-0 overflow-hidden bg-canvas',
        spaceDown && !panning && 'cursor-grab',
        panning && 'cursor-grabbing',
      )}
      style={dotGridStyle(viewport)}
      onPointerDown={handleRootPointerDown}
      onPointerMove={handleRootPointerMove}
      onPointerUp={(event) => {
        if (panRef.current?.pointerId === event.pointerId) endPan();
      }}
      onPointerCancel={(event) => {
        if (panRef.current?.pointerId === event.pointerId) endPan();
      }}
    >
      <div
        data-testid="canvas-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {screens.map((screen) => {
          const focused = screen.id === focusedScreenId;
          return (
            <div
              key={screen.id}
              data-frame
              data-testid={`frame-${screen.id}`}
              style={{ position: 'absolute', left: screen.x ?? 0, top: screen.y ?? 0 }}
            >
              <FrameTitle
                screen={screen}
                focused={focused}
                zoom={viewport.zoom}
                onRename={(name) => onRenameScreen(screen.id, name)}
                onMove={(position) => onMoveScreen(screen.id, position)}
              />
              {focused ? (
                <Stage screen={screen} viewport={viewport} comments={comments} />
              ) : (
                <FramePreview screen={screen} onFocus={() => onFocusScreen(screen.id)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
