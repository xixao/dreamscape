import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareSettings } from './share-settings';
const props = { storageKey: 'share-test', currentScreenId: 'a', pages: [{ id: 'p', name: 'Main' }, { id: 'q', name: 'Checkout' }], screens: [{ id: 'a', name: 'Home', pageId: 'p', layout: '{}', stageWidth: 400 }, { id: 'b', name: 'Payment', pageId: 'q', layout: '{}', stageWidth: 400 }] };
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('configures the start and browsing preference and restores the draft', async () => {
  const user = userEvent.setup();
  const view = render(<ShareSettings {...props} />);
  await user.click(screen.getByRole('combobox', { name: 'Start review on' }));
  await user.click(screen.getByRole('option', { name: 'Checkout · Payment' }));
  await user.click(screen.getByRole('switch', { name: 'Let viewers browse' }));
  view.unmount();
  render(<ShareSettings {...props} />);
  expect(screen.getByRole('combobox', { name: 'Start review on' })).toHaveTextContent('Checkout · Payment');
  expect(screen.getByRole('switch', { name: 'Let viewers browse' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('combobox', { name: 'Start review on' })).toHaveTextContent('Checkout · Payment');
});
it('falls back to an available starting screen after the saved one is removed', () => {
  localStorage.setItem('share-test', JSON.stringify({ start: 'removed' }));
  render(<ShareSettings {...props} />);
  expect(screen.getByRole('combobox', { name: 'Start review on' })).toHaveTextContent('Main · Home');
});

it('copies a shared-view URL with the chosen starting screen', async () => {
  const user = userEvent.setup();
  render(<ShareSettings {...props} playHref="/f/example/play?page=p&screen=a&overlay=old" />);
  const field = screen.getByRole('textbox', { name: 'Prototype link' });
  expect(field).toHaveAttribute('readonly');
  await user.click(screen.getByRole('combobox', { name: 'Start review on' }));
  await user.click(screen.getByRole('option', { name: 'Checkout · Payment' }));
  await user.click(screen.getByRole('button', { name: 'Copy link' }));
  const copied = new URL(await navigator.clipboard.readText());
  expect(copied.searchParams.get('view')).toBe('shared');
  expect(copied.searchParams.get('screen')).toBe('b');
  expect(copied.searchParams.get('page')).toBe('q');
  expect(copied.searchParams.has('overlay')).toBe(false);
  expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
});

it('saves only explicitly selected context before copying the recipient link', async () => {
  const { saveReview, screenArtifact } = await import('@/lib/presentation/model');
  const user = userEvent.setup();
  const artifact = screenArtifact(props.screens[0]);
  artifact.context.rationale = 'Explicitly shared rationale';
  saveReview(localStorage, 'example', { version: 1, artifacts: [artifact] });
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  const save = vi.fn(async (_review: import('@/lib/presentation/model').SharedReview) => { void _review; expect(write).not.toHaveBeenCalled(); });
  render(<ShareSettings {...props} fileId="example" playHref="/f/example/play" onSaveSharedReview={save} />);
  await user.click(screen.getByRole('radio', { name: /Research Review/ }));
  await user.click(screen.getByRole('button', { name: 'Save & copy link' }));
  expect(save.mock.calls[0][0]).toMatchObject({ preset: 'research', artifacts: [] });
  write.mockClear();
  await user.click(screen.getByRole('checkbox', { name: /Home.*screen/ }));
  await user.click(screen.getByRole('button', { name: 'Save & copy link' }));
  expect(save.mock.calls[1][0]).toMatchObject({ artifacts: [artifact] });
  expect(write).toHaveBeenCalledWith(expect.stringContaining('view=shared'));
});

it('does not copy an unsaved review after a persistence failure', async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  render(<ShareSettings {...props} playHref="/f/example/play" onSaveSharedReview={async () => { throw new Error('Save conflict: reload first'); }} />);
  await user.click(screen.getByRole('button', { name: 'Save & copy link' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Save conflict: reload first');
  expect(write).not.toHaveBeenCalled();
  expect(screen.getByText('Changes not shared')).toBeInTheDocument();
});

it('opens an existing review without reporting stale draft changes', async () => {
  const { sharedReviewSchema } = await import('@/lib/presentation/model');
  const sharedReview = sharedReviewSchema.parse({ version: 1, preset: 'business', start: 'a', navigation: true, capabilities: ['context.read', 'focus', 'prototype'], artifacts: [], approval: 'off', comments: {}, approvals: {} });
  localStorage.setItem('share-test', JSON.stringify({ ...sharedReview, preset: 'design', start: 'b' }));
  render(<ShareSettings {...props} playHref="/f/example/play" sharedReview={sharedReview} onSaveSharedReview={async () => {}} />);
  expect(screen.getByText('Ready to share')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Stakeholder Review/ })).toBeChecked();
});
