import { isEditableTarget } from '@/lib/dom';

export function bindCanvasDelete(doc: Document, remove: () => void) {
  const handler = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    event.preventDefault(); event.stopPropagation(); remove();
  };
  doc.addEventListener('keydown', handler);
  return () => doc.removeEventListener('keydown', handler);
}
