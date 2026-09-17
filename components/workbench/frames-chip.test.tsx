import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Screen } from '@/lib/files/repository';
import { createOverlayScreen } from '@/lib/files/screens';
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
    onAddOverlay: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMoveToPage: vi.fn(),
    onZoomToFrame: vi.fn(),
    ...overrides,
  };
  render(<FramesChip {...props} />);
  return props;
}

// Opens a frame row's own per-row submenu (Rename/Duplicate/Move to
// page/Delete for THAT frame) via the keyboard, the same "press Right"
// contract a Radix DropdownMenuSubTrigger offers alongside hover - it opens
// synchronously (unlike hover's own 100ms-delayed open), so callers don't
// need a waitFor just to reach it. Does not click the row itself, which
// would instead focus and zoom to it.
async function openFrameRowMenu(frameName: string | RegExp): Promise<void> {
  const trigger = screen.getByRole('button', { name: 'Frames' });
  await userEvent.click(trigger);
  const row = await screen.findByRole('menuitem', { name: frameName });
  fireEvent.keyDown(row, { key: 'ArrowRight' });
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

  it('calls onSwitch and onZoomToFrame when clicking a frame in the menu, and closes it', async () => {
    const props = renderChip();
    const trigger = screen.getByRole('button', { name: 'Frames' });
    await userEvent.click(trigger);
    const items = screen.getAllByRole('menuitem');
    await userEvent.click(items[1]);

    expect(props.onSwitch).toHaveBeenCalledWith('b');
    expect(props.onZoomToFrame).toHaveBeenCalledWith('b');
    // A plain click focuses and closes, rather than opening that row's own
    // submenu (Radix's own default for a click on a SubTrigger).
    await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
  });

  it('opening a row\'s own submenu (Right arrow) does not switch or zoom to it', async () => {
    const props = renderChip();
    await openFrameRowMenu('Settings');

    expect(await screen.findByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument();
    expect(props.onSwitch).not.toHaveBeenCalled();
    expect(props.onZoomToFrame).not.toHaveBeenCalled();
  });

  it('calls onAdd when the New frame item is clicked', async () => {
    const props = renderChip();
    const trigger = screen.getByRole('button', { name: 'Frames' });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New frame' }));

    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  describe('renaming', () => {
    it('a row\'s own Rename item opens an inline input that commits the trimmed name on Enter', async () => {
      const props = renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      const input = screen.getByLabelText('Frame name');
      await userEvent.clear(input);
      await userEvent.type(input, '  Sign in  {Enter}');

      expect(props.onRename).toHaveBeenCalledWith('a', 'Sign in');
      expect(screen.queryByLabelText('Frame name')).toBeNull();
    });

    it('renames a non-focused row without ever switching to it', async () => {
      const props = renderChip();
      await openFrameRowMenu('Settings');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      const input = screen.getByLabelText('Frame name');
      await userEvent.clear(input);
      await userEvent.type(input, 'Prefs{Enter}');

      expect(props.onRename).toHaveBeenCalledWith('b', 'Prefs');
      expect(props.onSwitch).not.toHaveBeenCalled();
      expect(props.onZoomToFrame).not.toHaveBeenCalled();
    });

    it('Escape cancels the inline rename without calling onRename', async () => {
      const props = renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      const input = screen.getByLabelText('Frame name');
      await userEvent.type(input, ' renamed{Escape}');

      expect(props.onRename).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Frame name')).toBeNull();
    });

    it('does not call onRename when the value is unchanged after trimming', async () => {
      const props = renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      await userEvent.keyboard('{Enter}');
      expect(props.onRename).not.toHaveBeenCalled();
    });

    it('does not call onRename when the value is empty after trimming', async () => {
      const props = renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      const input = screen.getByLabelText('Frame name');
      await userEvent.clear(input);
      await userEvent.type(input, '   {Enter}');
      expect(props.onRename).not.toHaveBeenCalled();
    });

    it('leaves the input focused after opening Rename from the menu', async () => {
      renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      expect(screen.getByLabelText('Frame name')).toHaveFocus();
    });

    it('the menu stays open around the rename field, and the other row is still reachable', async () => {
      renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      // "Login" is now the rename field, not a menuitem; "Settings" is
      // still a plain row in the same still-open menu.
      expect(screen.queryByRole('menuitem', { name: 'Login' })).toBeNull();
      expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    });
  });

  describe('duplicate', () => {
    it('calls onDuplicate with that row\'s own frame id', async () => {
      const props = renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

      expect(props.onDuplicate).toHaveBeenCalledWith('a');
    });

    it('duplicates a non-focused row without ever switching to it', async () => {
      const props = renderChip();
      await openFrameRowMenu('Settings');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

      expect(props.onDuplicate).toHaveBeenCalledWith('b');
      expect(props.onSwitch).not.toHaveBeenCalled();
      expect(props.onZoomToFrame).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('confirms before calling onDelete', async () => {
      const props = renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

      expect(await screen.findByText('Delete Login?')).toBeInTheDocument();
      expect(props.onDelete).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(props.onDelete).toHaveBeenCalledWith('a');
    });

    it('Cancel leaves the frame alone', async () => {
      const props = renderChip();
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByText('Delete Login?')).toBeNull());
      expect(props.onDelete).not.toHaveBeenCalled();
    });

    it('allows deleting the last frame', async () => {
      const props = renderChip({ frames: [makeFrame('a', { name: 'Login' })] });
      await openFrameRowMenu('Login');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(props.onDelete).toHaveBeenCalledWith('a');
    });

    it('deletes a non-focused row without ever switching to it', async () => {
      const props = renderChip();
      await openFrameRowMenu('Settings');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(props.onDelete).toHaveBeenCalledWith('b');
      expect(props.onSwitch).not.toHaveBeenCalled();
      expect(props.onZoomToFrame).not.toHaveBeenCalled();
    });

    // Overlay frames phase 2 review, finding 1: a page must always keep at
    // least one plain screen once it has an overlay on it (Present has
    // nowhere sensible to land otherwise).
    describe('keeping at least one plain screen once an overlay exists', () => {
      const overlay = createOverlayScreen({ type: 'dialog', id: 'o1', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });

      it('is disabled, with a tooltip, for the LAST plain screen once an overlay also exists on the page', async () => {
        const props = renderChip({ frames: [makeFrame('a', { name: 'Login' }), overlay] });
        await openFrameRowMenu('Login');

        const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
        expect(deleteItem).toHaveAttribute('aria-disabled', 'true');
        expect(deleteItem).toHaveAttribute('title', 'A page needs at least one screen');

        await userEvent.click(deleteItem);
        expect(screen.queryByText('Delete Login?')).toBeNull();
        expect(props.onDelete).not.toHaveBeenCalled();
      });

      it('stays enabled for a plain screen when another plain screen remains, even with an overlay present', async () => {
        const props = renderChip({
          frames: [makeFrame('a', { name: 'Login' }), makeFrame('b', { name: 'Settings' }), overlay],
        });
        await openFrameRowMenu('Login');

        const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
        expect(deleteItem).not.toHaveAttribute('aria-disabled', 'true');

        await userEvent.click(deleteItem);
        await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
        expect(props.onDelete).toHaveBeenCalledWith('a');
      });

      it('stays enabled for the overlay itself, even as the page\'s only overlay, as long as a plain screen remains', async () => {
        renderChip({ frames: [makeFrame('a', { name: 'Login' }), overlay] });
        await openFrameRowMenu(/Dialog 1/);

        const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
        expect(deleteItem).not.toHaveAttribute('aria-disabled', 'true');
      });
    });
  });

  describe('overlay frames', () => {
    function makeOverlayFrame(id: string, type: 'dialog' | 'sheet' | 'toast', overrides: Partial<Screen> = {}): Screen {
      return { ...createOverlayScreen({ type, id, name: `${type} ${id}`, pageId: 'p1', x: 0, y: 0 }), ...overrides };
    }

    it('shows a mono badge naming the presentation after an overlay row\'s name', async () => {
      const frames = [
        makeFrame('a', { name: 'Login' }),
        makeOverlayFrame('b', 'sheet', { name: 'Filters' }),
        makeOverlayFrame('c', 'toast', { name: 'Saved' }),
      ];
      renderChip({ frames, currentFrameId: 'a' });
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);

      const items = screen.getAllByRole('menuitem');
      expect(within(items[0]).queryByText(/Sheet|Toast|Dialog/)).toBeNull();
      expect(within(items[1]).getByText('Sheet · Right')).toBeInTheDocument();
      expect(within(items[2]).getByText('Toast')).toBeInTheDocument();
    });

    it('offers a "New overlay" submenu with Dialog, Sheet and Toast, after New frame', async () => {
      const props = renderChip();
      const trigger = screen.getByRole('button', { name: 'Frames' });
      await userEvent.click(trigger);

      const menuitems = screen.getAllByRole('menuitem');
      const newFrameIndex = menuitems.findIndex((item) => item.textContent === 'New frame');
      const newOverlayTrigger = await screen.findByRole('menuitem', { name: 'New overlay' });
      expect(menuitems.indexOf(newOverlayTrigger)).toBeGreaterThan(newFrameIndex);

      fireEvent.keyDown(newOverlayTrigger, { key: 'ArrowRight' });
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Dialog' }));
      expect(props.onAddOverlay).toHaveBeenCalledWith('dialog');
      await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
    });

    it('New overlay > Sheet calls onAddOverlay with "sheet"', async () => {
      const props = renderChip();
      await userEvent.click(screen.getByRole('button', { name: 'Frames' }));
      fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'New overlay' }), { key: 'ArrowRight' });
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Sheet' }));
      expect(props.onAddOverlay).toHaveBeenCalledWith('sheet');
    });

    it('New overlay > Toast calls onAddOverlay with "toast"', async () => {
      const props = renderChip();
      await userEvent.click(screen.getByRole('button', { name: 'Frames' }));
      fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'New overlay' }), { key: 'ArrowRight' });
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Toast' }));
      expect(props.onAddOverlay).toHaveBeenCalledWith('toast');
    });
  });

  describe('move to page', () => {
    const pages = [
      { id: 'p1', name: 'Page 1' },
      { id: 'p2', name: 'v2' },
    ];

    it('lists every other page in a non-focused row\'s own submenu, and calls onMoveToPage with that row\'s id', async () => {
      const props = renderChip({ pages });
      await openFrameRowMenu('Settings');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Move to page' }));
      // fireEvent.click, not userEvent.click: user-event's realistic
      // pointer-move simulation into a Radix submenu confuses its own
      // hover/"grace area" tracking with no real layout to measure in
      // jsdom, silently swallowing the click - see workbench.test.tsx's
      // moveFrameToPage helper for the same fix and its fuller comment.
      fireEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));

      expect(props.onMoveToPage).toHaveBeenCalledWith('b', 'p2');
      expect(props.onSwitch).not.toHaveBeenCalled();
    });

    it('is absent with only one page', async () => {
      renderChip({ pages: [pages[0]] });
      await openFrameRowMenu('Login');
      expect(screen.queryByRole('menuitem', { name: 'Move to page' })).toBeNull();
    });

    // Overlay frames phase 2 review, finding 1 - the same "a page needs at
    // least one plain screen once it has an overlay" invariant Delete
    // enforces above, since moving a screen away strands its origin page
    // exactly the way deleting it would.
    it('is disabled, with a tooltip, for the LAST plain screen of the origin page once an overlay also exists there', async () => {
      const overlay = createOverlayScreen({ type: 'dialog', id: 'o1', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });
      renderChip({ frames: [makeFrame('a', { name: 'Login' }), overlay], pages });
      await openFrameRowMenu('Login');

      const moveToPageTrigger = await screen.findByRole('menuitem', { name: 'Move to page' });
      expect(moveToPageTrigger).toHaveAttribute('aria-disabled', 'true');
      expect(moveToPageTrigger).toHaveAttribute('title', 'A page needs at least one screen');
    });

    it('stays enabled when another plain screen would remain on the origin page', async () => {
      const overlay = createOverlayScreen({ type: 'dialog', id: 'o1', name: 'Dialog 1', pageId: 'p1', x: 0, y: 0 });
      renderChip({ frames: [makeFrame('a', { name: 'Login' }), makeFrame('c', { name: 'Other' }), overlay], pages });
      await openFrameRowMenu('Login');

      const moveToPageTrigger = await screen.findByRole('menuitem', { name: 'Move to page' });
      expect(moveToPageTrigger).not.toHaveAttribute('aria-disabled', 'true');
    });
  });
});
