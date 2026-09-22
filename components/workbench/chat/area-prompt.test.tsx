import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AreaPrompt } from './area-prompt';
import { beginSelectionRequest, setChatSelection, useChatSelection } from './selection-chip';
vi.mock('@craftjs/core', () => { const query = { getNodes: () => ({}) }; return { useEditor: () => ({ query }) }; });
vi.mock('../canvas', () => ({ useCanvasViewport: () => ({ viewport: { x: 0, y: 0, zoom: 1 } }) }));
vi.mock('../canvas-frame', () => ({ useCanvasDocument: () => null }));
const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
function Draft({ id }: { id: string }) { return <span data-testid="count">{useChatSelection(id).length}</span>; }
it('Escape clears a completed lasso and composer selection', () => {
  setChatSelection('escape-lasso', [{ id: 'card', name: 'Card' }], polygon);
  render(<><AreaPrompt fileId="escape-lasso" onCapture={() => {}} /><Draft id="escape-lasso" /></>);
  expect(screen.getByTestId('pending-lasso-highlight')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByTestId('pending-lasso-highlight')).toBeNull();
  expect(screen.getByTestId('count').textContent).toBe('0');
});
it('Escape dismisses a pending outline without allowing a late response to clear a new selection', () => {
  setChatSelection('escape-pending', [{ id: 'card', name: 'Card' }], polygon);
  const finish = beginSelectionRequest('escape-pending');
  setChatSelection('escape-pending', []);
  render(<AreaPrompt fileId="escape-pending" onCapture={() => {}} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByTestId('pending-lasso-highlight')).toBeNull();
  act(() => { setChatSelection('escape-pending', [{ id: 'next', name: 'Next' }], polygon); finish(); });
  expect(screen.getByTestId('pending-lasso-highlight')).toBeTruthy();
});
