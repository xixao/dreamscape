import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileSummary, FolderSummary } from '@/lib/files/repository';
import { FilesTable } from './files-table';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

const files: FileSummary[] = [
  {
    id: 'file1',
    name: 'Login screen',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-12T11:55:00.000Z',
    folderId: null,
  },
  {
    id: 'file2',
    name: 'Untitled',
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    folderId: null,
  },
];

const folders: FolderSummary[] = [
  {
    id: 'folder1',
    name: 'Marketing',
    parentId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    fileCount: 0,
    folderCount: 0,
  },
  {
    id: 'folder2',
    name: 'Not empty',
    parentId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    fileCount: 2,
    folderCount: 1,
  },
];

type FilesTableProps = Parameters<typeof FilesTable>[0];

function renderTable(overrides: Partial<FilesTableProps> = {}) {
  const props: FilesTableProps = {
    folderId: null,
    folders: [],
    files: [],
    isAddingFolder: false,
    onCancelAddFolder: vi.fn(),
    ...overrides,
  };
  return render(<FilesTable {...props} />);
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
});

describe('FilesTable - files (existing behavior)', () => {
  it('renders each file as a row with its name linked to /f/<id> and a relative updated time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    try {
      renderTable({ files });

      const link = screen.getByRole('link', { name: 'Login screen' });
      expect(link).toHaveAttribute('href', '/f/file1');
      expect(screen.getByRole('link', { name: 'Untitled' })).toHaveAttribute('href', '/f/file2');

      const updated = screen.getByTitle('2026-09-12T11:55:00.000Z');
      expect(updated).toHaveTextContent('5 minutes ago');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows "No files yet" at the top level when there is nothing', () => {
    renderTable({ folderId: null });
    expect(screen.getByText('No files yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first file to get started.')).toBeInTheDocument();
  });

  it('shows "This folder is empty" inside a folder when there is nothing', () => {
    renderTable({ folderId: 'folder1' });
    expect(screen.getByText('This folder is empty')).toBeInTheDocument();
    expect(screen.getByText('Create a file or a folder to get started.')).toBeInTheDocument();
  });

  it('renames inline on Enter, sending a PATCH with the new name and base updatedAt, then refreshes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ updatedAt: '2026-09-12T12:05:00.000Z' }),
    });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Rename' }));

    const input = await screen.findByLabelText('File name');
    expect(input).toHaveValue('Login screen');
    expect(input).toHaveFocus();

    await userEvent.clear(input);
    await userEvent.type(input, 'Sign in screen{Enter}');

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files/file1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Sign in screen', baseUpdatedAt: files[0].updatedAt }),
      }),
    );
    expect(screen.queryByLabelText('File name')).toBeNull();
  });

  it('cancels the rename on Escape without sending a request', async () => {
    global.fetch = vi.fn();

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Rename' }));

    const input = await screen.findByLabelText('File name');
    await userEvent.type(input, ' changed{Escape}');

    expect(screen.queryByLabelText('File name')).toBeNull();
    expect(screen.getByRole('link', { name: 'Login screen' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels on Enter without sending a request when the name is unchanged or blank', async () => {
    global.fetch = vi.fn();

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Rename' }));
    let input = await screen.findByLabelText('File name');
    await userEvent.type(input, '{Enter}');
    expect(screen.queryByLabelText('File name')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Rename' }));
    input = await screen.findByLabelText('File name');
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    expect(screen.queryByLabelText('File name')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a conflict message inline and stays in edit mode on a 409', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ updatedAt: '2026-09-12T12:10:00.000Z' }),
    });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Rename' }));
    const input = await screen.findByLabelText('File name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Conflicted{Enter}');

    expect(await screen.findByText('Someone else changed this file. Reload.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('File name')).toBeInTheDocument();
  });

  it('duplicates a file and navigates to the new copy', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'copy123', name: 'Login screen copy' } }),
    });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/copy123'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files/file1/duplicate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows an inline error in the row and does not navigate when duplicating fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Duplicate' }));

    expect(await within(rowFor('Login screen')).findByRole('alert')).toHaveTextContent(
      'Could not duplicate the file. Try again.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('asks for confirmation before deleting, and only deletes when confirmed', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete Login screen?')).toBeInTheDocument();
    expect(
      within(dialog).getByText('This removes the file for everyone. Undo will not bring it back.'),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetch).not.toHaveBeenCalled();

    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Delete' }));
    const dialog2 = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog2).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/files/file1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows an inline error in the row and does not refresh when deleting fails with a server error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(rowFor('Login screen')).findByRole('alert')).toHaveTextContent(
      'Could not delete the file. Reload and try again.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('still refreshes (with no error message) when deleting a file that is already gone', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a message and stays in edit mode when renaming fails with a server error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    renderTable({ files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Rename' }));
    const input = await screen.findByLabelText('File name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Sign in screen{Enter}');

    expect(await screen.findByText('Could not rename the file. Try again.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('File name')).toBeInTheDocument();
  });
});

describe('FilesTable - folders', () => {
  it('renders folder rows before file rows, each folder name linking to /folders/<id>', () => {
    renderTable({ folders, files });

    const allRows = screen.getAllByRole('row').slice(1);
    expect(within(allRows[0]).getByRole('link', { name: 'Marketing' })).toHaveAttribute('href', '/folders/folder1');
    expect(within(allRows[1]).getByRole('link', { name: 'Not empty' })).toHaveAttribute('href', '/folders/folder2');
    expect(within(allRows[2]).getByRole('link', { name: 'Login screen' })).toHaveAttribute('href', '/f/file1');
    expect(within(allRows[3]).getByRole('link', { name: 'Untitled' })).toHaveAttribute('href', '/f/file2');
  });

  it('enables Delete for an empty folder and disables it with a tooltip for a non-empty one', async () => {
    renderTable({ folders });

    const emptyDelete = within(rowFor('Marketing')).getByRole('button', { name: 'Delete' });
    expect(emptyDelete).not.toHaveAttribute('aria-disabled');

    const notEmptyDelete = within(rowFor('Not empty')).getByRole('button', { name: 'Delete' });
    expect(notEmptyDelete).toHaveAttribute('aria-disabled', 'true');

    await userEvent.hover(notEmptyDelete);
    expect(await screen.findByText('Empty the folder first')).toBeInTheDocument();

    global.fetch = vi.fn();
    await userEvent.click(notEmptyDelete);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renames a folder inline via PATCH /api/folders/[id] with just the name, then refreshes', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ folder: {} }) });

    renderTable({ folders });
    await userEvent.click(within(rowFor('Marketing')).getByRole('button', { name: 'Rename' }));

    const input = await screen.findByLabelText('Folder name');
    expect(input).toHaveValue('Marketing');
    await userEvent.clear(input);
    await userEvent.type(input, 'Growth{Enter}');

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/folders/folder1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Growth' }) }),
    );
  });

  it('cancels a folder rename on Escape without sending a request', async () => {
    global.fetch = vi.fn();

    renderTable({ folders });
    await userEvent.click(within(rowFor('Marketing')).getByRole('button', { name: 'Rename' }));
    const input = await screen.findByLabelText('Folder name');
    await userEvent.type(input, ' x{Escape}');

    expect(screen.queryByLabelText('Folder name')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a message and stays in edit mode when a folder rename fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    renderTable({ folders });
    await userEvent.click(within(rowFor('Marketing')).getByRole('button', { name: 'Rename' }));
    const input = await screen.findByLabelText('Folder name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Growth{Enter}');

    expect(await screen.findByText('Could not rename the folder. Try again.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Folder name')).toBeInTheDocument();
  });

  it('deletes an empty folder after confirmation, with folder-specific confirm copy', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    renderTable({ folders });
    await userEvent.click(within(rowFor('Marketing')).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete Marketing?')).toBeInTheDocument();
    expect(
      within(dialog).getByText('This removes the folder for everyone. Undo will not bring it back.'),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/folders/folder1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows an inline error and does not refresh when deleting a folder fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    renderTable({ folders });
    await userEvent.click(within(rowFor('Marketing')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(rowFor('Marketing')).findByRole('alert')).toHaveTextContent(
      'Could not delete the folder. Reload and try again.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('opens the Move dialog for a file and refreshes on a successful move', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/folders/all') {
        return Promise.resolve({ ok: true, json: async () => ({ folders }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ updatedAt: '2026-09-12T12:05:00.000Z' }) });
    });

    renderTable({ folders, files });
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Move to' }));

    expect(await screen.findByText('Move Login screen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /^Marketing/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files/file1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ folderId: 'folder1', baseUpdatedAt: files[0].updatedAt }),
      }),
    );
  });

  it('opens the Move dialog for a folder and shows a row message when the move fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/folders/all') {
        return Promise.resolve({ ok: true, json: async () => ({ folders }) });
      }
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderTable({ folders });
    await userEvent.click(within(rowFor('Marketing')).getByRole('button', { name: 'Move to' }));
    expect(await screen.findByText('Move Marketing')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(await within(rowFor('Marketing')).findByRole('alert')).toHaveTextContent(
      'Could not move the folder. Try again.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the inline New folder row when isAddingFolder is true, and Escape cancels it', async () => {
    const onCancelAddFolder = vi.fn();
    renderTable({ isAddingFolder: true, onCancelAddFolder });

    const input = screen.getByLabelText('Folder name');
    await userEvent.type(input, 'x{Escape}');

    expect(onCancelAddFolder).toHaveBeenCalledTimes(1);
  });

  it('does not show the inline New folder row when isAddingFolder is false', () => {
    renderTable();
    expect(screen.queryByLabelText('Folder name')).toBeNull();
  });

  it('shows the New folder row instead of the empty state when adding a folder at an empty level', () => {
    renderTable({ isAddingFolder: true });
    expect(screen.getByLabelText('Folder name')).toBeInTheDocument();
    expect(screen.queryByText('No files yet')).toBeNull();
  });

  it('shows the New folder row above existing folders and files', () => {
    renderTable({ folders, files, isAddingFolder: true });
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByLabelText('Folder name')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Marketing')).toBeInTheDocument();
  });
});
