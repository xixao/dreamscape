import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Screen } from '@/lib/files/repository';
import { ScreensStrip } from './screens-strip';

function makeScreen(id: string, overrides: Partial<Screen> = {}): Screen {
  return { id, name: `Frame ${id}`, layout: '{}', stageWidth: 1440, ...overrides };
}

function renderStrip(overrides: Partial<ComponentProps<typeof ScreensStrip>> = {}) {
  const screens = overrides.screens ?? [makeScreen('a', { name: 'Login' }), makeScreen('b', { name: 'Settings' })];
  const props: ComponentProps<typeof ScreensStrip> = {
    screens,
    currentScreenId: screens[0].id,
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<ScreensStrip {...props} />);
  return props;
}

describe('ScreensStrip', () => {
  it('renders a tablist with one tab per screen, the current one marked selected', () => {
    renderStrip();
    const tablist = screen.getByRole('tablist', { name: 'Screens' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Login', 'Settings']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect with the clicked screen id', async () => {
    const props = renderStrip();
    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(props.onSelect).toHaveBeenCalledWith('b');
  });

  it('calls onAdd when the New screen button is clicked', async () => {
    const props = renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'New screen' }));
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  describe('renaming', () => {
    it('double-clicking a chip switches it to an inline input that commits the trimmed name on Enter', async () => {
      const props = renderStrip();
      await userEvent.dblClick(screen.getByRole('tab', { name: 'Login' }));

      const input = screen.getByLabelText('Screen name');
      await userEvent.clear(input);
      await userEvent.type(input, '  Sign in  {Enter}');

      expect(props.onRename).toHaveBeenCalledWith('a', 'Sign in');
      expect(screen.queryByLabelText('Screen name')).toBeNull();
    });

    it('Escape cancels the inline rename without calling onRename', async () => {
      const props = renderStrip();
      await userEvent.dblClick(screen.getByRole('tab', { name: 'Login' }));
      const input = screen.getByLabelText('Screen name');
      await userEvent.type(input, ' renamed{Escape}');

      expect(props.onRename).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Screen name')).toBeNull();
      expect(screen.getByRole('tab', { name: 'Login' })).toBeInTheDocument();
    });

    it('does not call onRename when the value is unchanged or empty after trimming', async () => {
      const props = renderStrip();
      await userEvent.dblClick(screen.getByRole('tab', { name: 'Login' }));
      await userEvent.keyboard('{Enter}');
      expect(props.onRename).not.toHaveBeenCalled();

      await userEvent.dblClick(screen.getByRole('tab', { name: 'Login' }));
      const input = screen.getByLabelText('Screen name');
      await userEvent.clear(input);
      await userEvent.type(input, '   {Enter}');
      expect(props.onRename).not.toHaveBeenCalled();
    });

    it('the chevron menu\'s Rename item also opens the inline input', async () => {
      renderStrip();
      await userEvent.click(screen.getByRole('button', { name: 'Login menu' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      expect(screen.getByLabelText('Screen name')).toHaveValue('Login');
    });
  });

  describe('duplicate', () => {
    it('calls onDuplicate with the screen id from the chevron menu', async () => {
      const props = renderStrip();
      await userEvent.click(screen.getByRole('button', { name: 'Login menu' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
      expect(props.onDuplicate).toHaveBeenCalledWith('a');
    });
  });

  describe('delete', () => {
    it('confirms before calling onDelete', async () => {
      const props = renderStrip();
      await userEvent.click(screen.getByRole('button', { name: 'Login menu' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

      expect(await screen.findByText('Delete Login?')).toBeInTheDocument();
      expect(props.onDelete).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(props.onDelete).toHaveBeenCalledWith('a');
    });

    it('Cancel leaves the screen alone', async () => {
      const props = renderStrip();
      await userEvent.click(screen.getByRole('button', { name: 'Login menu' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByText('Delete Login?')).toBeNull());
      expect(props.onDelete).not.toHaveBeenCalled();
    });

    it('is disabled when there is only one screen left', async () => {
      const props = renderStrip({ screens: [makeScreen('a', { name: 'Login' })], currentScreenId: 'a' });
      await userEvent.click(screen.getByRole('button', { name: 'Login menu' }));

      const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
      expect(deleteItem).toHaveAttribute('aria-disabled', 'true');

      await userEvent.click(deleteItem);
      expect(screen.queryByText('Delete Login?')).toBeNull();
      expect(props.onDelete).not.toHaveBeenCalled();
    });
  });
});
