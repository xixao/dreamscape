'use client';

import { Editor, Frame } from '@craftjs/core';
import { MonitorIcon, SmartphoneIcon, XIcon, MoreHorizontalIcon, PanelRightIcon, ChevronDownIcon, MaximizeIcon, MinimizeIcon } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { resolver } from '@/components/blocks/registry';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { CanvasFrame } from '@/components/workbench/canvas-frame';
import { StageProvider } from '@/components/workbench/stage-context';
import { CommentLayer, type PendingPin } from '@/components/workbench/comments/comment-layer';
import { createCommentStore, getAuthorName, setAuthorName } from '@/lib/comments/store';
import { toArtboardPoint, type Rect } from '@/lib/comments/geometry';
import type { FileRecord, OverlayPresentation, OverlayScreen, Screen, ToastPosition } from '@/lib/files/repository';
import { OVERLAY_MIN_HEIGHT, isOverlay } from '@/lib/files/screens';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { DEVICE_PRESET_GROUPS, type DevicePreset } from '@/lib/stage/device-presets';
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
  | { type: 'closeOverlay'; screenId?: string }
  | { type: 'reset'; screenId: string };

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
    case 'reset':
      return {
        currentScreenId: action.screenId,
        history: [],
        openDialogIds: new Set(),
        overlayStack: [],
      };
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
  file,
  initialScreenId,
  initialPageId,
  initialOverlayId,
}: {
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
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [devicePreset, setDevicePreset] = useState<DevicePreset | null>(null);
  const [presentationZoom, setPresentationZoom] = useState(1);
  const [fitView, setFitView] = useState(true);
  const previewRef = useRef<HTMLElement>(null);
  const [overviewTitle, setOverviewTitle] = useState(file.name);
  const [saveMessage, setSaveMessage] = useState('');
  const [playbackKey, setPlaybackKey] = useState(0);
  const [commentStore] = useState(() => createCommentStore(file.id));
  const allThreads = useSyncExternalStore(commentStore.subscribe, commentStore.list, () => []);
  const [commentMode, setCommentMode] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [reviewPanelTab, setReviewPanelTab] = useState<'screens' | 'comments' | 'overview'>('screens');
  const [overviewNotes, setOverviewNotes] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [authorName, setAuthorNameState] = useState<string | null>(() => getAuthorName());
  const artboardRef = useRef<HTMLDivElement>(null);
  const [artboardRect, setArtboardRect] = useState<Rect | null>(null);

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
  const topOverlay = state.overlayStack.length > 0 ? overlaysById.get(state.overlayStack[state.overlayStack.length - 1]) : undefined;
  const exitAboveOverlays = topOverlay !== undefined && !isDismissible(topOverlay.presentation);

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
      if (isExpanded) {
        event.preventDefault();
        setIsExpanded(false);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        requestAnimationFrame(() => expandButtonRef.current?.focus());
        return;
      }
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
      window.location.assign(closeHref);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeHref, overlaysById, isExpanded]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`dreamscape:presentation-overview:${file.id}`) ?? 'null');
      if (saved && typeof saved.title === 'string' && typeof saved.notes === 'string') {
        // Hydrate browser-only metadata after SSR; subsequent edits stay in draft state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverviewTitle(saved.title); setOverviewNotes(saved.notes);
      }
    } catch { setSaveMessage('Saved overview could not be loaded.'); }
  }, [file.id]);
  useEffect(() => {
    const update = () => {
      if (!document.fullscreenElement) {
        setIsExpanded(false);
        requestAnimationFrame(() => expandButtonRef.current?.focus());
      }
    };
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const presentationWidth = devicePreset?.width ?? (viewportMode === 'mobile' ? 390 : (currentScreen?.stageWidth ?? 0));
  const changeZoom = (value: number) => { setFitView(false); setPresentationZoom(Math.max(.1, Math.min(2, value))); };
  useLayoutEffect(() => {
    const host = previewRef.current;
    if (!host || !fitView) return;
    const measure = () => setPresentationZoom(Math.max(.1, Math.min(1, (host.clientWidth - 64) / Math.max(1, presentationWidth), (host.clientHeight - 64) / (devicePreset?.height ?? currentScreen?.stageHeight ?? ARTBOARD_MIN_HEIGHT))));
    const observer = new ResizeObserver(measure);
    observer.observe(host); measure();
    return () => observer.disconnect();
  }, [fitView, presentationWidth, devicePreset, currentScreen, commentsPanelOpen]);
  const resetPresentation = () => {
    dispatch({ type: 'reset', screenId: resolveInitialScreenId(baseScreens, file.pages, initialScreenId, initialPageId) ?? currentScreen.id });
    setViewportMode('desktop');
    setDevicePreset(null);
    setPresentationZoom(1); setFitView(true); setPlaybackKey((key) => key + 1);
    setCommentMode(false);
    setPendingPin(null);
    setOpenThreadId(null);
  };
  const toggleExpanded = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      requestAnimationFrame(() => expandButtonRef.current?.focus());
    } else {
      setIsExpanded(true);
      // Embedded browsers may not support native fullscreen; expanded view still works.
      await document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };
  const visibleThreads = allThreads.filter((thread) => !thread.screenId || thread.screenId === currentScreen.id);
  useLayoutEffect(() => {
    const element = artboardRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setArtboardRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [state.currentScreenId, viewportMode, presentationZoom, commentsPanelOpen, devicePreset]);

  // Only reachable for a file whose screens array is empty (or holds
  // nothing but overlay frames), which validateScreens never allows in a
  // real saved file. The hook above must remain unconditional.
  if (!currentScreen) return null;
  const placeComment = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!commentMode || !artboardRef.current) return;
    const rect = artboardRef.current.getBoundingClientRect();
    const point = toArtboardPoint(event.clientX, event.clientY, rect, presentationZoom);
    setPendingPin({ x: point.x, y: point.y });
  };

  return (
    <PlayProvider value={play}>
      <TooltipProvider delayDuration={300}>
      <div className="presentation-stage relative flex h-dvh flex-col overflow-hidden bg-canvas font-sans text-foreground">
        {!isExpanded && <header className="sticky top-0 z-[80] flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-card/95 px-4 py-2 shadow-panel backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-semibold tracking-tight">{overviewTitle}</span>
            <span className="hidden text-xs text-muted-foreground md:block">{currentScreen.name}</span>
            <span className="rounded border border-line-strong bg-(color:--chip) px-2 py-0.5 text-[11px] text-t4">Read-only</span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1" aria-label="Presentation controls">
            <DropdownMenu><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" variant={viewportMode === 'desktop' ? 'secondary' : 'ghost'} size="icon" aria-label="Desktop preview" title="Desktop preview"><MonitorIcon /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent className="z-[110]" sideOffset={8}>Desktop preview</TooltipContent></Tooltip><DropdownMenuContent className="z-[100] min-w-72 max-h-80" align="end"><DropdownMenuLabel>Desktop viewports</DropdownMenuLabel><DropdownMenuSeparator />{DEVICE_PRESET_GROUPS.filter((group) => group.group === 'Desktop').flatMap((group) => group.devices).map((device) => <DropdownMenuItem key={device.name} onSelect={() => { setDevicePreset(device); setViewportMode('desktop'); }}>{device.name} · {device.width}×{device.height}</DropdownMenuItem>)}<DropdownMenuItem onSelect={() => { setDevicePreset(null); setViewportMode('desktop'); }}>Default desktop</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <DropdownMenu><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" variant={viewportMode === 'mobile' ? 'secondary' : 'ghost'} size="icon" aria-label="Mobile preview" title="Mobile preview"><SmartphoneIcon /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent className="z-[110]" sideOffset={8}>Mobile preview</TooltipContent></Tooltip><DropdownMenuContent className="z-[100] min-w-72 max-h-80" align="end"><DropdownMenuLabel>Mobile viewports</DropdownMenuLabel><DropdownMenuSeparator />{DEVICE_PRESET_GROUPS.filter((group) => group.group === 'Phone' || group.group === 'Tablet').flatMap((group) => group.devices).map((device) => <DropdownMenuItem key={device.name} onSelect={() => { setDevicePreset(device); setViewportMode('mobile'); }}>{device.name} · {device.width}×{device.height}</DropdownMenuItem>)}<DropdownMenuItem onSelect={() => { setDevicePreset(null); setViewportMode('mobile'); }}>Default mobile</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Zoom options">{fitView ? 'Fit' : `${Math.round(presentationZoom * 100)}%`} <ChevronDownIcon className="size-3" aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent className="z-[100] min-w-48" align="end"><DropdownMenuItem onSelect={() => setFitView(true)}>Fit to window</DropdownMenuItem>{[.5,.75,1,1.25,1.5,2].map((zoom) => <DropdownMenuItem key={zoom} onSelect={() => changeZoom(zoom)}>{zoom * 100}%</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Presentation options"><MoreHorizontalIcon aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent className="z-[100] min-w-52" align="end"><DropdownMenuItem onSelect={resetPresentation}>Restart walkthrough</DropdownMenuItem><DropdownMenuItem onSelect={() => { void navigator.clipboard.writeText(window.location.href).then(() => setSaveMessage('Presentation link copied.'), () => setSaveMessage('Could not copy the link.')); }}>Copy presentation link</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            <Button type="button" variant={commentsPanelOpen ? 'secondary' : 'ghost'} size="sm" onClick={() => { setCommentsPanelOpen((value) => !value); }} aria-pressed={commentsPanelOpen}>
              <PanelRightIcon className="size-4" aria-hidden="true" /> Review{visibleThreads.length > 0 ? ` · ${visibleThreads.length}` : ''}
            </Button>
            <Tooltip><TooltipTrigger asChild><Button ref={expandButtonRef} type="button" variant="ghost" size="icon" aria-label="Expand presentation" onClick={() => void toggleExpanded()}><MaximizeIcon aria-hidden="true" /></Button></TooltipTrigger><TooltipContent className="z-[110]">Expand presentation</TooltipContent></Tooltip>
            <a href={closeHref} className={cn("ml-1 rounded border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", exitAboveOverlays && "pointer-events-auto")}>Exit</a>
          </div>
        </header>}
        {isExpanded && <Button autoFocus type="button" variant="secondary" size="sm" className="pointer-events-auto absolute right-4 top-4 z-[110] gap-2 border shadow-lg" aria-label="Exit expanded view" onClick={() => void toggleExpanded()}><MinimizeIcon aria-hidden="true" className="size-4" /> Back to presentation</Button>}
        {!isExpanded && saveMessage && <div role="status" className="px-4 py-2 text-xs text-muted-foreground">{saveMessage}</div>}
        <div className="flex min-h-0 flex-1">
        <main ref={previewRef} className="flex min-w-0 flex-1 items-start justify-start overflow-auto bg-muted/20 p-4 sm:p-8" aria-label="Presentation preview">
          <div className="m-auto shrink-0" style={{ zoom: presentationZoom }}>
            <StageProvider key={`${state.currentScreenId}-${viewportMode}-${playbackKey}`} initialWidth={presentationWidth}>
              <div
                ref={artboardRef}
                data-testid="artboard"
                className={cn('theme-basic relative shrink-0 bg-background text-foreground shadow-panel-lg ring-1 ring-line-strong', (devicePreset?.height ?? currentScreen.stageHeight) != null && 'overflow-auto')}
                style={
                  (devicePreset?.height ?? currentScreen.stageHeight) != null
                    ? { width: presentationWidth, height: devicePreset?.height ?? currentScreen.stageHeight ?? undefined }
                    : { width: presentationWidth, minHeight: ARTBOARD_MIN_HEIGHT }
                }
                onClickCapture={(event) => {
                  if (commentMode) event.preventDefault();
                  placeComment(event);
                }}
              >
                <Editor resolver={resolver} enabled={false}>
                  <Frame key={state.currentScreenId} data={currentScreen.layout} />
                </Editor>
              </div>
            </StageProvider>
          </div>
          <CommentLayer
            commentMode={commentMode}
            threads={visibleThreads}
            pendingPin={pendingPin}
            openThreadId={openThreadId}
            authorName={authorName}
            zoom={presentationZoom}
            artboardRect={artboardRect}
            onPlacePin={() => {}}
            onCancelPending={() => setPendingPin(null)}
            onSubmitComment={({ author, text }) => {
              if (!pendingPin) return;
              if (!authorName) { setAuthorName(author); setAuthorNameState(author); }
              commentStore.add({ x: pendingPin.x, y: pendingPin.y, pageId: currentScreen.pageId, screenId: currentScreen.id, author, text });
              setPendingPin(null);
              setCommentMode(false);
            }}
            onPinClick={(id) => { setPendingPin(null); setOpenThreadId(id); }}
            onCloseThread={() => setOpenThreadId(null)}
            onSubmitReply={(threadId, { author, text }) => { commentStore.reply(threadId, { author, text }); }}
            onResolveThread={(threadId) => { commentStore.resolve(threadId); setOpenThreadId(null); }}
          />
        {/* Overlay frames, bottom to top, each a sibling of the screen's
            Editor (never inside it) with its own StageProvider and Editor.
            Array order is stacking order: Radix layers dialogs and sheets
            in mount order, toasts sit above both by z-index. */}
        {state.overlayStack.map((id) => {
          const overlay = overlaysById.get(id);
          return overlay ? (
            <OverlayHost
              key={id}
              overlay={overlay}
              closeOverlayById={closeOverlayById}
              onEscapeKeyDown={markEscapeSeenByOverlay}
            />
          ) : null;
        })}
        </main>
        {commentsPanelOpen && !isExpanded && (
          <aside className="fixed inset-x-0 bottom-0 z-[85] max-h-[75dvh] overflow-y-auto rounded-t-2xl border border-line-soft bg-card p-5 shadow-xl lg:static lg:z-auto lg:max-h-none lg:w-80 lg:rounded-none lg:border-0 lg:border-l lg:shadow-none" aria-label="Review">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Review</h2>
                <p className="mt-1 text-xs text-muted-foreground">Explore the work. Add perspective.</p>
              </div>
              {reviewPanelTab === 'comments' && <Button type="button" variant={commentMode ? 'secondary' : 'outline'} size="sm" onClick={() => { setCommentMode((value) => !value); setPendingPin(null); }} aria-pressed={commentMode}>
                {commentMode ? 'Cancel pin' : 'Place comment'}
              </Button>}
              <Button variant="ghost" size="icon" aria-label="Close review panel" onClick={() => setCommentsPanelOpen(false)}><XIcon /></Button>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-1 rounded-md bg-(color:--chip) p-1" role="tablist" aria-label="Review panel">
              {(['screens', 'comments', 'overview'] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={reviewPanelTab === tab} className={cn('rounded px-2 py-1.5 text-[11px] capitalize', reviewPanelTab === tab ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')} onClick={() => setReviewPanelTab(tab)}>{tab}</button>
              ))}
            </div>
            {reviewPanelTab === 'screens' ? (
              <div className="space-y-2">
                {(file.pages?.length ? file.pages : [{ id: undefined, name: 'Screens' }]).map((page) => <section key={page.id ?? 'screens'} className="space-y-2"><h3 className="pt-3 text-xs font-medium text-muted-foreground">{page.name}</h3>{baseScreens.filter((screen) => !page.id || screen.pageId === page.id).map((screen) => <button key={screen.id} type="button" className={cn('w-full rounded-md border p-3 text-left text-sm', screen.id === currentScreen.id ? 'border-ring bg-accent' : 'border-line-soft bg-(color:--chip)')} onClick={() => dispatch({ type: 'navigate', screenId: screen.id })}><ScreenThumbnail screen={screen} /><span className="mt-3 block font-medium">{screen.name}</span><span className="mt-1 block text-xs text-muted-foreground">{screen.stageWidth} px{screen.id === currentScreen.id ? ' · Viewing now' : ' · Open screen'}</span></button>)}</section>)}
              </div>
            ) : reviewPanelTab === 'overview' ? (
              <div className="space-y-3 text-xs"><label className="block"><span className="text-t4">Presentation title</span><input className="mt-1 h-9 w-full rounded-md border border-line-soft bg-(color:--chip) px-2 text-t2" value={overviewTitle} onChange={(event) => setOverviewTitle(event.target.value)} /></label><label className="block"><span className="text-t4">Presenter notes</span><textarea value={overviewNotes} onChange={(event) => setOverviewNotes(event.target.value)} placeholder="Add context for reviewers…" className="mt-1 min-h-24 w-full rounded-md border border-line-soft bg-(color:--chip) p-2 text-t2" /></label><dl className="space-y-3 border-t border-line-soft pt-3"><div><dt className="text-t4">Page</dt><dd className="mt-1 text-t2">{file.pages?.find((page) => page.id === currentScreen.pageId)?.name ?? 'Page 1'}</dd></div><div><dt className="text-t4">Screen</dt><dd className="mt-1 text-t2">{currentScreen.name}</dd></div><div><dt className="text-t4">Viewport</dt><dd className="mt-1 text-t2">{presentationWidth} px · {devicePreset?.name ?? viewportMode}</dd></div><div><dt className="text-t4">Status</dt><dd className="mt-1 text-ok">Read-only</dd></div></dl><Button type="button" size="sm" onClick={() => { try { localStorage.setItem(`dreamscape:presentation-overview:${file.id}`, JSON.stringify({ title: overviewTitle, notes: overviewNotes })); setSaveMessage('Overview saved in this browser.'); } catch { setSaveMessage('Could not save overview. Your draft is still here.'); } }}>Save overview</Button><p className="text-muted-foreground">Saved on this browser. Shared viewers do not receive these notes.</p></div>
            ) : visibleThreads.length === 0 ? (
              <div className="rounded-md border border-dashed border-line-strong p-4 text-xs text-t4">
                No comments on this screen yet.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleThreads.map((thread) => (
                  <button key={thread.id} type="button" className="w-full rounded-md border border-line-soft bg-(color:--chip) p-3 text-left hover:border-line-strong" onClick={() => setOpenThreadId(thread.id)}>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-t4"><span>{thread.author}</span><span>{new Date(thread.createdAt).toLocaleDateString()}</span></div>
                    <p className="mt-1 line-clamp-3 text-sm text-t2">{thread.text}</p>
                    {thread.replies.length > 0 && <span className="mt-2 block text-[11px] text-t4">{thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}</span>}
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}
        </div>
      </div>
      </TooltipProvider>
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
  overlay,
  closeOverlayById,
  onEscapeKeyDown,
}: {
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
    <StageProvider initialWidth={overlay.stageWidth}>
      <div
        data-testid={`overlay-artboard-${overlay.id}`}
        className={cn('relative w-full bg-background text-foreground', overlay.stageHeight != null && 'overflow-auto')}
        style={overlay.stageHeight != null ? { height: overlay.stageHeight } : { minHeight: OVERLAY_MIN_HEIGHT }}
      >
        <Editor resolver={resolver} enabled={false}>
          <Frame data={overlay.layout} />
        </Editor>
      </div>
    </StageProvider>
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
          className={cn(
            'theme-basic pointer-events-auto fixed z-[60] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background text-foreground shadow-lg',
            TOAST_POSITION_CLASSES[presentation.position],
          )}
          style={{ width: overlay.stageWidth }}
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


/** Reuses the editor canvas so responsive styles use the screen dimensions. */
function ScreenThumbnail({ screen }: { screen: Screen }) {
  const width = Math.max(1, screen.stageWidth);
  const height = screen.stageHeight ?? ARTBOARD_MIN_HEIGHT;
  const scale = Math.min(272 / width, 144 / Math.max(1, height));
  return (
    <span aria-hidden="true" inert className="pointer-events-none flex h-36 w-full items-center justify-center overflow-hidden rounded border border-white/10 bg-white/5">
      <span className="block shrink-0 overflow-hidden" style={{ width: width * scale, height: height * scale }}>
        <StageProvider initialWidth={width}>
          <Editor resolver={resolver} enabled={false}>
            <CanvasFrame width={width} height={height} zoom={scale} reportDocument={false} title={`Preview of ${screen.name}`}>
              <Frame data={screen.layout} />
            </CanvasFrame>
          </Editor>
        </StageProvider>
      </span>
    </span>
  );
}
