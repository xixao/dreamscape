'use client';

import { Editor, Frame } from '@craftjs/core';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { resolver } from '@/components/blocks/registry';
import { LABEL } from '@/components/workbench/chrome';
import { StageProvider } from '@/components/workbench/stage-context';
import type { FileRecord } from '@/lib/files/repository';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { PlayProvider, type PlayContextValue } from './play-context';

interface PlayState {
  currentScreenId: string;
  // A real stack (spec: "a history stack for back"): every screen navigated
  // away from, most recent last, so `back` can pop it.
  history: string[];
  openDialogIds: ReadonlySet<string>;
}

type PlayAction =
  | { type: 'navigate'; screenId: string }
  | { type: 'back' }
  | { type: 'openDialog'; nodeId: string }
  | { type: 'closeDialog'; nodeId: string };

// A plain reducer (rather than a ref-juggled useCallback, as
// components/workbench/workbench.tsx uses for its own not-quite-comparable
// onNodesChange) so `navigate`/`back` never need to read a ref to see the
// screen they are currently leaving: the previous `state.currentScreenId`
// is simply the argument the reducer already has. Navigating or going back
// closes every open dialog: a dialog belongs to the screen it was opened
// from, so carrying its open state across a screen change would let it
// reappear if the visitor returns to that screen later.
function playReducer(state: PlayState, action: PlayAction): PlayState {
  switch (action.type) {
    case 'navigate': {
      if (action.screenId === state.currentScreenId) return state;
      return {
        currentScreenId: action.screenId,
        history: [...state.history, state.currentScreenId],
        openDialogIds: new Set(),
      };
    }
    case 'back': {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return { currentScreenId: previous, history: state.history.slice(0, -1), openDialogIds: new Set() };
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
    default:
      return state;
  }
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
 * sidesteps it the same way for the design-mode editor).
 */
export function Player({ file, initialScreenId }: { file: FileRecord; initialScreenId: string }) {
  const screens = useMemo(() => file.screens ?? [], [file.screens]);
  const validScreenIds = useMemo(() => new Set(screens.map((screen) => screen.id)), [screens]);
  const [state, dispatch] = useReducer(playReducer, {
    currentScreenId: initialScreenId,
    history: [],
    openDialogIds: new Set<string>(),
  });

  // Ignores a navigate interaction whose stored targetScreenId names a
  // screen that no longer exists (deleted in the editor after the
  // interaction was set up): state is left exactly as it was, rather than
  // dispatching and letting the render-time `?? screens[0]` fallback below
  // silently teleport to screen 1 while history/closeHref keep pointing at
  // the now-invalid id.
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

  const play = useMemo<PlayContextValue>(
    () => ({ mode: 'play', navigate, back, openDialog, closeDialog, isDialogOpen }),
    [navigate, back, openDialog, closeDialog, isDialogOpen],
  );

  const currentScreen = screens.find((screen) => screen.id === state.currentScreenId) ?? screens[0];
  const closeHref = `/f/${file.id}#s=${state.currentScreenId}`;

  // Read by the Escape handler below instead of closing over
  // state.openDialogIds directly: that effect is only re-subscribed when
  // closeHref changes (a screen switch), not on every dialog open/close, so
  // a plain closure would go stale the moment a dialog opens or closes
  // without a screen change.
  const openDialogIdsRef = useRef(state.openDialogIds);
  useEffect(() => {
    openDialogIdsRef.current = state.openDialogIds;
  }, [state.openDialogIds]);

  // Re-subscribed whenever closeHref changes (a screen switch) so the
  // handler always closes over the current link, rather than a ref written
  // during render - see workbench.tsx's own comment on why the latter trips
  // the react-hooks/refs lint rule and can even read stale in some cases.
  //
  // Radix's Dialog also dismisses on Escape via DismissableLayer's own
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
      if (event.defaultPrevented || openDialogIdsRef.current.size > 0) return;
      window.location.assign(closeHref);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeHref]);

  // Only reachable for a file whose screens array is empty, which
  // validateScreens (lib/files/validate.ts) never allows a real saved file
  // to have - defensive, not expected in production.
  if (!currentScreen) return null;

  return (
    <PlayProvider value={play}>
      <div className="theme-basic flex min-h-screen items-center justify-center overflow-auto bg-background p-8 text-foreground">
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
            <Editor resolver={resolver} enabled={false}>
              <Frame key={state.currentScreenId} data={currentScreen.layout} />
            </Editor>
          </div>
        </StageProvider>
        <div className="fixed top-3 right-3 z-50 flex items-center gap-3 rounded-md border border-(color:--bevel-line) bg-card px-3 py-1.5 shadow-panel-lg">
          <span className={cn(LABEL, 'text-t2')}>{currentScreen.name}</span>
          <span className={cn(LABEL, 'text-t4')}>Esc to exit</span>
          <a href={closeHref} className="text-t2 underline hover:no-underline">
            Close
          </a>
        </div>
      </div>
    </PlayProvider>
  );
}
