import { useState, type ComponentProps, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Frame, ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import type { Viewport } from '@/lib/canvas/viewport';
import type { SaveState } from '@/lib/persistence';
import { renderInEditor } from '@/test/craft-harness';
import { CanvasViewportProvider } from './canvas';
import { Topbar } from './topbar';

function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
}

// Topbar's zoom menu reads/writes the canvas viewport through
// useCanvasViewport() (components/workbench/canvas.tsx) - this plays the
// role WorkbenchShell does in the real app: own a real, settable viewport
// and expose it through the same provider, with a plain readout so a test
// can observe the fixed-percentage items actually changing it.
function ViewportHarness({
  children,
  initialViewport = { x: 0, y: 0, zoom: 1 },
  viewportSize = { width: 1000, height: 800 },
}: {
  children: ReactNode;
  initialViewport?: Viewport;
  viewportSize?: { width: number; height: number };
}) {
  const [viewport, setViewport] = useState(initialViewport);
  return (
    <CanvasViewportProvider viewport={viewport} setViewport={setViewport} viewportSize={viewportSize}>
      {children}
      <output data-testid="viewport-probe">{viewport.zoom}</output>
    </CanvasViewportProvider>
  );
}

function renderTopbar(
  overrides: Partial<ComponentProps<typeof Topbar>> = {},
  options?: { width?: number; initialViewport?: Viewport },
) {
  const onRename = overrides.onRename ?? vi.fn();
  const onNew = overrides.onNew ?? vi.fn();
  const onToggleChat = overrides.onToggleChat ?? vi.fn();
  const onZoomIn = overrides.onZoomIn ?? vi.fn();
  const onZoomOut = overrides.onZoomOut ?? vi.fn();
  const onZoomToFit = overrides.onZoomToFit ?? vi.fn();
  const onZoomToSelection = overrides.onZoomToSelection ?? vi.fn();
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
    onZoomIn,
    onZoomOut,
    onZoomToFit,
    onZoomToSelection,
  };
  return {
    ...renderInEditor(
      <ViewportHarness initialViewport={options?.initialViewport}>
        <Topbar {...props} />
      </ViewportHarness>,
      options,
    ),
    onRename,
    onNew,
    onToggleChat,
    onZoomIn,
    onZoomOut,
    onZoomToFit,
    onZoomToSelection,
  };
}

// The readout text itself (readoutFor) is unit-tested in
// lib/stage/size.test.ts; the tests below just confirm Topbar renders it
// through data-testid="stage-readout" with the live stage values.
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
        <ViewportHarness>
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
            onZoomIn={() => {}}
            onZoomOut={() => {}}
            onZoomToFit={() => {}}
            onZoomToSelection={() => {}}
          />
        </ViewportHarness>
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

    // The top bar floats full width over the canvas (spec docs/superpowers/
    // specs/2026-09-12-infinite-canvas-design.md section 4) regardless of
    // the chat panel: unlike the old grid layout, opening chat never
    // narrows it - chat floats independently, beside the right panel.
    it('floats the same full width whether chat is open or closed', () => {
      const { unmount } = renderTopbar({ chatOpen: false });
      const closed = screen.getByRole('button', { name: 'Chat' }).closest('header');
      expect(closed).toHaveClass('absolute', 'top-3', 'left-3', 'right-3');
      unmount();

      renderTopbar({ chatOpen: true });
      const open = screen.getByRole('button', { name: 'Chat' }).closest('header');
      expect(open).toHaveClass('absolute', 'top-3', 'left-3', 'right-3');
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

  describe('zoom menu', () => {
    it('the readout is a menu trigger', () => {
      renderTopbar({}, { width: 1440 });
      const trigger = screen.getByTestId('stage-readout');
      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('lists every zoom item with its shortcut in mono on the right', async () => {
      renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByTestId('stage-readout'));

      const menu = screen.getByRole('menu');
      const items = within(menu).getAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual([
        'Zoom in⌘=',
        'Zoom out⌘-',
        'Zoom to 50%',
        'Zoom to 100%⌘0',
        'Zoom to 200%',
        'Zoom to fit⇧1',
        'Zoom to selection⇧2',
      ]);
    });

    it('Zoom in calls onZoomIn', async () => {
      const { onZoomIn } = renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByTestId('stage-readout'));
      await userEvent.click(screen.getByRole('menuitem', { name: /Zoom in/ }));
      expect(onZoomIn).toHaveBeenCalledTimes(1);
    });

    it('Zoom out calls onZoomOut', async () => {
      const { onZoomOut } = renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByTestId('stage-readout'));
      await userEvent.click(screen.getByRole('menuitem', { name: /Zoom out/ }));
      expect(onZoomOut).toHaveBeenCalledTimes(1);
    });

    it('Zoom to fit calls onZoomToFit', async () => {
      const { onZoomToFit } = renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByTestId('stage-readout'));
      await userEvent.click(screen.getByRole('menuitem', { name: /Zoom to fit/ }));
      expect(onZoomToFit).toHaveBeenCalledTimes(1);
    });

    it('Zoom to selection calls onZoomToSelection', async () => {
      const { onZoomToSelection } = renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByTestId('stage-readout'));
      await userEvent.click(screen.getByRole('menuitem', { name: /Zoom to selection/ }));
      expect(onZoomToSelection).toHaveBeenCalledTimes(1);
    });

    it('Zoom to 100% sets the shared viewport to exactly zoom 1', async () => {
      renderTopbar({}, { width: 1440, initialViewport: { x: 10, y: 10, zoom: 2.5 } });
      await userEvent.click(screen.getByTestId('stage-readout'));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Zoom to 100%⌘0' }));
      expect(screen.getByTestId('viewport-probe')).toHaveTextContent('1');
    });

    it('Zoom to 50% and Zoom to 200% set the shared viewport to those exact levels', async () => {
      renderTopbar({}, { width: 1440 });
      await userEvent.click(screen.getByTestId('stage-readout'));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Zoom to 50%' }));
      expect(screen.getByTestId('viewport-probe')).toHaveTextContent('0.5');

      await userEvent.click(screen.getByTestId('stage-readout'));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Zoom to 200%' }));
      expect(screen.getByTestId('viewport-probe')).toHaveTextContent('2');
    });
  });
});
