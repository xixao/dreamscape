'use client';

import { createPortal } from 'react-dom';
import type { CommentThread } from '@/lib/comments/store';
import { toScreenPoint, type Rect } from '@/lib/comments/geometry';
import { cn } from '@/lib/utils';
import { CommentComposer } from './comment-composer';
import { CommentThreadPopover } from './comment-thread';

// The offset the composer/thread popovers sit at from their anchor pin, the
// same idea as layer-stack-menu.tsx's own MENU_OFFSET (a small nudge so the
// popover does not sit flush under the cursor/pin).
const POPOVER_OFFSET = 10;

export interface PendingPin {
  x: number;
  y: number;
  anchorNodeId?: string;
}

/**
 * Everything the comments feature needs from whoever owns its state
 * (WorkbenchShell in components/workbench/workbench.tsx). Stage receives
 * this as a single prop and forwards it into CommentLayer alongside the
 * `zoom`/`artboardRect` it measures itself - the same pass-through shape
 * Stage already uses for the screens-strip props.
 */
export interface StageCommentsProps {
  dismissEmptyOnOutsideClick?: boolean;
  commentMode: boolean;
  threads: CommentThread[];
  pendingPin: PendingPin | null;
  openThreadId: string | null;
  authorName: string | null;
  onPlacePin: (x: number, y: number, anchorNodeId: string | undefined) => void;
  onCancelPending: () => void;
  onSubmitComment: (input: { author: string; text: string }) => void;
  onPinClick: (threadId: string) => void;
  onCloseThread: () => void;
  onSubmitReply: (threadId: string, input: { author: string; text: string }) => void;
  onResolveThread: (threadId: string) => void;
}

// Stage's own tests (stage.test.tsx) predate comments and never pass a
// `comments` prop; this default keeps them rendering an inert, empty layer
// with no behavior change instead of every call site needing an update.
export const DEFAULT_STAGE_COMMENTS: StageCommentsProps = {
  commentMode: false,
  threads: [],
  pendingPin: null,
  openThreadId: null,
  authorName: null,
  onPlacePin: () => {},
  onCancelPending: () => {},
  onSubmitComment: () => {},
  onPinClick: () => {},
  onCloseThread: () => {},
  onSubmitReply: () => {},
  onResolveThread: () => {},
};

function Pin({
  number,
  x,
  y,
  artboardRect,
  zoom,
  pending,
  onClick,
}: {
  number: number | null;
  x: number;
  y: number;
  artboardRect: Rect;
  zoom: number;
  pending?: boolean;
  onClick?: () => void;
}) {
  const point = toScreenPoint(x, y, artboardRect, zoom);
  return (
    <button
      type="button"
      aria-label={number === null ? 'New comment' : `Comment ${number}`}
      style={{
        position: 'fixed',
        // The circle's bottom-left corner sits at the point (spec: "a small
        // tail"), so it reads like a pin whose tip touches the exact spot
        // rather than a dot centered on it.
        left: point.x,
        top: point.y - 24,
        pointerEvents: 'auto',
      }}
      className={cn(
        'flex size-6 items-center justify-center rounded-full rounded-bl-none bg-primary font-mono text-[11px] font-semibold text-white shadow-panel',
        pending && 'opacity-70',
      )}
      onClick={onClick}
    >
      {number ?? ''}
    </button>
  );
}

/**
 * The pin overlay plus the composer/thread popovers (spec
 * docs/superpowers/specs/2026-09-12-folders-and-comments-design.md section 5).
 * Rendered by Stage inside the zoom wrapper for colocation, but everything
 * it draws is portaled to `document.body` and positioned in real (fixed)
 * screen coordinates computed from `artboardRect`/`zoom` - not by inheriting
 * the wrapper's CSS `zoom`. That keeps this component correct regardless of
 * where in the DOM it is mounted, which is exactly what lets it move to the
 * parent document unchanged once the artboard becomes an iframe (see
 * docs/superpowers/specs/2026-09-12-responsive-canvas-design.md): only how
 * `artboardRect` is measured will need to change, in Stage, not here.
 */
export function CommentLayer(props: StageCommentsProps & { zoom: number; artboardRect: Rect | null }) {
  const { threads, pendingPin, openThreadId, artboardRect, zoom } = props;

  if (!artboardRect || typeof document === 'undefined') return null;

  const openIndex = threads.findIndex((thread) => thread.id === openThreadId);
  const openThread = openIndex === -1 ? null : threads[openIndex];

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40">
      {threads.map((thread, index) => (
        <Pin
          key={thread.id}
          number={index + 1}
          x={thread.x}
          y={thread.y}
          artboardRect={artboardRect}
          zoom={zoom}
          onClick={() => props.onPinClick(thread.id)}
        />
      ))}
      {pendingPin && (
        <Pin number={null} pending x={pendingPin.x} y={pendingPin.y} artboardRect={artboardRect} zoom={zoom} />
      )}
      {pendingPin &&
        (() => {
          const anchor = toScreenPoint(pendingPin.x, pendingPin.y, artboardRect, zoom);
          return (
            <CommentComposer
              anchor={{ x: anchor.x + POPOVER_OFFSET, y: anchor.y + POPOVER_OFFSET }}
              authorName={props.authorName}
              dismissEmptyOnOutsideClick={props.dismissEmptyOnOutsideClick}
              onCancel={props.onCancelPending}
              onSubmit={props.onSubmitComment}
            />
          );
        })()}
      {openThread &&
        (() => {
          const anchor = toScreenPoint(openThread.x, openThread.y, artboardRect, zoom);
          return (
            <CommentThreadPopover
              thread={openThread}
              number={openIndex + 1}
              anchor={{ x: anchor.x + POPOVER_OFFSET, y: anchor.y + POPOVER_OFFSET }}
              authorName={props.authorName}
              onClose={props.onCloseThread}
              onResolve={() => props.onResolveThread(openThread.id)}
              onReply={(input) => props.onSubmitReply(openThread.id, input)}
            />
          );
        })()}
    </div>,
    document.body,
  );
}
