import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FolderSummary } from '@/lib/files/repository';
import { MoveDialog, type MoveTarget } from './move-dialog';

function folder(overrides: Partial<FolderSummary> & { id: string; name: string }): FolderSummary {
  return {
    parentId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    fileCount: 0,
    folderCount: 0,
    ...overrides,
  };
}

// A / B(under A) / C(under B) / D(top level, unrelated)
const allFolders: FolderSummary[] = [
  folder({ id: 'a', name: 'A', parentId: null }),
  folder({ id: 'b', name: 'B', parentId: 'a' }),
  folder({ id: 'c', name: 'C', parentId: 'b' }),
  folder({ id: 'd', name: 'D', parentId: null }),
];

function mockFetch(patchResponse: unknown = { ok: true, json: async () => ({}) }) {
  return vi.fn().mockImplementation((url: string) => {
    if (url === '/api/folders/all') {
      return Promise.resolve({ ok: true, json: async () => ({ folders: allFolders }) });
    }
    return Promise.resolve(patchResponse);
  });
}

describe('MoveDialog', () => {
  it('renders nothing when there is no target', () => {
    render(<MoveDialog target={null} onOpenChange={vi.fn()} onMoved={vi.fn()} onError={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fetches the full folder list when opened and shows Top level plus the tree', async () => {
    global.fetch = mockFetch();
    const target: MoveTarget = {
      kind: 'file',
      id: 'file1',
      name: 'Login screen',
      currentFolderId: null,
      baseUpdatedAt: '2026-09-01T00:00:00.000Z',
    };

    render(<MoveDialog target={target} onOpenChange={vi.fn()} onMoved={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByText('Move Login screen')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/folders/all'));
    expect(await screen.findByRole('radio', { name: /Top level/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^A/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^B/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^C/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^D/ })).toBeInTheDocument();
  });

  it('disables the moved folder and its descendants, but not unrelated folders', async () => {
    global.fetch = mockFetch();
    const target: MoveTarget = { kind: 'folder', id: 'a', name: 'A', currentFolderId: null };

    render(<MoveDialog target={target} onOpenChange={vi.fn()} onMoved={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole('radio', { name: /^A/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^B/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^C/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^D/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Top level/ })).toBeEnabled();
  });

  it('does not disable any folder when moving a file', async () => {
    global.fetch = mockFetch();
    const target: MoveTarget = { kind: 'file', id: 'file1', name: 'Deep file', currentFolderId: 'a' };

    render(<MoveDialog target={target} onOpenChange={vi.fn()} onMoved={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole('radio', { name: /^A/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /^B/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /^C/ })).toBeEnabled();
  });

  it('marks the current location', async () => {
    global.fetch = mockFetch();
    const target: MoveTarget = { kind: 'file', id: 'file1', name: 'Deep file', currentFolderId: 'b' };

    render(<MoveDialog target={target} onOpenChange={vi.fn()} onMoved={vi.fn()} onError={vi.fn()} />);

    const bRow = await screen.findByRole('radio', { name: /^B/ });
    expect(within(bRow).getByText(/current/i)).toBeInTheDocument();
  });

  it('sends a PATCH with folderId and baseUpdatedAt for a file, then reports success and closes', async () => {
    global.fetch = mockFetch({ ok: true, json: async () => ({ updatedAt: '2026-09-12T00:00:00.000Z' }) });
    const onOpenChange = vi.fn();
    const onMoved = vi.fn();
    const target: MoveTarget = {
      kind: 'file',
      id: 'file1',
      name: 'Login screen',
      currentFolderId: null,
      baseUpdatedAt: '2026-09-01T00:00:00.000Z',
    };

    render(<MoveDialog target={target} onOpenChange={onOpenChange} onMoved={onMoved} onError={vi.fn()} />);
    await userEvent.click(await screen.findByRole('radio', { name: /^B/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files/file1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ folderId: 'b', baseUpdatedAt: '2026-09-01T00:00:00.000Z' }),
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sends a PATCH with parentId for a folder, then reports success', async () => {
    global.fetch = mockFetch({ ok: true, json: async () => ({ folder: {} }) });
    const onMoved = vi.fn();
    const target: MoveTarget = { kind: 'folder', id: 'd', name: 'D', currentFolderId: null };

    render(<MoveDialog target={target} onOpenChange={vi.fn()} onMoved={onMoved} onError={vi.fn()} />);
    await userEvent.click(await screen.findByRole('radio', { name: /^A/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/folders/d',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ parentId: 'a' }) }),
    );
  });

  it('selecting Top level moves a nested file back to the top', async () => {
    global.fetch = mockFetch({ ok: true, json: async () => ({ updatedAt: 'x' }) });
    const target: MoveTarget = {
      kind: 'file',
      id: 'file1',
      name: 'Deep file',
      currentFolderId: 'c',
      baseUpdatedAt: '2026-09-01T00:00:00.000Z',
    };

    render(<MoveDialog target={target} onOpenChange={vi.fn()} onMoved={vi.fn()} onError={vi.fn()} />);
    await userEvent.click(await screen.findByRole('radio', { name: /Top level/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/files/file1',
        expect.objectContaining({
          body: JSON.stringify({ folderId: null, baseUpdatedAt: '2026-09-01T00:00:00.000Z' }),
        }),
      ),
    );
  });

  it('closes and reports an error when the move request fails', async () => {
    global.fetch = mockFetch({ ok: false, status: 500, json: async () => ({}) });
    const onOpenChange = vi.fn();
    const onError = vi.fn();
    const onMoved = vi.fn();
    const target: MoveTarget = {
      kind: 'file',
      id: 'file1',
      name: 'Login screen',
      currentFolderId: null,
      baseUpdatedAt: '2026-09-01T00:00:00.000Z',
    };

    render(<MoveDialog target={target} onOpenChange={onOpenChange} onMoved={onMoved} onError={onError} />);
    await screen.findByRole('radio', { name: /Top level/ });
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Could not move the file. Try again.'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onMoved).not.toHaveBeenCalled();
  });

  it('Cancel closes without sending a request', async () => {
    global.fetch = mockFetch();
    const onOpenChange = vi.fn();
    const target: MoveTarget = { kind: 'folder', id: 'd', name: 'D', currentFolderId: null };

    render(<MoveDialog target={target} onOpenChange={onOpenChange} onMoved={vi.fn()} onError={vi.fn()} />);
    await screen.findByRole('radio', { name: /^A/ });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetch).toHaveBeenCalledTimes(1); // only the folders/all fetch, no PATCH
  });
});
