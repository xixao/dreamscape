import { afterEach, expect, it, vi } from 'vitest';
import { exitPreview } from './exit-preview';
afterEach(() => vi.unstubAllGlobals());
it('closes an editor-opened preview tab', () => {
  const assign = vi.fn();
  const browser = { closed: false, close: vi.fn(() => { browser.closed = true; }), location: { assign } };
  vi.stubGlobal('window', browser);
  exitPreview('/f/example', true);
  expect(browser.close).toHaveBeenCalledOnce();
  expect(assign).not.toHaveBeenCalled();
});
it('returns to the editor when the browser refuses to close a directly opened tab', () => {
  const assign = vi.fn();
  vi.stubGlobal('window', { closed: false, close: vi.fn(), location: { assign } });
  exitPreview('/f/example', true);
  expect(assign).toHaveBeenCalledWith('/f/example');
});
