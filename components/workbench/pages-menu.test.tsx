import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Page, Screen } from '@/lib/files/repository';
import { PagesMenu } from './pages-menu';

function makePage(id: string, name: string): Page {
  return { id, name };
}

function makeScreen(id: string, pageId: string): Screen {
  return { id, name: id, layout: '{}', stageWidth: 1440, pageId };
}

function renderMenu(overrides: Partial<ComponentProps<typeof PagesMenu>> = {}) {
  const pages = overrides.pages ?? [makePage('p1', 'Page 1'), makePage('p2', 'v2')];
  const props: ComponentProps<typeof PagesMenu> = {
    pages,
    currentPageId: pages[0].id,
    screens: [],
    onSwitch: vi.fn(),
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  };
  render(<PagesMenu {...props} />);
  return props;
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Pages' }));
}

describe('PagesMenu', () => {
  it('shows the current page name on the chip trigger', () => {
    renderMenu({ currentPageId: 'p2' });
    expect(screen.getByRole('button', { name: 'Pages' })).toHaveTextContent('v2');
  });

  it('lists every page with the current one checked', async () => {
    renderMenu({ currentPageId: 'p2' });
    await openMenu();

    const items = await screen.findAllByRole('menuitem');
    const pageRow = (name: string) => items.find((item) => item.textContent?.includes(name));

    expect(pageRow('Page 1')).toBeTruthy();
    expect(pageRow('v2')).toBeTruthy();
    expect(within(pageRow('v2')!).getByTestId('page-check')).toBeInTheDocument();
    expect(pageRow('Page 1')!.querySelector('[data-testid="page-check"]')).toBeNull();
  });

  it('calls onSwitch with the clicked page id', async () => {
    const props = renderMenu();
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'v2' }));
    expect(props.onSwitch).toHaveBeenCalledWith('p2');
  });

  it('calls onAdd when New page is clicked', async () => {
    const props = renderMenu();
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New page' }));
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it('calls onDuplicate with the current page id', async () => {
    const props = renderMenu({ currentPageId: 'p2' });
    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate page' }));
    expect(props.onDuplicate).toHaveBeenCalledWith('p2');
  });

  describe('rename', () => {
    it('Rename swaps the chip trigger for an inline input that commits the trimmed name on Enter', async () => {
      const props = renderMenu({ currentPageId: 'p2' });
      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      const input = screen.getByLabelText('Page name');
      expect(input).toHaveValue('v2');
      expect(screen.queryByRole('button', { name: 'Pages' })).toBeNull();
      await userEvent.clear(input);
      await userEvent.type(input, '  Version 2  {Enter}');

      expect(props.onRename).toHaveBeenCalledWith('p2', 'Version 2');
      expect(screen.queryByLabelText('Page name')).toBeNull();
      expect(screen.getByRole('button', { name: 'Pages' })).toBeInTheDocument();
    });

    it('Escape cancels without calling onRename', async () => {
      const props = renderMenu({ currentPageId: 'p2' });
      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

      const input = screen.getByLabelText('Page name');
      await userEvent.type(input, ' renamed{Escape}');

      expect(props.onRename).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Page name')).toBeNull();
      expect(screen.getByRole('button', { name: 'Pages' })).toBeInTheDocument();
    });

    it('does not call onRename when the value is unchanged or empty after trimming', async () => {
      const props = renderMenu({ currentPageId: 'p2' });
      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      await userEvent.keyboard('{Enter}');
      expect(props.onRename).not.toHaveBeenCalled();

      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      const input = screen.getByLabelText('Page name');
      await userEvent.clear(input);
      await userEvent.type(input, '   {Enter}');
      expect(props.onRename).not.toHaveBeenCalled();
    });

    it('trims a name to 80 characters', async () => {
      const props = renderMenu({ currentPageId: 'p2' });
      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      const input = screen.getByLabelText('Page name');
      await userEvent.clear(input);
      await userEvent.type(input, `${'x'.repeat(90)}{Enter}`);
      expect(props.onRename).toHaveBeenCalledWith('p2', 'x'.repeat(80));
    });
  });

  describe('move up/down', () => {
    it('disables Move up on the first page and Move down on the last', async () => {
      const pages = [makePage('p1', 'Page 1'), makePage('p2', 'v2'), makePage('p3', 'v3')];

      renderMenu({ pages, currentPageId: 'p1' });
      await openMenu();
      expect(await screen.findByRole('menuitem', { name: 'Move up' })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('menuitem', { name: 'Move down' })).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('calls onMove with the current page id and direction', async () => {
      const pages = [makePage('p1', 'Page 1'), makePage('p2', 'v2'), makePage('p3', 'v3')];
      const props = renderMenu({ pages, currentPageId: 'p2' });
      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));
      expect(props.onMove).toHaveBeenCalledWith('p2', 'up');

      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));
      expect(props.onMove).toHaveBeenCalledWith('p2', 'down');
    });
  });

  describe('delete', () => {
    it('is disabled when there is only one page', async () => {
      renderMenu({ pages: [makePage('p1', 'Page 1')], currentPageId: 'p1' });
      await openMenu();
      expect(await screen.findByRole('menuitem', { name: 'Delete page' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('confirms, naming the number of screens it removes, before calling onDelete', async () => {
      const props = renderMenu({
        currentPageId: 'p2',
        screens: [makeScreen('s1', 'p2'), makeScreen('s2', 'p2'), makeScreen('s3', 'p1')],
      });
      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete page' }));

      expect(await screen.findByText('Delete v2?')).toBeInTheDocument();
      expect(screen.getByText(/removes 2 screens/)).toBeInTheDocument();
      expect(props.onDelete).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(props.onDelete).toHaveBeenCalledWith('p2');
    });

    it('Cancel leaves the page alone', async () => {
      const props = renderMenu({ currentPageId: 'p2' });
      await openMenu();
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete page' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByText('Delete v2?')).toBeNull());
      expect(props.onDelete).not.toHaveBeenCalled();
    });
  });
});
