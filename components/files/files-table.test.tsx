import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileSummary } from '@/lib/files/repository';
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
  },
  {
    id: 'file2',
    name: 'Untitled',
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
  },
];

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
});

describe('FilesTable', () => {
  it('renders each file as a row with its name linked to /f/<id> and a relative updated time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    try {
      render(<FilesTable files={files} />);

      const link = screen.getByRole('link', { name: 'Login screen' });
      expect(link).toHaveAttribute('href', '/f/file1');
      expect(screen.getByRole('link', { name: 'Untitled' })).toHaveAttribute('href', '/f/file2');

      const updated = screen.getByTitle('2026-09-12T11:55:00.000Z');
      expect(updated).toHaveTextContent('5 minutes ago');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an empty state when there are no files', () => {
    render(<FilesTable files={[]} />);
    expect(screen.getByText('No files yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first file to get started.')).toBeInTheDocument();
  });

  it('renames inline on Enter, sending a PATCH with the new name and base updatedAt, then refreshes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ updatedAt: '2026-09-12T12:05:00.000Z' }),
    });

    render(<FilesTable files={files} />);
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

    render(<FilesTable files={files} />);
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Rename' }));

    const input = await screen.findByLabelText('File name');
    await userEvent.type(input, ' changed{Escape}');

    expect(screen.queryByLabelText('File name')).toBeNull();
    expect(screen.getByRole('link', { name: 'Login screen' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels on Enter without sending a request when the name is unchanged or blank', async () => {
    global.fetch = vi.fn();

    render(<FilesTable files={files} />);
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

    render(<FilesTable files={files} />);
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

    render(<FilesTable files={files} />);
    await userEvent.click(within(rowFor('Login screen')).getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/copy123'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files/file1/duplicate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('asks for confirmation before deleting, and only deletes when confirmed', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    render(<FilesTable files={files} />);
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
});
