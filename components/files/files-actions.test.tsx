import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXAMPLES } from '@/lib/examples';
import { FilesActions } from './files-actions';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
});

describe('FilesActions', () => {
  it('renders New folder, the example menu and the primary new file button', () => {
    render(<FilesActions folderId={null} onNewFolder={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New from example' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New file' })).toBeInTheDocument();
  });

  it('lists every example in the menu', async () => {
    render(<FilesActions folderId={null} onNewFolder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'New from example' }));
    for (const example of EXAMPLES) {
      expect(await screen.findByRole('menuitem', { name: example.name })).toBeInTheDocument();
    }
  });

  it('calls onNewFolder when New folder is clicked, without making a request', async () => {
    global.fetch = vi.fn();
    const onNewFolder = vi.fn();
    render(<FilesActions folderId={null} onNewFolder={onNewFolder} />);

    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));

    expect(onNewFolder).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates an empty file at the top level and navigates to it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'new1', name: 'Untitled' } }),
    });

    render(<FilesActions folderId={null} onNewFolder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '+ New file' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/new1'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ folderId: null }) }),
    );
  });

  it('creates a file inside the current folder', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'new1', name: 'Untitled' } }),
    });

    render(<FilesActions folderId="folder1" onNewFolder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '+ New file' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/new1'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files',
      expect.objectContaining({ body: JSON.stringify({ folderId: 'folder1' }) }),
    );
  });

  it('creates a file from the login example in the current folder and navigates to it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'ex1', name: 'Login screen' } }),
    });

    render(<FilesActions folderId="folder1" onNewFolder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'New from example' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Login screen' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/ex1'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ example: 'login', folderId: 'folder1' }) }),
    );
  });

  it('creates a file from any other example with its own slug', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'ex2', name: 'Dashboard' } }),
    });
    const other = EXAMPLES.find((example) => example.slug !== 'login');
    if (!other) return;

    render(<FilesActions folderId={null} onNewFolder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'New from example' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: other.name }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/ex2'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files',
      expect.objectContaining({ body: JSON.stringify({ example: other.slug, folderId: null }) }),
    );
  });

  it('disables the file-creating buttons while a request is in flight, and re-enables after', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<FilesActions folderId={null} onNewFolder={vi.fn()} />);
    const newFileButton = screen.getByRole('button', { name: '+ New file' });
    const exampleButton = screen.getByRole('button', { name: 'New from example' });

    await userEvent.click(newFileButton);
    expect(newFileButton).toBeDisabled();
    expect(exampleButton).toBeDisabled();

    resolveFetch({ ok: true, status: 201, json: async () => ({ file: { id: 'x' } }) });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/x'));
    expect(newFileButton).toBeEnabled();
    expect(exampleButton).toBeEnabled();
  });

  it('shows an inline error and does not navigate when the create request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });

    render(<FilesActions folderId={null} onNewFolder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '+ New file' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the file. Try again.');
    expect(push).not.toHaveBeenCalled();
  });

  it('clears the create error on the next attempt', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ file: { id: 'new2' } }) });

    render(<FilesActions folderId={null} onNewFolder={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '+ New file' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+ New file' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/new2'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
