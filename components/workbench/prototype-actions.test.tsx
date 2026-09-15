import { expect, it } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SharePrototypeButton } from './prototype-actions';

it('opens the existing configurable Share dialog from its toolbar button', async () => {
  render(<SharePrototypeButton playHref="/f/example/play?page=one&screen=two" />);
  await userEvent.click(screen.getByRole('button', { name: 'Share' }));
  const dialog = screen.getByRole('dialog', { name: 'Share prototype' });
  expect(within(dialog).getByRole('textbox', { name: 'Prototype link' })).toHaveAttribute('readonly');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
