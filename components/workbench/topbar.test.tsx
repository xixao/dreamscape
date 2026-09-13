import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Frame, ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import type { SaveState } from '@/lib/persistence';
import { renderInEditor } from '@/test/craft-harness';
import { Topbar, stageReadout } from './topbar';

function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
}

function renderTopbar(
  overrides: Partial<ComponentProps<typeof Topbar>> = {},
  options?: { width?: number },
) {
  const onRename = overrides.onRename ?? vi.fn();
  const onNew = overrides.onNew ?? vi.fn();
  const onToggleChat = overrides.onToggleChat ?? vi.fn();
  const props: ComponentProps<typeof Topbar> = {
    fileName: 'Untitled',
    saveState: 'saved',
    fileId: 'file123abc',
    folderId: null,
    currentScreenId: 'screen0001',
    chatOpen: false,
    ...overrides,
    onRename,
    onNew,
    onToggleChat,
  };
  return { ...renderInEditor(<Topbar {...props} />, options), onRename, onNew, onToggleChat };
}

describe('stageReadout', () => {
  it('shows width, breakpoint and zoom only when scaled', () => {
    expect(stageReadout(1440, 'desktop', 1)).toBe('1440 px · desktop');
    expect(stageReadout(375, 'mobile', 1)).toBe('375 px · mobile');
    expect(stageReadout(1440, 'desktop', 0.72)).toBe('1440 px · desktop · 72%');
  });

  it('shows the device name and its width x height instead, when given', () => {
    expect(stageReadout(402, 'mobile', 1, { name: 'iPhone 16 & 17 Pro', height: 874 })).toBe(
      'iPhone 16 & 17 Pro · 402 × 874',
    );
    expect(stageReadout(402, 'mobile', 0.63, { name: 'iPhone 16 & 17 Pro', height: 874 })).toBe(
      'iPhone 16 & 17 Pro · 402 × 874 · 63%',
    );
  });
});

describe('Topbar', () => {
  it('marks the active preset and switches width on click', async () => {
    renderTopbar({}, { width: 1440 });
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px · desktop');
    expect(presetButton('Desktop')).toHaveAttribute('data-state', 'on');
    expect(presetButton('Mobile')).toHaveAttribute('data-state', 'off');

    await userEvent.click(presetButton('Tablet'));
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('768 px · desktop');
    expect(presetButton('Tablet')).toHaveAttribute('data-state', 'on');

    await userEvent.click(presetButton('Mobile'));
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('375 px · mobile');
  });

  it('shows no active preset at a custom width', () => {
    renderTopbar({}, { width: 900 });
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('900 px · desktop');
    for (const label of ['Mobile', 'Tablet', 'Desktop']) {
      expect(presetButton(label)).toHaveAttribute('data-state', 'off');
    }
  });

  it('enables Undo and Redo as the history changes', async () => {
    const { editor } = renderInEditor(
      <>
        <Frame data={emptyLayoutJson()} />
        <Topbar
          fileName="Untitled"
          onRename={() => {}}
          saveState="saved"
          onNew={() => {}}
          fileId="file123abc"
          folderId={null}
          currentScreenId="screen0001"
          chatOpen={false}
          onToggleChat={() => {}}
        />
      </>,
    );
    await screen.findByText('This frame is empty');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    editor().actions.setProp(ROOT_NODE, (props: { gap: number }) => {
      props.gap = 8;
    });
    await waitFor(() => expect(undo).toBeEnabled());

    await userEvent.click(undo);
    await waitFor(() => expect(redo).toBeEnabled());
    expect(undo).toBeDisabled();
  });

  it('calls onNew', async () => {
    const { onNew } = renderTopbar();
    await userEvent.click(screen.getByRole('button', { name: 'New frame' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('has a ghost link back to Files before the product name, at the top level when the file has no folder', () => {
    renderTopbar({ folderId: null });
    expect(screen.getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/');
  });

  it('links back to the file\'s folder when it has one', () => {
    renderTopbar({ folderId: 'folder0001' });
    expect(screen.getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/folders/folder0001');
  });

  describe('Present', () => {
    it('is a ghost icon link opening the play route for the current screen in a new tab', () => {
      renderTopbar({ fileId: 'file123abc', currentScreenId: 'screen0002' });
      const present = screen.getByRole('link', { name: 'Present' });
      expect(present).toHaveAttribute('href', '/f/file123abc/play?screen=screen0002');
      expect(present).toHaveAttribute('target', '_blank');
      expect(present).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });
  });

  describe('file name field', () => {
    it('commits a trimmed name on Enter', async () => {
      const { onRename } = renderTopbar({ fileName: 'Untitled' });
      const field = screen.getByTestId('file-name');
      await userEvent.clear(field);
      await userEvent.type(field, '  My design  {enter}');
      expect(onRename).toHaveBeenCalledWith('My design');
    });

    it('commits on blur', async () => {
      const { onRename } = renderTopbar({ fileName: 'Untitled' });
      const field = screen.getByTestId('file-name');
      await userEvent.clear(field);
      await userEvent.type(field, 'Renamed');
      fireEvent.blur(field);
      expect(onRename).toHaveBeenCalledWith('Renamed');
    });

    it('reverts on Escape without committing', async () => {
      const { onRename } = renderTopbar({ fileName: 'Untitled' });
      const field = screen.getByTestId('file-name') as HTMLInputElement;
      await userEvent.clear(field);
      await userEvent.type(field, 'Discard me');
      await userEvent.keyboard('{Escape}');
      expect(field.value).toBe('Untitled');
      expect(onRename).not.toHaveBeenCalled();
    });

    it('reverts when emptied', async () => {
      const { onRename } = renderTopbar({ fileName: 'Untitled' });
      const field = screen.getByTestId('file-name') as HTMLInputElement;
      await userEvent.clear(field);
      await userEvent.type(field, '{enter}');
      expect(field.value).toBe('Untitled');
      expect(onRename).not.toHaveBeenCalled();
    });

    it('caps the committed name at 120 characters', () => {
      const { onRename } = renderTopbar({ fileName: 'Untitled' });
      const field = screen.getByTestId('file-name');
      const long = 'x'.repeat(150);
      // fireEvent.change bypasses the maxLength attribute, exercising the
      // defensive cap in the commit logic itself rather than the DOM's own.
      fireEvent.change(field, { target: { value: long } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(onRename).toHaveBeenCalledWith('x'.repeat(120));
    });
  });

  describe('save state', () => {
    const CASES: Array<{ state: SaveState; text: string }> = [
      { state: 'saved', text: 'Saved' },
      { state: 'saving', text: 'Saving' },
      { state: 'error', text: 'Save failed, retrying' },
      { state: 'conflict', text: 'Someone else changed this file.' },
    ];

    it.each(CASES)('shows "$text" for $state', ({ state, text }) => {
      renderTopbar({ saveState: state });
      expect(screen.getByTestId('save-state')).toHaveTextContent(text);
    });

    it('shows no Reload button unless the state is conflict', () => {
      renderTopbar({ saveState: 'error' });
      expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    });

    it('shows a Reload button on conflict that reloads the page', async () => {
      renderTopbar({ saveState: 'conflict' });
      const reloadSpy = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('shows the notice instead of the save state when provided', () => {
      renderTopbar({
        saveState: 'saving',
        notice: 'The saved design could not be read; this file starts empty.',
      });
      expect(screen.getByTestId('save-state')).toHaveTextContent(
        'The saved design could not be read; this file starts empty.',
      );
      expect(screen.queryByText('Saving')).toBeNull();
    });
  });

  describe('Chat toggle', () => {
    it('reflects chatOpen through aria-pressed', () => {
      renderTopbar({ chatOpen: false });
      expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('is pressed when chatOpen is true', () => {
      renderTopbar({ chatOpen: true });
      expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('calls onToggleChat when clicked', async () => {
      const { onToggleChat } = renderTopbar({ chatOpen: false });
      await userEvent.click(screen.getByRole('button', { name: 'Chat' }));
      expect(onToggleChat).toHaveBeenCalledTimes(1);
    });

    // The left column (the Components tray) went away in
    // docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md section 1,
    // so the top bar now spans 2 columns without chat and 3 with it (one
    // fewer than before either way), regardless of whether the right panel
    // is minimized - collapsing it only narrows that column, it does not
    // remove it.
    it('spans 2 columns when chat is closed and 3 when it is open', () => {
      const { unmount } = renderTopbar({ chatOpen: false });
      expect(screen.getByRole('button', { name: 'Chat' }).closest('header')).toHaveClass('col-span-2');
      unmount();

      renderTopbar({ chatOpen: true });
      expect(screen.getByRole('button', { name: 'Chat' }).closest('header')).toHaveClass('col-span-3');
    });
  });

  describe('device presets', () => {
    it('shows "Device" on the chip and the plain width readout when none is set', () => {
      renderTopbar({}, { width: 1440 });
      expect(screen.getByRole('button', { name: 'Frame size presets' })).toHaveTextContent('Device');
      expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px · desktop');
    });

    it('has aria-haspopup="menu" on the chip', () => {
      renderTopbar();
      expect(screen.getByRole('button', { name: 'Frame size presets' })).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('lists Figma device groups; choosing a device sets the readout, the chip label and the matching segment', async () => {
      renderTopbar({}, { width: 1440 });

      await userEvent.click(screen.getByRole('button', { name: 'Frame size presets' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Phone' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'iPhone 16 & 17 Pro' }));

      expect(screen.getByTestId('stage-readout')).toHaveTextContent('iPhone 16 & 17 Pro · 402 × 874');
      expect(presetButton('Mobile')).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('button', { name: 'Frame size presets' })).toHaveTextContent('iPhone 16 & 17 Pro');
    });

    it('selects the Tablet segment for a Tablet-group device and Desktop for a Desktop-group device', async () => {
      renderTopbar({}, { width: 1440 });

      await userEvent.click(screen.getByRole('button', { name: 'Frame size presets' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Tablet' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'iPad Pro 11"' }));
      expect(presetButton('Tablet')).toHaveAttribute('data-state', 'on');

      await userEvent.click(screen.getByRole('button', { name: 'Frame size presets' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Desktop' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'MacBook Air' }));
      expect(presetButton('Desktop')).toHaveAttribute('data-state', 'on');
      expect(presetButton('Tablet')).toHaveAttribute('data-state', 'off');
    });

    it('marks the current device with a check mark in the menu, and no other device', async () => {
      renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByRole('button', { name: 'Frame size presets' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Phone' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'iPhone 16 & 17 Pro' }));

      await userEvent.click(screen.getByRole('button', { name: 'Frame size presets' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Phone' }));

      const chosen = await screen.findByRole('menuitem', { name: 'iPhone 16 & 17 Pro' });
      const other = screen.getByRole('menuitem', { name: 'iPhone 16' });
      expect(within(chosen).getByTestId('device-check')).toBeInTheDocument();
      expect(within(other).queryByTestId('device-check')).toBeNull();
    });

    it('clicking a Mobile/Tablet/Desktop segment after a device clears the chip label back to "Device"', async () => {
      renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByRole('button', { name: 'Frame size presets' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Phone' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'iPhone 16 & 17 Pro' }));
      expect(screen.getByRole('button', { name: 'Frame size presets' })).toHaveTextContent('iPhone 16 & 17 Pro');

      await userEvent.click(presetButton('Desktop'));

      expect(screen.getByRole('button', { name: 'Frame size presets' })).toHaveTextContent('Device');
      expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px · desktop');
    });
  });
});
