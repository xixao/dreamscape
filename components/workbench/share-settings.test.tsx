import { beforeEach, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareSettings } from './share-settings';
const props = { storageKey: 'share-test', currentScreenId: 'a', pages: [{ id: 'p', name: 'Main' }, { id: 'q', name: 'Checkout' }], screens: [{ id: 'a', name: 'Home', pageId: 'p', layout: '{}', stageWidth: 400 }, { id: 'b', name: 'Payment', pageId: 'q', layout: '{}', stageWidth: 400 }] };
beforeEach(() => localStorage.clear());
it('configures the start, navigation and independent screen permissions and restores the draft', async () => {
  const user = userEvent.setup();
  const view = render(<ShareSettings {...props} />);
  await user.click(screen.getByRole('combobox', { name: 'Starting point' }));
  await user.click(screen.getByRole('option', { name: 'Checkout · Payment' }));
  await user.click(screen.getByRole('switch', { name: 'Comments for Main · Home' }));
  expect(screen.getByRole('switch', { name: 'Comments for Checkout · Payment' })).toHaveAttribute('aria-checked', 'false');
  await user.click(screen.getByRole('combobox', { name: 'Approval' }));
  await user.click(screen.getByRole('option', { name: 'Per screen' }));
  await user.click(screen.getByRole('switch', { name: 'Approval for Checkout · Payment' }));
  await user.click(screen.getByRole('switch', { name: 'Show page navigation' }));
  view.unmount();
  render(<ShareSettings {...props} />);
  expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveTextContent('Checkout · Payment');
  expect(screen.getByRole('switch', { name: 'Comments for Main · Home' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('switch', { name: 'Approval for Checkout · Payment' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('switch', { name: 'Show page navigation' })).toHaveAttribute('aria-checked', 'false');
  await user.click(screen.getByRole('combobox', { name: 'Approval' }));
  await user.click(screen.getByRole('option', { name: 'Entire prototype' }));
  expect(screen.queryByRole('switch', { name: 'Approval for Checkout · Payment' })).not.toBeInTheDocument();
});
it('falls back to an available starting screen after the saved one is removed', () => {
  localStorage.setItem('share-test', JSON.stringify({ start: 'removed' }));
  render(<ShareSettings {...props} />);
  expect(screen.getByRole('combobox', { name: 'Starting point' })).toHaveTextContent('Main · Home');
});

it('copies a shared-view URL with the chosen starting screen', async () => {
  const user = userEvent.setup();
  render(<ShareSettings {...props} playHref="/f/example/play?page=p&screen=a&overlay=old" />);
  const field = screen.getByRole('textbox', { name: 'Prototype link' });
  expect(field).toHaveAttribute('readonly');
  await user.click(screen.getByRole('combobox', { name: 'Starting point' }));
  await user.click(screen.getByRole('option', { name: 'Checkout · Payment' }));
  await user.click(screen.getByRole('button', { name: 'Copy link' }));
  const copied = new URL(await navigator.clipboard.readText());
  expect(copied.searchParams.get('view')).toBe('shared');
  expect(copied.searchParams.get('screen')).toBe('b');
  expect(copied.searchParams.get('page')).toBe('q');
  expect(copied.searchParams.has('overlay')).toBe(false);
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
});
