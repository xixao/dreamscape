'use client';

import { useAppearance } from './appearance-context';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEventHandler } from '@craftjs/core';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { invalidateDropCache, type CraftEventHandlerLike } from '@/lib/craft-positioner';
import { type CanvasDocument, useStage } from './stage-context';

// Preserve loaded sheets when menus inject/remove their temporary styles.
// Replacing every link briefly strips the canvas of its layout styles.
const SYNC_MARKER = 'data-canvas-sync';

function createStylesheetSync(iframeDoc: Document): () => void {
  const copies = new Map<Element, Element>();
  return () => {
    const sources = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'));
    const current = new Set(sources);
    for (const [source, clone] of copies) {
      if (!current.has(source)) { clone.remove(); copies.delete(source); }
    }
    let cursor: ChildNode | null = iframeDoc.head.querySelector(`[${SYNC_MARKER}]`);
    for (const source of sources) {
      let clone = copies.get(source);
      if (!clone) {
        clone = source.cloneNode(true) as Element;
        clone.setAttribute(SYNC_MARKER, '');
        copies.set(source, clone);
      } else {
        for (const attribute of Array.from(clone.attributes)) {
          if (attribute.name !== SYNC_MARKER && !source.hasAttribute(attribute.name)) clone.removeAttribute(attribute.name);
        }
        for (const attribute of Array.from(source.attributes)) {
          if (clone.getAttribute(attribute.name) !== attribute.value) clone.setAttribute(attribute.name, attribute.value);
        }
        if (clone.textContent !== source.textContent) clone.textContent = source.textContent;
      }
      // Retain cascade order without detaching unchanged, loaded links.
      if (clone !== cursor) iframeDoc.head.insertBefore(clone, cursor);
      cursor = clone.nextSibling;
    }
  };
}

/**
 * `CanvasFrame({ width, height, zoom, title, children })` gives the artboard
 * its own document (spec docs/superpowers/specs/2026-09-12-responsive-canvas-
 * design.md #2): an `<iframe>` sized to the frame's real, unscaled pixel size
 * and visually scaled with a CSS transform, so every media query inside it
 * measures the frame's own width/height rather than the app window's.
 * `children` (Craft's `<Frame>` tree) portals into the iframe body once its
 * document is ready; `useCanvasDocument()` below is how overlays and hooks
 * that also need to reach into that document (selection outlines, the
 * layer-stack menu, keyboard shortcuts) get at it.
 *
 * Wrapped in memo() below (as CanvasFrameImpl here): the infinite canvas
 * (canvas.tsx) re-renders its host - Stage for the focused frame, or
 * FramePreview for a non-focused one - on every pan/zoom tick in Stage's
 * case (FramePreview stays fully memoized and so never even re-renders for
 * one at all - see the comment there). Memoizing this component too is
 * what actually stops that from reaching the iframe and the portaled Craft
 * tree inside it: every prop passed to it, from both callers, is already
 * stable across a pure viewport change (Stage memoizes its own `children`
 * via useMemo for exactly this).
 */
function CanvasFrameImpl({
  width,
  height,
  zoom,
  title = 'Frame',
  appearance,
  minHeight = ARTBOARD_MIN_HEIGHT,
  reportDocument = true,
  onCanvasDocument,
  onContentHeightChange,
  children,
}: {
  width: number;
  height: number | null;
  zoom: number;
  title?: string;
  appearance?: 'light' | 'dark';
  // The floor `autoHeight` never measures below, for a `height: null`
  // (auto) frame - defaults to the whole-screen ARTBOARD_MIN_HEIGHT, every
  // caller's own floor before this prop existed. stage.tsx passes an
  // overlay frame's own, smaller OVERLAY_MIN_HEIGHT instead (spec docs/
  // superpowers/specs/2026-09-13-overlay-frames-design.md section 2: "the
  // artboard minimum height for an overlay is OVERLAY_MIN_HEIGHT, not the
  // screen minimum") - read once, at this component's own mount (see the
  // effect below), same as every other value the resize-observer closure
  // captures once and for this instance's whole life.
  minHeight?: number;
  // Whether this instance publishes its document/window into the shared
  // StageContext (useStage().canvasDocument / useCanvasDocument()) - true by
  // default, matching every use of CanvasFrame before the infinite canvas.
  // The infinite canvas (canvas.tsx) mounts one CanvasFrame per screen at
  // once, but that shared slot is read by consumers scoped to a single,
  // FOCUSED frame (useWorkbenchKeyboard, useLayerStack, NodeIndicator) - a
  // non-focused read-only preview passes false so it never contends for it
  // (whichever instance last called setStageCanvasDocument would otherwise
  // silently win, regardless of which frame a user actually meant).
  reportDocument?: boolean;
  // This instance's own document/window, independent of reportDocument -
  // how a caller that does NOT report into the shared slot (a preview) still
  // gets at its own iframe's document, e.g. to attach a click-to-focus
  // listener scoped to just that frame.
  onCanvasDocument?: (canvasDocument: CanvasDocument | null) => void;
  // The applied (unscaled) iframe height, whenever it changes - whether set
  // directly by the `height` prop or, when `height` is null, measured from
  // the content. stage.tsx uses this to reserve the right amount of space
  // for the zoomed wrapper around this component and to seed a height/corner
  // handle drag with a real starting value even when the frame has never had
  // a manual height.
  onContentHeightChange?: (height: number) => void;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileAppearance = useAppearance().appearance;
  const effectiveAppearance = appearance ?? fileAppearance;
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocument | null>(null);
  useEffect(() => { if (canvasDoc) { canvasDoc.document.body.dataset.appearance = effectiveAppearance; canvasDoc.document.body.style.colorScheme = effectiveAppearance; } }, [canvasDoc, effectiveAppearance]);
  const [autoHeight, setAutoHeight] = useState(minHeight);
  const setStageCanvasDocument = useStage().setCanvasDocument;

  // Craft's live event-handler instance (see lib/craft-positioner.ts for
  // why this - not useEditor()'s `store` - is what actually owns the
  // Positioner), mirrored into a ref so the mount-once iframe effect below
  // can always read the current value without depending on it: that effect
  // sets up the iframe's document exactly once, and re-running it on every
  // handler identity change would tear down and recreate the whole
  // style-sync/resize/scroll-bridge setup for no reason. `null` outside of
  // a Craft `<Editor>` (e.g. in a test that renders CanvasFrame alone).
  //
  // Cast through `unknown`: `useEventHandler()` is typed to return the
  // generic `CoreEventHandlers<{}>` base class, which has no `positioner`
  // of its own - that field only exists on `DefaultEventHandlers`, the
  // concrete class Craft actually instantiates by default (and what this
  // app uses - see workbench.tsx's unconfigured `<Editor>`). Narrowing to
  // the loose, all-optional `CraftEventHandlerLike` shape here, rather than
  // to `DefaultEventHandlers` itself, is deliberate: it's what keeps
  // invalidateDropCache's own optional-chaining meaningful (and testable
  // with a plain fake object) if a future Craft version swaps in some
  // other handlers class.
  const eventHandler = useEventHandler() as unknown as CraftEventHandlerLike;
  const eventHandlerRef = useRef(eventHandler);
  useEffect(() => {
    eventHandlerRef.current = eventHandler;
  }, [eventHandler]);

  // Published up through StageContext too (see the type's own comment in
  // stage-context.tsx): useLayerStack and useWorkbenchKeyboard need it and
  // are not descendants of this component's own children. Gated on
  // reportDocument (see its own comment above) - a non-reporting instance
  // still calls onCanvasDocument, just never touches the shared slot.
  useEffect(() => {
    if (reportDocument) setStageCanvasDocument(canvasDoc);
    onCanvasDocument?.(canvasDoc);
    return () => {
      if (reportDocument) setStageCanvasDocument(null);
      onCanvasDocument?.(null);
    };
  }, [canvasDoc, reportDocument, setStageCanvasDocument, onCanvasDocument]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let stopStyleSync: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let stopFrameBridge: (() => void) | undefined;
    // Keyed on the document INSTANCE, not a boolean: WebKit can replace an
    // iframe's initial about:blank document with a fresh one after this
    // effect already latched onto the first one synchronously, and the
    // `load` event below is the only signal that ever happens - a boolean
    // latch would make that later `load` a permanent no-op, leaving the
    // portal rendering into the discarded document forever (a blank
    // canvas). Every teardown below is scoped per-document so re-preparing
    // a genuinely new document never leaves the previous one's observers
    // running against it.
    let preparedDoc: Document | null = null;

    function teardown() {
      stopStyleSync?.();
      stopStyleSync = undefined;
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      stopFrameBridge?.();
      stopFrameBridge = undefined;
    }

    function prepare() {
      const iframeDoc = iframe!.contentDocument;
      const iframeWin = iframe!.contentWindow;
      if (!iframeDoc || !iframeWin || !iframeDoc.body) return;
      // Idempotent: `load` can fire for the same document this effect
      // already prepared (jsdom's synchronous path below, or a browser
      // that fires `load` more than once) - redoing the setup below for a
      // document already wired up would just recreate the same observers.
      if (iframeDoc === preparedDoc) return;
      teardown();
      preparedDoc = iframeDoc;

      // The next/font variable classes (and any other class) the parent
      // html carries - this iframe is a separate document, so nothing about
      // the parent cascades into it on its own.
      iframeDoc.documentElement.className = document.documentElement.className;

      iframeDoc.body.className = 'theme-basic';
      iframeDoc.body.style.margin = '0';
      iframeDoc.body.style.colorScheme = 'light';

      const syncStylesheets = createStylesheetSync(iframeDoc);
      syncStylesheets();
      const styleObserver = new MutationObserver(syncStylesheets);
      // `attributes`/`characterData` alongside the original `childList`/
      // `subtree`: HMR can rewrite an existing `<link href>` or a `<style>`
      // text node in place (no node added or removed), which `childList`
      // alone never sees.
      styleObserver.observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'media'],
        characterData: true,
      });
      stopStyleSync = () => styleObserver.disconnect();

      resizeObserver = new ResizeObserver(() => {
        setAutoHeight(Math.max(minHeight, iframeDoc.body.scrollHeight));
      });
      resizeObserver.observe(iframeDoc.body);

      // Craft's vendored Positioner (@craftjs/core 0.2.12 - drag-and-drop
      // drop-target math; node_modules/@craftjs/core/dist/esm/index.js,
      // `key:"onScroll"`) caches the hovered drop target's child rects and
      // only ever clears that cache from its OWN capture-phase `scroll`
      // listener on the parent `window`, gated on
      // `event.target instanceof Element && event.target.contains(node.dom)`.
      // Both checks are realm/document-bound, so nothing dispatched from
      // this iframe's document can ever satisfy them - see
      // lib/craft-positioner.ts for the full explanation. Clear the cache
      // directly instead of trying to make a synthetic window `scroll`
      // pass Craft's own checks (it can't). `dragover` still needs its own
      // bridge below: Craft's `preventDefault` fallback, which allows
      // dropping anywhere, is also only wired to the parent window, and
      // that part of the trick still works fine cross-document.
      function onFrameScroll() {
        invalidateDropCache(eventHandlerRef.current);
      }
      function onFrameDragOver(event: Event) {
        event.preventDefault();
      }
      iframeDoc.addEventListener('scroll', onFrameScroll, true);
      iframeDoc.addEventListener('dragover', onFrameDragOver);
      stopFrameBridge = () => {
        iframeDoc.removeEventListener('scroll', onFrameScroll, true);
        iframeDoc.removeEventListener('dragover', onFrameDragOver);
      };

      setCanvasDoc({ document: iframeDoc, window: iframeWin });
    }

    // jsdom (and sometimes Chrome) has contentDocument ready synchronously
    // for a srcless iframe, before any load event fires; try immediately,
    // and also listen for load - both for a browser that has not
    // initialised it yet (real Chrome, occasionally), and for WebKit
    // replacing the document later (see `preparedDoc` above).
    prepare();
    iframe.addEventListener('load', prepare);
    return () => {
      iframe.removeEventListener('load', prepare);
      teardown();
      setCanvasDoc(null);
    };
    // Mount-once: the iframe element itself never changes identity across
    // this component's life (width/height/zoom are applied as plain style
    // below, not by recreating the element). minHeight, read by the resize
    // observer above, is likewise fixed for this instance's whole life - a
    // screen never turns into (or out of) an overlay without the
    // Stage/FramePreview host (and so this CanvasFrame) remounting first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliedHeight = height ?? autoHeight;

  useEffect(() => {
    onContentHeightChange?.(appliedHeight);
    // onContentHeightChange is deliberately not a dependency: a parent
    // passing a fresh closure every render (the common case, e.g. an inline
    // setState function reference is stable, but a wrapping arrow function
    // often is not) must not re-fire this for the same height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedHeight]);

  return (
    <>
      {/*
        The portal is listed BEFORE the iframe deliberately: on unmount,
        React deletes fiber children in the order they appear, and removing
        the iframe from the parent document tears down its nested browsing
        context (jsdom synchronously, real browsers eventually) - which
        invalidates the portal's own container (canvasDoc.document.body)
        before React gets a chance to remove the portaled children from it,
        throwing "NotFoundError: the node to be removed is not a child of
        this node". Unmounting the portal first avoids that: its children
        are gone from the iframe body before the iframe itself is torn down.
      */}
      {canvasDoc && createPortal(children, canvasDoc.document.body)}
      <iframe
        ref={iframeRef}
        title={title}
        data-testid="canvas-frame"
        style={{
          display: 'block',
          border: 0,
          width,
          height: appliedHeight,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      />
    </>
  );
}

export const CanvasFrame = memo(CanvasFrameImpl);

/**
 * `{ document, window }` of the iframe CanvasFrame renders into, once it is
 * ready - null before that, in Play mode, and in any test that renders a
 * block tree without a Stage. Backed by StageContext (see the comment on
 * `CanvasDocument` there) rather than a context this component provides
 * directly, so consumers outside CanvasFrame's own children - the
 * press-and-hold layer stack menu and the keyboard shortcut handler, both
 * siblings of Stage in the workbench tree - can read it too.
 */
export function useCanvasDocument(): CanvasDocument | null {
  return useStage().canvasDocument;
}
