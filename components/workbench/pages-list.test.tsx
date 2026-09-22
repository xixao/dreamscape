import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PagesMenu } from './pages-menu';
import { PagesList } from './pages-list';
import type { Page } from '@/lib/files/repository';
const pages = [{ id: 'design', name: 'Product screens' }, { id: 'variations', name: 'Loan alternatives', kind: 'variations' }] as Page[];
it('exposes design and variations pages without opening a menu', () => {
  const select = vi.fn(); const add = vi.fn();
  render(<PagesList pages={pages} currentPageId="design" onSwitch={select} onAdd={add} storageKey="pages-test-visible" />);
  expect(screen.getByRole('button', { name: /Product screens/ })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: /Loan alternatives/ }));
  expect(select).toHaveBeenCalledWith('variations');
  fireEvent.click(screen.getByRole('button', { name: 'New page' }));
  expect(add).toHaveBeenCalledOnce();
});
it('remembers collapsing across design and variations workspaces', () => {
  const props = { pages, currentPageId: 'design', onSwitch: vi.fn(), storageKey: 'pages-test-collapse' };
  const view = render(<PagesList {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Collapse pages' }));
  view.unmount();
  render(<PagesList {...props} currentPageId="variations" />);
  expect(screen.getByRole('button', { name: 'Expand pages' })).toHaveTextContent('Loan alternatives');
  expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
});

it('runs a row action on that page without switching the active page', async () => {
  const select = vi.fn(); const duplicate = vi.fn();
  render(<PagesList pages={pages} currentPageId="design" onSwitch={select} storageKey="row-action-test" pageActions={page => <PagesMenu compact pages={pages} currentPageId={page.id} screens={[]} onSwitch={select} onAdd={vi.fn()} onRename={vi.fn()} onDuplicate={duplicate} onDelete={vi.fn()} onMove={vi.fn()} />} />);
  await userEvent.click(screen.getByRole('button', { name: 'Page options for Loan alternatives' }));
  for (const name of ['Rename', 'Move up', 'Move down', 'New page']) expect(screen.queryByRole('menuitem', { name })).toBeNull();
  await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate page' }));
  expect(duplicate).toHaveBeenCalledWith('variations');
  expect(select).not.toHaveBeenCalled();
});

it('renames the active page inline with Enter and cancels with Escape', () => {
  const rename = vi.fn();
  render(<PagesList pages={pages} currentPageId="design" onSwitch={vi.fn()} onRename={rename} storageKey="inline-name-test" />);
  fireEvent.click(screen.getByRole('button', { name: /Product screens/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Page name' }), { target: { value: 'New name' } });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Page name' }), { key: 'Enter' });
  expect(rename).toHaveBeenCalledWith('design', 'New name');
  rename.mockClear();
  fireEvent.click(screen.getByRole('button', { name: /Product screens/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Page name' }), { target: { value: 'Discard this' } });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Page name' }), { key: 'Escape' });
  expect(rename).not.toHaveBeenCalled();
});
