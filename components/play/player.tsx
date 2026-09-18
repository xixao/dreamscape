'use client';
import { ReadOnlyEvents } from '@/components/workbench/develop/read-only-events';
import { DevelopInspector } from '@/components/workbench/develop/inspector';
import { exitPreview } from './exit-preview';

import { Editor, Frame } from '@craftjs/core';
import { XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { resolver } from '@/components/blocks/registry';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { LABEL } from '@/components/workbench/chrome';
import { CompactRootContext, StageProvider } from '@/components/workbench/stage-context';
import type { FileRecord, OverlayPresentation, OverlayScreen, Screen, ToastPosition } from '@/lib/files/repository';
import { OVERLAY_MIN_HEIGHT, isOverlay } from '@/lib/files/screens';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { PlayProvider, usePlay, type PlayContextValue } from './play-context';

interface PlayState {
  currentScreenId: string;
  // A real stack (spec: "a history stack for back"): every screen navigated
  // away from, most recent last, so `back` can pop it.
  history: string[];
  openDialogIds: ReadonlySet<string>;
  // Overlay frames open on top of the current screen, bottom to top (spec
  // docs/superpowers/specs/2026-09-13-overlay-frames-design.md section 4).
  // Screen ids, every one of them an overlay frame of this file: Player's
  // openOverlay callback is what checks that before dispatching, the
  // reducer itself only knows ids.
  overlayStack: string[];
}

type PlayAction =
  | { type: 'navigate'; screenId: string }
  | { type: 'back' }
  | { type: 'openDialog'; nodeId: string }
  | { type: 'closeDialog'; nodeId: string }
  | { type: 'openOverlay'; screenId: string }
  // Without a screenId: the top of the stack (a `closeOverlay` interaction
  // run from the screen itself, or Escape). With one: exactly that overlay,
  // wherever it sits in the stack (its own close button or backdrop, or a
  // Close overlay interaction fired from inside it).
  | { type: 'closeOverlay'; screenId?: string };

// A plain reducer (rather than a ref-juggled useCallback, as
// components/workbench/workbench.tsx uses for its own not-quite-comparable
// onNodesChange) so `navigate`/`back` never need to read a ref to see the
// screen they are currently leaving: the previous `state.currentScreenId`
// is simply the argument the reducer already has. Navigating or going back
// closes every open dialog: a dialog belongs to the screen it was opened
// from, so carrying its open state across a screen change would let it
// reappear if the visitor returns to that screen later. Overlay frames
// follow the same rule for `navigate` (spec section 3: "navigate closes
// every open overlay before switching screens"), while `back` closes just
// the top overlay when one is open and only navigates back in history when
// none is.
function playReducer(state: PlayState, action: PlayAction): PlayState {
  switch (action.type) {
    case 'navigate': {
      if (action.screenId === state.currentScreenId) {
        // Staying put still closes whatever overlays are open: a "go home"
        // button inside a dialog opened from the home screen should still
        // dismiss that dialog.
        return state.overlayStack.length === 0 ? state : { ...state, overlayStack: [] };
      }
      return {
        currentScreenId: action.screenId,
        history: [...state.history, state.currentScreenId],
        openDialogIds: new Set(),
        overlayStack: [],
      };
    }
    case 'back': {
      if (state.overlayStack.length > 0) {
        return { ...state, overlayStack: state.overlayStack.slice(0, -1) };
      }
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return {
        currentScreenId: previous,
        history: state.history.slice(0, -1),
        openDialogIds: new Set(),
        overlayStack: [],
      };
    }
    case 'openDialog': {
      if (state.openDialogIds.has(action.nodeId)) return state;
      return { ...state, openDialogIds: new Set(state.openDialogIds).add(action.nodeId) };
    }
    case 'closeDialog': {
      if (!state.openDialogIds.has(action.nodeId)) return state;
      const next = new Set(state.openDialogIds);
      next.delete(action.nodeId);
      return { ...state, openDialogIds: next };
    }
    case 'openOverlay': {
      // Already open: a no-op, never a second copy (spec section 3: "no
      // loops" - an overlay's own button opening itself does nothing).
      if (state.overlayStack.includes(action.screenId)) return state;
      return { ...state, overlayStack: [...state.overlayStack, action.screenId] };
    }
    case 'closeOverlay': {
      if (state.overlayStack.length === 0) return state;
      if (action.screenId === undefined) {
        return { ...state, overlayStack: state.overlayStack.slice(0, -1) };
      }
      if (!state.overlayStack.includes(action.screenId)) return state;
      return { ...state, overlayStack: state.overlayStack.filter((id) => id !== action.screenId) };
    }
    default:
      return state;
  }
}

/**
 * The screen Play actually starts on (spec docs/superpowers/specs/2026-09-
 * 12-pages-design.md section 4: "resolve the page and start on its first
 * screen (or the given one)"): an explicit, valid `initialScreenId` always
 * wins outright, regardless of `initialPageId` (a caller naming a specific
 * screen means exactly that screen); otherwise the given page's own first
 * screen (array order), when it has one; otherwise the first screen (array
 * order) of the first page - in `pages` order - that has any screen at all;
 * otherwise plain array order, for a file with no `pages` of its own yet
 * (an older fixture, or a page.tsx caller that never looked one up).
 *
 * `screens` here is the file's plain screens only - Player passes the
 * overlay frames out before calling this, so Play never stands ON an
 * overlay: one only ever opens on top of a screen (`initialOverlayId`, or
 * an openOverlay interaction), and an initialScreenId that names an
 * overlay falls through to the page/first-screen resolution like any other
 * unknown id.
 */
function resolveInitialScreenId(
  screens: Screen[],
  pages: FileRecord['pages'],
  initialScreenId: string | undefined,
  initialPageId: string | undefined,
): string | undefined {
  if (initialScreenId && screens.some((screen) => screen.id === initialScreenId)) return initialScreenId;
  if (initialPageId) {
    const onPage = screens.find((screen) => screen.pageId === initialPageId);
    if (onPage) return onPage.id;
  }
  for (const page of pages ?? []) {
    const found = screens.find((screen) => screen.pageId === page.id);
    if (found) return found.id;
  }
  return screens[0]?.id;
}

// Whether Escape, the backdrop and the close button can close an overlay:
// a dialog or sheet says so itself (an alert dialog is `dismissible:
// false`), a toast always can (its corner close button is the only way it
// ever goes away, there being no auto-dismiss).
function isDismissible(presentation: OverlayPresentation): boolean {
  return presentation.type === 'toast' || presentation.dismissible;
}

// Radix's DismissableLayer counts any pointer down or focus outside its
// content as "outside" - including one on a toast overlay sitting above a
// dialog (a toast is not a Radix layer). Pressing a toast's own close
// button must not also dismiss the dialog beneath it.
function isInsideToastOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-overlay-toast]') !== null;
}

// Compile-time exhaustiveness for OverlayHost's presentation switch: a
// fourth presentation type added to the union must get its own wrapper
// before this file compiles again, rather than silently rendering nothing.
function assertNever(value: never): never {
  throw new Error(`Unhandled overlay presentation: ${JSON.stringify(value)}`);
}

/**
 * Runs a file's screens full-window with Craft disabled and every block's
 * real (non-design-mode) behavior live: the wired Button navigates, dialogs
 * open for real, inputs are typeable. Loaded only through
 * components/play/player-loader.tsx's client-only dynamic import - see that
 * file for why (importing components/blocks/registry, and so
 * @craftjs/core, from a module Next.js can reach while rendering a Server
 * Component crashes the same way known-types.ts documents for a route
 * handler; app/f/[id]/page.tsx's own components/workbench/workbench-loader.tsx
 * sidesteps it the same way for the design-mode editor). initialScreenId/
 * initialPageId are both optional and both raw, unvalidated caller input
 * (app/f/[id]/play/page.tsx passes the `screen`/`page` query params
 * straight through) - resolveInitialScreenId above is what actually makes
 * sense of them. initialOverlayId (overlay frames spec section 4: "the
 * Player accepts an optional initial overlay id") seeds the overlay stack
 * with that one overlay frame, open on top of the initial screen, and is
 * ignored unless it names an overlay frame of this file.
 */
export function Player({
  developer = false,
  shared = false,
  closeTab = false,
  file,
  initialScreenId,
  initialPageId,
  initialOverlayId,
}: {
  developer?: boolean;
  shared?: boolean;
  closeTab?: boolean;
  file: FileRecord;
  initialScreenId?: string;
  initialPageId?: string;
  initialOverlayId?: string;
}) {
  const screens = useMemo(() => file.screens ?? [], [file.screens]);
  // Overlay frames are never the screen Play stands on, and never a
  // navigate target: they open on top of the current screen (any overlay
  // in the file, whichever page it lives on, is a valid target) and are
  // left out of every screen resolution below.
  const baseScreens = useMemo(() => screens.filter((screen) => !isOverlay(screen)), [screens]);
  const validScreenIds = useMemo(() => new Set(baseScreens.map((screen) => screen.id)), [baseScreens]);
  const overlaysById = useMemo(
    () => new Map<string, OverlayScreen>(screens.filter(isOverlay).map((screen) => [screen.id, screen])),
    [screens],
  );
  const [state, dispatch] = useReducer(playReducer, {
    currentScreenId: resolveInitialScreenId(baseScreens, file.pages, initialScreenId, initialPageId) ?? '',
    history: [],
    openDialogIds: new Set<string>(),
    overlayStack: initialOverlayId !== undefined && overlaysById.has(initialOverlayId) ? [initialOverlayId] : [],
  });

  // Ignores a navigate interaction whose stored targetScreenId names a
  // screen that no longer exists (deleted in the editor after the
  // interaction was set up): state is left exactly as it was, rather than
  // dispatching and letting the render-time `?? baseScreens[0]` fallback
  // below silently teleport to screen 1 while history/closeHref keep
  // pointing at the now-invalid id. An overlay frame's id is not a valid
  // target either.
  const navigate = useCallback(
    (screenId: string) => {
      if (!validScreenIds.has(screenId)) return;
      dispatch({ type: 'navigate', screenId });
    },
    [validScreenIds],
  );
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const openDialog = useCallback((nodeId: string) => dispatch({ type: 'openDialog', nodeId }), []);
  const closeDialog = useCallback((nodeId: string) => dispatch({ type: 'closeDialog', nodeId }), []);
  const isDialogOpen = useCallback((nodeId: string) => state.openDialogIds.has(nodeId), [state.openDialogIds]);
  // Same guard as navigate's, for the other two no-op cases the spec names
  // (section 3: "Opening an overlay that is a screen, or a missing id, is a
  // no-op"); "already in the stack" is the reducer's own check.
  const openOverlay = useCallback(
    (screenId: string) => {
      if (!overlaysById.has(screenId)) return;
      dispatch({ type: 'openOverlay', screenId });
    },
    [overlaysById],
  );
  const closeOverlay = useCallback(() => dispatch({ type: 'closeOverlay' }), []);
  const closeOverlayById = useCallback((screenId: string) => dispatch({ type: 'closeOverlay', screenId }), []);

  const play = useMemo<PlayContextValue>(
    () => ({ mode: 'play', navigate, back, openDialog, closeDialog, isDialogOpen, openOverlay, closeOverlay }),
    [navigate, back, openDialog, closeDialog, isDialogOpen, openOverlay, closeOverlay],
  );

  const currentScreen = baseScreens.find((screen) => screen.id === state.currentScreenId) ?? baseScreens[0];
  const closeHref = `/f/${file.id}#s=${state.currentScreenId}`;

  // The Play chip and every overlay's own X share the viewport's top-right
  // corner (a sheet's or toast's close button is `absolute top-3 right-3`
  // inside a surface pinned there), so the chip only rises above the
  // overlays - and opts back into pointer events, behind a modal's
  // `pointer-events: none` on <body> - when the top overlay is not
  // dismissible: the one case where it is the way out of Play, and the one
  // case where the overlay shows no X for it to cover. Otherwise it keeps
  // its plain z-50 and the overlays paint over it (portalled dialogs and
  // sheets by DOM order, toasts by their z-[60]).
  const topOverlay =
    state.overlayStack.length > 0 ? overlaysById.get(state.overlayStack[state.overlayStack.length - 1]) : undefined;
  const chipAboveOverlays = topOverlay !== undefined && !isDismissible(topOverlay.presentation);

  // Read by the Escape handler below instead of closing over
  // state.openDialogIds / state.overlayStack directly: that effect is only
  // re-subscribed when closeHref changes (a screen switch), not on every
  // dialog or overlay open/close, so a plain closure would go stale the
  // moment one opens or closes without a screen change.
  const openDialogIdsRef = useRef(state.openDialogIds);
  useEffect(() => {
    openDialogIdsRef.current = state.openDialogIds;
  }, [state.openDialogIds]);
  const overlayStackRef = useRef(state.overlayStack);
  useEffect(() => {
    overlayStackRef.current = state.overlayStack;
  }, [state.overlayStack]);

  // Written by an overlay wrapper's onEscapeKeyDown - Radix's own document-
  // level, capture-phase Escape listener, which runs before the window-
  // level bubble-phase one below - so that handler can tell "the Radix
  // layer that saw this Escape is one of OUR overlay frames" apart from
  // "it is a legacy inline Dialog block, which Radix has just dismissed on
  // its own". Both leave event.defaultPrevented true; only the former
  // should also touch the overlay stack. The event instance itself, not a
  // boolean: the window handler compares it with the event it is given, so
  // a keypress that never reaches window (something between stopping its
  // propagation) can never leave a stale flag behind for the next one.
  const escapeEventRef = useRef<KeyboardEvent | null>(null);
  const markEscapeSeenByOverlay = useCallback((event: KeyboardEvent) => {
    escapeEventRef.current = event;
  }, []);

  // Re-subscribed whenever closeHref changes (a screen switch) so the
  // handler always closes over the current link, rather than a ref written
  // during render - see workbench.tsx's own comment on why the latter trips
  // the react-hooks/refs lint rule and can even read stale in some cases.
  //
  // Escape with overlay frames open (spec section 4): closes the top
  // overlay if it is dismissible and otherwise does nothing - Play exits on
  // Escape only once the stack is empty. The overlay wrappers below prevent
  // Radix's own Escape dismiss (OverlayHost's onEscapeKeyDown) so this one
  // handler decides for the whole stack, whichever kind of overlay is on
  // top (a toast, which is no Radix layer at all, included).
  //
  // With the stack empty, today's rule for legacy inline dialogs stays:
  // Radix's Dialog dismisses on Escape via DismissableLayer's own
  // document-level, capture-phase listener, which runs before this
  // window-level bubble-phase one and calls event.preventDefault() when it
  // dismisses (see @radix-ui/react-dismissable-layer) - so on the very
  // keypress that closes a dialog, event.defaultPrevented is already true
  // by the time this handler sees it. openDialogIdsRef is a second,
  // independent check for any dialog left open by a path that did not
  // preventDefault. Either way, the first Escape closes only the dialog;
  // Play itself only exits once no dialog is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const seenByOverlay = escapeEventRef.current === event;
      escapeEventRef.current = null;

      const stack = overlayStackRef.current;
      if (stack.length > 0) {
        // A legacy inline Dialog block (inside the screen, or inside an
        // overlay's own layout) that Radix just dismissed on this same
        // keypress was the top-most layer: leave the overlay stack alone.
        if (event.defaultPrevented && !seenByOverlay) return;
        const top = overlaysById.get(stack[stack.length - 1]);
        if (top && isDismissible(top.presentation)) dispatch({ type: 'closeOverlay' });
        return;
      }

      if (event.defaultPrevented || openDialogIdsRef.current.size > 0) return;
      if (!shared && !developer) exitPreview(closeHref, closeTab);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeHref, overlaysById, shared, closeTab, developer]);

  // Only reachable for a file whose screens array is empty (or holds
  // nothing but overlay frames), which validateScreens (lib/files/
  // validate.ts) never allows a real saved file to have - defensive, not
  // expected in production.
  if (!currentScreen) return null;

  return (
    <PlayProvider value={play}>
      <div data-appearance={currentScreen.appearance ?? file.appearance ?? 'light'} className={cn("theme-basic flex min-h-screen items-center justify-center overflow-auto bg-background p-8 text-foreground", developer && "pt-24")}>
        <StageProvider key={state.currentScreenId} initialWidth={currentScreen.stageWidth}>
          <div
            data-testid="artboard"
            className={cn(
              'relative shrink-0 bg-background',
              currentScreen.stageHeight != null && 'overflow-auto',
            )}
            style={
              currentScreen.stageHeight != null
                ? { width: currentScreen.stageWidth, height: currentScreen.stageHeight }
                : { width: currentScreen.stageWidth, minHeight: ARTBOARD_MIN_HEIGHT }
            }
          >
            <Editor resolver={resolver} enabled={developer} {...(developer ? { handlers: store => new ReadOnlyEvents({ store, removeHoverOnMouseleave: true }) } : {})}>
              <Frame key={state.currentScreenId} data={currentScreen.layout} />
              {developer && <DevelopInspector file={file} screen={currentScreen} />}
            </Editor>
          </div>
        </StageProvider>
        {/* Overlay frames, bottom to top, each a sibling of the screen's
            Editor (never inside it) with its own StageProvider and Editor.
            Array order is stacking order: Radix layers dialogs and sheets
            in mount order, toasts sit above both by z-index. */}
        {state.overlayStack.map((id) => {
          const overlay = overlaysById.get(id);
          return overlay ? (
            <OverlayHost
              fileAppearance={file.appearance ?? 'light'}
              key={id}
              overlay={overlay}
              closeOverlayById={closeOverlayById}
              onEscapeKeyDown={markEscapeSeenByOverlay}
            />
          ) : null;
        })}
        {!shared && !developer && <div
          className={cn(
            'fixed top-3 right-3 flex items-center gap-3 rounded-md border border-(color:--bevel-line) bg-card px-3 py-1.5 shadow-panel-lg',
            chipAboveOverlays ? 'pointer-events-auto z-[70]' : 'z-50',
          )}
        >
          <span className={cn(LABEL, 'text-t2')}>{currentScreen.name}</span>
          <span className={cn(LABEL, 'text-t4')}>Esc to exit</span>
          <a href={closeHref} onClick={event => { event.preventDefault(); exitPreview(closeHref, closeTab); }} className="text-t2 underline hover:no-underline">
            Close
          </a>
        </div>}
      </div>
    </PlayProvider>
  );
}

// 16 px from the edges (Tailwind's 4 = 1rem), centred variants pulled back
// by half their own width.
const TOAST_POSITION_CLASSES: Record<ToastPosition, string> = {
  'top-left': 'top-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
};

/**
 * One open overlay frame (spec section 4): the overlay's layout in its own
 * StageProvider (initial width = the overlay's stageWidth, so its blocks
 * respond to THAT width, not the screen's) and its own disabled Editor +
 * Frame, wrapped by the presentation - a shadcn Dialog, a shadcn Sheet on
 * its side, or a fixed toast card. Every wrapper uses `p-0` so the layout's
 * own ROOT padding is the overlay's padding, exactly as designed.
 *
 * Interactions inside the overlay run through the same runner as the
 * screen's, with one rebinding: a Close overlay interaction fired from in
 * here closes THIS overlay, not whatever happens to be top of the stack
 * (a toast shown above a dialog must not swallow the dialog's own Cancel).
 */
function OverlayHost({
  fileAppearance,
  overlay,
  closeOverlayById,
  onEscapeKeyDown,
}: {
  fileAppearance: 'light' | 'dark' | 'internal-light' | 'internal-dark';
  overlay: OverlayScreen;
  closeOverlayById: (screenId: string) => void;
  onEscapeKeyDown: (event: KeyboardEvent) => void;
}) {
  const play = usePlay();
  const close = useCallback(() => closeOverlayById(overlay.id), [closeOverlayById, overlay.id]);
  const boundPlay = useMemo<PlayContextValue>(() => ({ ...play, closeOverlay: close }), [play, close]);

  const presentation = overlay.presentation;
  const dismissible = isDismissible(presentation);

  // Radix handles Escape on its top-most layer itself; the Player's window
  // listener decides what Escape does to the overlay STACK (see
  // markEscapeSeenByOverlay there), so every dialog/sheet overlay flags the
  // event for it and prevents Radix's own dismiss - dismissible or not.
  const handleEscapeKeyDown = (event: KeyboardEvent) => {
    onEscapeKeyDown(event);
    event.preventDefault();
  };
  // A pointer down or focus outside closes a dismissible overlay (Radix
  // then calls onOpenChange(false)) and is ignored by a non-dismissible one.
  // Either way, one that lands on a toast overlay sitting above this one is
  // not "outside" in any sense the visitor means - see isInsideToastOverlay.
  // onInteractOutside alone covers both the pointer and the focus case
  // (Radix fires it right after onPointerDownOutside for a pointer).
  const handleInteractOutside = (event: Event) => {
    if (!dismissible || isInsideToastOverlay(event.target)) event.preventDefault();
  };
  const handleOpenChange = (open: boolean) => {
    if (!open && dismissible) close();
  };

  const artboard = (
    <CompactRootContext.Provider value={true}><StageProvider initialWidth={overlay.stageWidth}>
      <div
        data-testid={`overlay-artboard-${overlay.id}`}
        className={cn('relative w-full bg-background text-foreground', overlay.stageHeight != null && 'overflow-auto')}
        style={overlay.stageHeight != null ? { height: overlay.stageHeight } : { minHeight: OVERLAY_MIN_HEIGHT }}
      >
        <Editor resolver={resolver} enabled={false}>
          <Frame data={overlay.layout} />
        </Editor>
      </div>
    </StageProvider></CompactRootContext.Provider>
  );

  let content: ReactNode;
  switch (presentation.type) {
    case 'sheet': {
      // Left/right sheets take the overlay's width, capped at the window
      // (replacing the primitive's own sm:max-w-sm, and capped below sm
      // too, where it has no cap at all); top/bottom sheets ignore the
      // width and span the viewport (spec section 2).
      const horizontal = presentation.side === 'left' || presentation.side === 'right';
      content = (
        <Sheet open modal onOpenChange={handleOpenChange}>
          <SheetContent
            side={presentation.side}
            data-overlay-id={overlay.id}
            data-appearance={overlay.appearance ?? fileAppearance}
            className={cn(
              'theme-basic gap-0 overflow-auto p-0 text-foreground',
              horizontal &&
                'data-[side=left]:max-w-full data-[side=left]:sm:max-w-full data-[side=right]:max-w-full data-[side=right]:sm:max-w-full',
            )}
            style={horizontal ? { width: overlay.stageWidth } : undefined}
            showCloseButton={dismissible}
            aria-describedby={undefined}
            onEscapeKeyDown={handleEscapeKeyDown}
            onInteractOutside={handleInteractOutside}
          >
            <SheetTitle className="sr-only">{overlay.name}</SheetTitle>
            {artboard}
          </SheetContent>
        </Sheet>
      );
      break;
    }
    case 'toast': {
      content = (
        <div
          role="status"
          aria-label={overlay.name}
          data-overlay-toast="true"
          data-overlay-id={overlay.id}
            data-appearance={overlay.appearance ?? fileAppearance}
          className={cn(
            'theme-basic pointer-events-auto fixed z-[60] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background text-foreground shadow-lg',
            TOAST_POSITION_CLASSES[presentation.position],
          )}
          style={{ width: overlay.stageWidth, maxWidth: `calc(100vw - ${(presentation.offset ?? 16) * 2}px)`, ...(presentation.position.startsWith('top') ? {top:presentation.offset ?? 16} : {bottom:presentation.offset ?? 16}), ...(presentation.position.endsWith('left') ? {left:presentation.offset ?? 16} : presentation.position.endsWith('right') ? {right:presentation.offset ?? 16} : {}) }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close overlay"
            className="absolute top-2 right-2 z-10"
            onClick={close}
          >
            <XIcon />
          </Button>
          {artboard}
        </div>
      );
      break;
    }
    case 'dialog': {
      // Capped at the window on both axes and scrolling inside itself: a
      // hug-content dialog taller than the window could not be reached
      // otherwise, since Radix locks the page behind a modal.
      content = (
        <Dialog open modal onOpenChange={handleOpenChange}>
          <DialogContent
            data-overlay-id={overlay.id}
            data-appearance={overlay.appearance ?? fileAppearance}
            className="theme-basic max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0 text-foreground sm:max-w-[calc(100vw-2rem)]"
            style={{ width: overlay.stageWidth }}
            showCloseButton={dismissible}
            aria-describedby={undefined}
            onEscapeKeyDown={handleEscapeKeyDown}
            onInteractOutside={handleInteractOutside}
          >
            <DialogTitle className="sr-only">{overlay.name}</DialogTitle>
            {artboard}
          </DialogContent>
        </Dialog>
      );
      break;
    }
    default:
      content = assertNever(presentation);
  }

  return <PlayProvider value={boundPlay}>{content}</PlayProvider>;
}
