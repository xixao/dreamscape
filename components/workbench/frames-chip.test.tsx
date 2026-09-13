import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Screen } from '@/lib/files/repository';
import { FramesChip } from './frames-chip';

function makeFrame(id: string, overrides: Partial<Screen> = {}): Screen {
  return { id, name: `Frame ${id}`, layout: '{}', stageWidth: 1440, pageId: 'p1', ...overrides };
}

function renderChip(overrides: Partial<ComponentProps<typeof FramesChip>> = {}) {
  const frames = overrides.frames ?? [makeFrame('a', { name: 'Login' }), makeFrame('b', { name: 'Settings' })];
  const props: ComponentProps<typeof FramesChip> = {
    frames,
    currentFrameId: frames[0].id,
    onSwitch: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onZoomToFrame: vi.fn(),
    ...overrides,
  };
  render(<FramesChip {...props} />);
  return props;
}

describe('FramesChip', () => {
  it('renders a chip showing the current frame name and frame count in mono', () => {
    renderChip();
    const trigger = screen.getByRole('button', { name: 'Frames' });
    expect(trigger).toHaveTextContent('Login · 2');
  });

  it('opens a menu listing frames in order with the current one marked', async () => {
    renderChip();
    const trigger = screen.getByRole('button', { name: 'Frames' });
    await userEvent.click(trigger);

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveTextContent('Login');
    expect(items[1]).toHaveTextContent('Settings');
    expect(within(items[0]).getByTestId('frame-check')).toBeInTheDocument();
  });

  it('calls onSwitch and onZoomToFrame when clicking a frame in the menu', async () => {
    const props = renderChip();
    const trigger = screen.getByRole('button', { name: 'Frames' });
    await userEvent.click(trigger);
    const items = screen.getAllByRole('menuitem');
    await userEvent.click(items[1]);

    expect(props.onSwitch).toHaveBeenCalledWith('b');
    expect(props.onZoomToFrame).toHaveBeenCalledWith('b');
  });

  it('calls onAdd when the New frame item is clicked', async () => {
    const props = renderChip();
    const trigger = screen.getByRole('button', { name: 'Frames' });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New frame' }));

    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  describe('renaming', () => {
    it('menu Rename item opens an inline input that commits the trimmed name on Enter', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      const input = screen.getByLabelText('Frame name');
      await userEvent.clear(input);
      await userEvent.type(input, '  Sign in  {Enter}');

      expect(props.onRename).toHaveBeenCalledWith('a', 'Sign in');
      expect(screen.queryByLabelText('Frame name')).toBeNull();
    });

    it('Escape cancels the inline rename without calling onRename', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      const input = screen.getByLabelText('Frame name');
      await userEvent.type(input, ' renamed{Escape}');

      expect(props.onRename).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Frame name')).toBeNull();
    });

    it('does not call onRename when the value is unchanged after trimming', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });

      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      await userEvent.keyboard('{Enter}');
      expect(props.onRename).not.toHaveBeenCalled();
    });

    it('does not call onRename when the value is empty after trimming', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });

      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      const input = screen.getByLabelText('Frame name');
      await userEvent.clear(input);
      await userEvent.type(input, '   {Enter}');
      expect(props.onRename).not.toHaveBeenCalled();
    });

    it('leaves the input focused after opening Rename from the menu', async () => {
      renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      expect(screen.getByLabelText('Frame name')).toHaveFocus();
    });
  });

  describe('duplicate', () => {
    it('calls onDuplicate with the current frame id', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

      expect(props.onDuplicate).toHaveBeenCalledWith('a');
    });
  });

  describe('delete', () => {
    it('confirms before calling onDelete', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

      expect(await screen.findByText('Delete Login?')).toBeInTheDocument();
      expect(props.onDelete).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(props.onDelete).toHaveBeenCalledWith('a');
    });

    it('Cancel leaves the frame alone', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByText('Delete Login?')).toBeNull());
      expect(props.onDelete).not.toHaveBeenCalled();
    });

    it('is disabled when there is only one frame left', async () => {
      const props = renderChip({ frames: [makeFrame('a', { name: 'Login' })] });
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);

      const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
      expect(deleteItem).toHaveAttribute('aria-disabled', 'true');

      await userEvent.click(deleteItem);
      expect(screen.queryByText('Delete Login?')).toBeNull();
      expect(props.onDelete).not.toHaveBeenCalled();
    });
  });
});
