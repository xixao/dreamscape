import { describe, it, expect, vi } from 'vitest';
import { bindCanvasDelete } from './delete-key';

describe('canvas Delete key', () => {
  it('handles both Delete keys inside an iframe and cleans up', () => {
    const iframe = document.createElement('iframe'); document.body.append(iframe);
    const doc = iframe.contentDocument!; const remove = vi.fn();
    const cleanup = bindCanvasDelete(doc, remove);
    for (const key of ['Delete', 'Backspace']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      doc.body.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    }
    expect(remove).toHaveBeenCalledTimes(2);
    cleanup(); doc.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(remove).toHaveBeenCalledTimes(2); iframe.remove();
  });
  it('preserves typing, composition, and modified shortcuts', () => {
    const remove = vi.fn(); const cleanup = bindCanvasDelete(document, remove);
    for (const tag of ['input', 'textarea']) {
      const input = document.createElement(tag); document.body.append(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); input.remove();
    }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, isComposing: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, metaKey: true }));
    expect(remove).not.toHaveBeenCalled(); cleanup();
  });
});
