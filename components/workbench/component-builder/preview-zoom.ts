import { clampZoom, nextZoomStep } from '@/lib/canvas/viewport';
import { matchShortcut } from '@/lib/shortcuts';

export type PreviewZoomChange = (update: (current: number) => number) => void;

// Iframe events do not bubble to the builder document. Bind the same controls
// to the preview documents and the builder surface, with symmetric cleanup.
export function bindPreviewZoom(target: HTMLElement | Document, change: PreviewZoomChange) {
  const keydown = (raw: Event) => {
    const event = raw as KeyboardEvent;
    const shortcut = matchShortcut(event);
    if (!['zoom-in', 'zoom-out', 'zoom-reset', 'zoom-to-fit'].includes(shortcut ?? '')) return;
    if (shortcut === 'zoom-to-fit' && (event.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable=true]')) return;
    event.preventDefault();
    event.stopPropagation();
    change(current => shortcut === 'zoom-in' ? nextZoomStep(current, 'in')
      : shortcut === 'zoom-out' ? nextZoomStep(current, 'out') : 1);
  };
  const wheel = (raw: Event) => {
    const event = raw as WheelEvent;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    change(current => clampZoom(current * Math.exp(-event.deltaY * 0.01)));
  };
  target.addEventListener('keydown', keydown);
  target.addEventListener('wheel', wheel, { passive: false });
  return () => {
    target.removeEventListener('keydown', keydown);
    target.removeEventListener('wheel', wheel);
  };
}
