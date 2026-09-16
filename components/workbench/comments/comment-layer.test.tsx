import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { CommentLayer, DEFAULT_STAGE_COMMENTS } from './comment-layer';

it('keeps an anchored marker attached when its element moves or resizes', async () => {
  let bounds = { left: 100, top: 120, width: 200, height: 80 };
  const thread = { id: 'n1', fileId: 'f1', number: 8, kind: 'annotation' as const, x: 0, y: 0, anchorNodeId: 'button', anchorOffset: { x: 0.5, y: 1 }, author: 'Designer', text: 'Keep centered', createdAt: new Date().toISOString(), replies: [] };
  const resolveAnchor = vi.fn(() => bounds);
  render(<CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[thread]} resolveAnchor={resolveAnchor} artboardRect={{ left: 0, top: 0, width: 1000, height: 800 }} zoom={1} />);
  const pin = await screen.findByRole('button', { name: 'Annotation 8' });
  await waitFor(() => expect(pin).toHaveStyle({ left: '200px', top: '172px' }));
  bounds = { left: 300, top: 200, width: 400, height: 100 };
  await waitFor(() => expect(pin).toHaveStyle({ left: '500px', top: '272px' }));
  fireEvent.pointerEnter(pin);
  expect(document.querySelector('.border-violet-400')).toHaveStyle({ left: '300px', width: '400px' });
});
