'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { type CanvasDocument, useStage } from './stage-context';

// Marks every stylesheet node this component copies into the iframe head,
// so a later sync pass can tell "copied by us" apart from anything else
// that might land in that head, and so it can cheaply clear and re-copy
// instead of diffing node-by-node (HMR style injection/removal is rare
// enough in practice that re-copying the whole set on every parent-head
// mutation is not worth optimizing away).
const SYNC_MARKER = 'data-canvas-sync';

function copyStylesheets(iframeDoc: Document): void {
  iframeDoc.head.querySelectorAll(`[${SYNC_MARKER}]`).forEach((node) => node.remove());
  document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    const clone = node.cloneNode(true) as Element;
    clone.setAttribute(SYNC_MARKER, '');
    iframeDoc.head.appendChild(clone);
  });
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
 */
export function CanvasFrame({
  width,
  height,
  zoom,
  title = 'Frame',
  children,
}: {
  width: number;
  height: number | null;
  zoom: number;
  title?: string;
  children: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [canvasDoc, setCanvasDoc] = useState<CanvasDocument | null>(null);
  const [autoHeight, setAutoHeight] = useState(ARTBOARD_MIN_HEIGHT);
  const setStageCanvasDocument = useStage().setCanvasDocument;

  // Published up through StageContext too (see the type's own comment in
  // stage-context.tsx): useLayerStack and useWorkbenchKeyboard need it and
  // are not descendants of this component's own children.
  useEffect(() => {
    setStageCanvasDocument(canvasDoc);
    return () => setStageCanvasDocument(null);
  }, [canvasDoc, setStageCanvasDocument]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let stopStyleSync: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let prepared = false;

    function prepare() {
      if (prepared) return;
      const iframeDoc = iframe!.contentDocument;
      const iframeWin = iframe!.contentWindow;
      if (!iframeDoc || !iframeWin || !iframeDoc.body) return;
      prepared = true;

      // The next/font variable classes (and any other class) the parent
      // html carries - this iframe is a separate document, so nothing about
      // the parent cascades into it on its own.
      iframeDoc.documentElement.className = document.documentElement.className;

      iframeDoc.body.className = 'theme-basic';
      iframeDoc.body.style.margin = '0';
      iframeDoc.body.style.colorScheme = 'light';

      copyStylesheets(iframeDoc);
      const styleObserver = new MutationObserver(() => copyStylesheets(iframeDoc));
      styleObserver.observe(document.head, { childList: true, subtree: true });
      stopStyleSync = () => styleObserver.disconnect();

      resizeObserver = new ResizeObserver(() => {
        setAutoHeight(Math.max(ARTBOARD_MIN_HEIGHT, iframeDoc.body.scrollHeight));
      });
      resizeObserver.observe(iframeDoc.body);

      setCanvasDoc({ document: iframeDoc, window: iframeWin });
    }

    // jsdom (and sometimes Chrome) has contentDocument ready synchronously
    // for a srcless iframe, before any load event fires; try immediately,
    // and also listen for load in case the browser has not initialised it
    // yet (real Chrome, occasionally).
    prepare();
    iframe.addEventListener('load', prepare);
    return () => {
      iframe.removeEventListener('load', prepare);
      stopStyleSync?.();
      resizeObserver?.disconnect();
      setCanvasDoc(null);
    };
    // Mount-once: the iframe element itself never changes identity across
    // this component's life (width/height/zoom are applied as plain style
    // below, not by recreating the element).
  }, []);

  const appliedHeight = height ?? autoHeight;

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
