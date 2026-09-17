import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { SegmentedControl, SegmentedItem } from './segmented-control';

const originalAnimate = HTMLElement.prototype.animate;
afterEach(() => { HTMLElement.prototype.animate = originalAnimate; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(reduced = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
  HTMLElement.prototype.animate = animate;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const left = this.getAttribute('aria-label') === 'Second' ? 100 : 0;
    return { left, top: 0, width: 100, height: 28, right: left + 100, bottom: 28, x: left, y: 0, toJSON() {} };
  });
  return animate;
}
function Tabs({ value, continuityKey }: { value: string; continuityKey?: object }) {
  return <SegmentedControl value={value} continuityKey={continuityKey} aria-label="Modes"><SegmentedItem value="a" aria-label="First">A</SegmentedItem><SegmentedItem value="b" aria-label="Second">B</SegmentedItem></SegmentedControl>;
}
describe('sliding segmented highlight', () => {
  it('moves one highlight between selections without animating initial placement', () => {
    const animate = setup(); const view = render(<Tabs value="a" />);
    expect(animate).not.toHaveBeenCalled();
    view.rerender(<Tabs value="b" />);
    expect(animate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ transform: 'translate(0px, 0px)' }), expect.objectContaining({ transform: 'translate(100px, 0px)' })]), expect.objectContaining({ duration: 180 }));
    expect(screen.getByRole('radio', { name: 'Second' })).toHaveAttribute('aria-checked', 'true');
    expect(view.container.querySelectorAll('[data-segment-highlight]')).toHaveLength(1);
  });
  it('retains the previous position when a left-panel header is replaced', () => {
    const animate = setup(); const key = {};
    const view = render(<Tabs value="a" continuityKey={key} />); view.unmount();
    render(<Tabs value="b" continuityKey={key} />);
    expect(animate).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ transform: 'translate(0px, 0px)' })]), expect.any(Object));
  });
  it('ignores hidden Layers headers and resumes from the visible tab', () => {
    const animate = setup(); const key = {};
    const layers = render(<Tabs value="a" continuityKey={key} />);
    const rectMock = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    rectMock.mockReturnValue({ left: 0, top: 0, width: 0, height: 0 } as DOMRect);
    layers.rerender(<Tabs value="b" continuityKey={key} />);
    // Restore visible geometry for the newly mounted Chat header.
    rectMock.mockImplementation(function (this: Element) {
      return { left: this.getAttribute('aria-label') === 'Second' ? 100 : 0, top: 0, width: 100, height: 28 } as DOMRect;
    });
    const chat = render(<Tabs value="b" continuityKey={key} />);
    expect(animate).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ transform: 'translate(0px, 0px)' }), expect.objectContaining({ transform: 'translate(100px, 0px)' })]), expect.any(Object));
    chat.unmount();
    layers.rerender(<Tabs value="a" continuityKey={key} />);
    expect(animate).toHaveBeenLastCalledWith([expect.objectContaining({ transform: 'translate(100px, 0px)' }), expect.objectContaining({ transform: 'translate(0px, 0px)' })], expect.any(Object));
  });
  it('keeps the slide alive when React replays a newly mounted header effect', () => {
    const animate = setup(); const key = {};
    const layers = render(<StrictMode><Tabs value="a" continuityKey={key} /></StrictMode>);
    layers.unmount(); animate.mockClear();
    render(<StrictMode><Tabs value="b" continuityKey={key} /></StrictMode>);
    expect(animate).toHaveBeenCalledOnce();
    expect(animate.mock.results[0].value.cancel).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledWith([expect.objectContaining({ transform: 'translate(0px, 0px)' }), expect.objectContaining({ transform: 'translate(100px, 0px)' })], expect.any(Object));
  });
  it('updates selection without animation for reduced motion', () => {
    const animate = setup(true); const view = render(<Tabs value="a" />); view.rerender(<Tabs value="b" />);
    expect(animate).not.toHaveBeenCalled();
    expect((view.container.querySelector('[data-segment-highlight]') as HTMLElement).style.transform).toBe('translate(100px, 0px)');
  });
});
