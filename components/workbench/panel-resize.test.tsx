import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PanelResize, useLeftPanelWidth } from './panel-resize';
function Panel() { const [width, setWidth] = useLeftPanelWidth(); return <PanelResize width={width} onChange={setWidth} />; }
beforeEach(() => localStorage.clear());
it('bounds dragging, supports keyboard adjustments, and restores the shared width', () => {
  const view = render(<Panel />);
  const handle = screen.getByRole('separator');
  handle.setPointerCapture = vi.fn();
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 256 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 900 });
  expect(handle).toHaveAttribute('aria-valuenow', '400');
  fireEvent.pointerUp(handle, { pointerId: 1 });
  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  expect(handle).toHaveAttribute('aria-valuenow', '392');
  view.unmount();
  render(<Panel />);
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '392');
  fireEvent.doubleClick(screen.getByRole('separator'));
  expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '256');
});
