import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('renders the secondary example button and the primary new file button', () => {
    render(<FilesActions />);
    expect(screen.getByRole('button', { name: 'New from example: Login screen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New file' })).toBeInTheDocument();
  });

  it('creates an empty file and navigates to it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'new1', name: 'Untitled' } }),
    });

    render(<FilesActions />);
    await userEvent.click(screen.getByRole('button', { name: '+ New file' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/new1'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) }),
    );
  });

  it('creates a file from the login example and navigates to it', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'ex1', name: 'Login screen' } }),
    });

    render(<FilesActions />);
    await userEvent.click(screen.getByRole('button', { name: 'New from example: Login screen' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/ex1'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/files',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ example: 'login' }) }),
    );
  });

  it('disables both buttons while a request is in flight, and re-enables after', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<FilesActions />);
    const newFileButton = screen.getByRole('button', { name: '+ New file' });
    const exampleButton = screen.getByRole('button', { name: 'New from example: Login screen' });

    await userEvent.click(newFileButton);
    expect(newFileButton).toBeDisabled();
    expect(exampleButton).toBeDisabled();

    resolveFetch({ ok: true, status: 201, json: async () => ({ file: { id: 'x' } }) });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/f/x'));
    expect(newFileButton).toBeEnabled();
    expect(exampleButton).toBeEnabled();
  });
});
