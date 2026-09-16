import { describe, expect, it } from 'vitest';
import { bindPreviewZoom } from './preview-zoom';

describe('builder preview zoom input', () => {
  it('handles zoom inside an iframe document and removes listeners on cleanup', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    let zoom = 1;
    const cleanup = bindPreviewZoom(doc, update => { zoom = update(zoom); });
    const key = new KeyboardEvent('keydown', { key: '=', ctrlKey: true, cancelable: true });
    doc.dispatchEvent(key);
    expect(zoom).toBe(1.25);
    expect(key.defaultPrevented).toBe(true);
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: '-', ctrlKey: true }));
    expect(zoom).toBe(1);
    doc.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -20 }));
    expect(zoom).toBeGreaterThan(1);
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true }));
    expect(zoom).toBe(1);
    cleanup();
    doc.dispatchEvent(key);
    expect(zoom).toBe(1);
    iframe.remove();
  });
  it('preserves ordinary scrolling and clamps repeated zoom gestures', () => {
    const host = document.createElement('div');
    let zoom = 1;
    const cleanup = bindPreviewZoom(host, update => { zoom = update(zoom); });
    const scroll = new WheelEvent('wheel', { deltaY: 20, cancelable: true });
    host.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    expect(zoom).toBe(1);
    host.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -10000 }));
    expect(zoom).toBe(4);
    host.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 10000 }));
    expect(zoom).toBe(0.1);
    cleanup();
  });
});
it('Command plus/minus changes canvas zoom and cancels browser page zoom', () => {
  const host = document.createElement('div');
  let zoom = 1;
  const cleanup = bindPreviewZoom(host, update => { zoom = update(zoom); });
  const plus = new KeyboardEvent('keydown', { key: '+', code: 'Equal', metaKey: true, shiftKey: true, cancelable: true });
  host.dispatchEvent(plus);
  expect(plus.defaultPrevented).toBe(true);
  expect(zoom).toBe(1.25);
  const minus = new KeyboardEvent('keydown', { key: '-', metaKey: true, cancelable: true });
  host.dispatchEvent(minus);
  expect(minus.defaultPrevented).toBe(true);
  expect(zoom).toBe(1);
  cleanup();
});
