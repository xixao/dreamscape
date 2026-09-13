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
import { canScrollInDirection, capturePointer, isElementLike } from '@/lib/dom';
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
 * Returns a function with a permanently stable identity that always calls
 * through to the LATEST `fn` passed in - the standard "useEvent" pattern
 * (the ref is synced by an effect after every render, and the returned
 * callback only ever reads it, never writes anything else) - for a plain
 * callback that must be handed to a memoized child (FramePreview below) as
 * a prop without defeating that memoization, but whose own implementation
 * is not itself safe to wrap directly in `useCallback`.
 *
 * That last part is the reason this exists rather than a plain
 * `useCallback` at each call site: `shouldStartPan`/`startFramePan`/
 * `moveFramePan`/`endFramePan` in Canvas below all read or write
 * `panRef.current`, deliberately kept as ordinary, freshly-defined-per-
 * render functions (matching every other pointer handler in this file).
 * Wrapping one of THEM directly in `useCallback` makes React Compiler's
 * static analysis treat `panRef` as reachable from a memoized value used
 * as an effect dependency, and it then flags every OTHER plain mutation of
 * that same ref (handleRootPointerDown, handleRootPointerMove) as unsafe.
 * This hook's own ref (`fnRef`) is private to each call site and never
 * touches `panRef` itself, so it carries none of that baggage - it only
 * ever forwards to whichever plain function is current.
 */
function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  return useCallback((...args: Args) => fnRef.current(...args), []);
}

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

  // The active pan gesture, if any: which pointer started it, the last
  // point seen IN SCREEN SPACE (event.screenX/screenY - anchored to the
  // physical display, so it stays correct even while the frame the pan
  // started in is itself moving on screen under a pointer that hasn't
  // moved, and stays consistent if the gesture later hands off from a
  // frame's document to the parent or vice versa - see applyPanDelta
  // below), whether the gesture started inside a frame (moveFramePan/
  // startFramePan below ignore events for a pan that did not start in a
  // frame, and vice versa - one gesture has exactly one owner for its whole
  // duration), and whether Space (rather than the middle mouse button) is
  // what started it - releasing Space only ends a pan it started itself
  // (see the keyup handler below).
  const panRef = useRef<{
    pointerId: number;
    lastScreenX: number;
    lastScreenY: number;
    inFrame: boolean;
    viaSpace: boolean;
  } | null>(null);
  const [panning, setPanning] = useState(false);

  // Every function below that touches panRef.current is a deliberately
  // plain, freshly-defined-per-render function (never useCallback) - see
  // useStableCallback's own doc comment above for why mixing that ref with
  // useCallback trips React Compiler's static analysis.
  function shouldStartPan(button: number): boolean {
    return spaceDown || button === MIDDLE_MOUSE_BUTTON;
  }

  // dx/dy are always a screen-space delta (event.screenX/screenY, diffed
  // against the pan's own last reading - see panRef's doc comment above),
  // which maps 1:1 onto the root canvas's own unscaled translation
  // regardless of which document produced it or how zoomed in the canvas
  // is. Unlike the old clientX/Y-based math this replaces, no zoom scaling
  // is needed here: that scaling existed only to correct for clientX/Y
  // being read inside a zoomed iframe's own internal coordinate space, a
  // problem screen space never has.
  function applyPanDelta(dx: number, dy: number): void {
    setViewport((current) => panBy(current, dx, dy));
  }

  function endPan(): void {
    panRef.current = null;
    setPanning(false);
  }

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

  // A pointerup can be lost entirely if the window loses focus mid-drag -
  // the user alt-tabs away, or a native dialog steals focus - which would
  // otherwise leave panRef stuck "active" forever and (per the one-owner
  // guards above) silently swallowing every pan gesture after it. A blur of
  // the top-level window catches this regardless of whether the gesture is
  // currently owned by the root or by some frame.
  useEffect(() => {
    function onBlur() {
      panRef.current = null;
      setPanning(false);
    }
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

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
    // One gesture has one owner: a pan already in progress - started here
    // or, per startFramePan below, inside some frame - keeps exclusive
    // control of panRef until it ends; a second pointer must never hijack
    // it out from under the first.
    if (panRef.current) return;
    capturePointer(event.currentTarget, event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      inFrame: false,
      viaSpace: event.button !== MIDDLE_MOUSE_BUTTON,
    };
    setPanning(true);
  }

  function handleRootPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    // No `inFrame` check here, deliberately: a pan that started inside a
    // frame (startFramePan below) is just as free to keep being driven from
    // this root handler once the pointer's physical position moves past the
    // frame's edge into the parent document - the screen-space delta below
    // is exactly as valid coming from here as from moveFramePan, so the
    // gesture keeps tracking the pointer with no jump at the handoff.
    applyPanDelta(event.screenX - pan.lastScreenX, event.screenY - pan.lastScreenY);
    pan.lastScreenX = event.screenX;
    pan.lastScreenY = event.screenY;
  }

  // Starts a pan gesture that began inside a frame's own document - the
  // focused frame (wired below) or, per the fix here, any non-focused
  // preview too (wired where FramePreview is rendered further down): a
  // frame document is a separate browsing context, so a plain click never
  // bubbles out to this component's own pointer handlers on canvas-root.
  function startFramePan(event: PointerEvent): void {
    if (!shouldStartPan(event.button)) return;
    event.preventDefault();
    // One gesture has one owner - see handleRootPointerDown's identical
    // guard above.
    if (panRef.current) return;
    // Captures on the pressed element itself (duck-typed via isElementLike,
    // since it lives in the frame's own realm) rather than some fixed
    // ancestor: keeps pointermove/pointerup arriving at this frame's own
    // document for the rest of the gesture even once the physical pointer
    // strays outside the frame's on-screen box - over the floating chrome,
    // say - the same reason handleRootPointerDown above captures on the
    // canvas root.
    if (isElementLike(event.target)) capturePointer(event.target, event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY,
      inFrame: true,
      viaSpace: event.button !== MIDDLE_MOUSE_BUTTON,
    };
    setPanning(true);
  }

  function moveFramePan(event: PointerEvent): void {
    const pan = panRef.current;
    // `!pan.inFrame` matters here, unlike handleRootPointerMove above: a
    // pan owned by the root (not started in any frame) must never be
    // touched by a frame's own move handler, even if a stray event for the
    // same pointerId reaches it (see "a pan started on the root ignores
    // frame events for its duration").
    if (!pan || pan.pointerId !== event.pointerId || !pan.inFrame) return;
    applyPanDelta(event.screenX - pan.lastScreenX, event.screenY - pan.lastScreenY);
    pan.lastScreenX = event.screenX;
    pan.lastScreenY = event.screenY;
  }

  function endFramePan(event: PointerEvent): void {
    if (panRef.current?.pointerId === event.pointerId) endPan();
  }

  // The wheel bridge shared by every frame document, focused or previewed
  // (spec docs/superpowers/specs/2026-09-12-infinite-canvas-design.md
  // section 3 describes pan/zoom as general canvas interactions, not carved
  // out for whichever frame happens to be focused - two-finger scroll and
  // pinch must work anywhere over the canvas). `frameWindow` is the specific
  // iframe's own window - not derived from `event` itself, since nothing
  // about a wheel event's own target identifies which on-screen iframe box
  // to measure for the pointer-to-window conversion below - so each caller
  // (the focused-frame effect further down, and FramePreview through
  // stableFrameWheel) passes its own.
  function frameWheel(event: WheelEvent, frameWindow: Window): void {
    const iframeElement = frameWindow.frameElement as HTMLElement | null;
    const iframeRect = iframeElement?.getBoundingClientRect();
    const zoom = viewportRef.current.zoom;
    const point = iframeRect
      ? { x: iframeRect.left + event.clientX * zoom, y: iframeRect.top + event.clientY * zoom }
      : { x: event.clientX, y: event.clientY };
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      setViewport((current) => zoomAround(current, point, factor));
      return;
    }
    // Scroll-first rule (lib/dom.ts's canScrollInDirection): a frame that
    // can still scroll its own content in this gesture's direction keeps
    // that native scroll instead of panning the canvas - the same rule for
    // a preview as for the focused frame.
    if (canScrollInDirection(event.target, event.deltaX, event.deltaY)) return;
    event.preventDefault();
    setViewport((current) => panBy(current, -event.deltaX, -event.deltaY));
  }

  // Stable (permanently-unchanging-identity) versions of the five functions
  // above that FramePreview needs as props - there can be many of them, one
  // per non-focused screen, and this component re-renders on every pan/zoom
  // tick to update the viewport transform. See useStableCallback's own doc
  // comment (top of file) for why this indirection exists instead of
  // useCallback directly on shouldStartPan/startFramePan/moveFramePan/
  // endFramePan/frameWheel themselves.
  const stableShouldStartPan = useStableCallback(shouldStartPan);
  const stableStartFramePan = useStableCallback(startFramePan);
  const stableMoveFramePan = useStableCallback(moveFramePan);
  const stableEndFramePan = useStableCallback(endFramePan);
  const stableFrameWheel = useStableCallback(frameWheel);

  // The focused frame's own iframe is a separate document: neither the root
  // pointer handlers above nor a plain wheel listener on the root element
  // ever see an event that originates inside it. Space+drag and wheel pan/
  // zoom are mirrored onto that one document so panning and zooming also
  // work while the pointer is over the frame actually being edited, not
  // only over the empty canvas around it. Every non-focused preview gets
  // the same wiring too - both the pan callbacks and frameWheel above, via
  // stableFrameWheel - directly against its own frame document (wired where
  // FramePreview is rendered further down): a non-focused preview otherwise
  // only focuses itself on a press, per FramePreview, and pressing while
  // Space is down must pan instead, not steal focus; a wheel/pinch over it
  // must scroll or pan/zoom the canvas the same as over the focused frame
  // or the empty canvas around it, not do nothing.
  useEffect(() => {
    const frameWindow = focusedCanvasDocument?.window;
    const frameDocument = focusedCanvasDocument?.document;
    if (!frameWindow || !frameDocument) return;

    // Thin wrapper so this effect can pass ITS OWN frame's window through to
    // the shared frameWheel above, while still holding a single stable
    // function reference to add and later remove the listener with. TS
    // narrowing of frameWindow above does not persist into a nested function
    // declaration, hence the assertion.
    function onWheel(event: WheelEvent) {
      stableFrameWheel(event, frameWindow!);
    }

    frameDocument.addEventListener('pointerdown', stableStartFramePan);
    frameWindow.addEventListener('pointermove', stableMoveFramePan);
    frameWindow.addEventListener('pointerup', stableEndFramePan);
    frameWindow.addEventListener('pointercancel', stableEndFramePan);
    // Attached to the document, not the window (also true for every
    // preview's identical wiring in FramePreview) - so a gesture is only
    // ever handled once: `wheel` bubbles from the target up through the
    // document to the window, and registering the same handler on both
    // would fire it twice per event.
    frameDocument.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      frameDocument.removeEventListener('pointerdown', stableStartFramePan);
      frameWindow.removeEventListener('pointermove', stableMoveFramePan);
      frameWindow.removeEventListener('pointerup', stableEndFramePan);
      frameWindow.removeEventListener('pointercancel', stableEndFramePan);
      frameDocument.removeEventListener('wheel', onWheel);
    };
    // stableFrameWheel is listed below even though it is stable, matching
    // stableStartFramePan/stableMoveFramePan/stableEndFramePan above - see
    // useStableCallback's own doc comment (top of file) for why.
  }, [focusedCanvasDocument, stableStartFramePan, stableMoveFramePan, stableEndFramePan, stableFrameWheel]);

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
                <FramePreview
                  screen={screen}
                  // onFocusScreen is the prop this component itself
                  // received, passed straight through: already stable
                  // across a pure viewport re-render (it comes from
                  // WorkbenchShell/Workbench, neither of which re-renders
                  // just because THIS component's viewport context does),
                  // so no per-screen wrapping is needed here - FramePreview
                  // calls it with its own screen.id itself.
                  onFocusScreen={onFocusScreen}
                  shouldStartPan={stableShouldStartPan}
                  onPanPointerDown={stableStartFramePan}
                  onPanPointerMove={stableMoveFramePan}
                  onPanPointerUp={stableEndFramePan}
                  onFrameWheel={stableFrameWheel}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
