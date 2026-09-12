import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewFolderRow } from './new-folder-row';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function renderRow(folderId: string | null = null, onDone: () => void = vi.fn()) {
  return render(
    <table>
      <tbody>
        <NewFolderRow folderId={folderId} onDone={onDone} />
      </tbody>
    </table>,
  );
}

beforeEach(() => {
  refresh.mockClear();
});

describe('NewFolderRow', () => {
  it('shows a focused input labeled Folder name', () => {
    renderRow();
    const input = screen.getByLabelText('Folder name');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('placeholder', 'Folder name');
  });

  it('creates a top-level folder on Enter, refreshes and calls onDone', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ folder: { id: 'f1', name: 'Marketing' } }),
    });
    const onDone = vi.fn();
    renderRow(null, onDone);

    await userEvent.type(screen.getByLabelText('Folder name'), 'Marketing{Enter}');

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/folders',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Marketing', parentId: null }),
      }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('creates a folder under the current folder on Enter', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ folder: { id: 'f2', name: 'Q4' } }),
    });
    renderRow('parent1');

    await userEvent.type(screen.getByLabelText('Folder name'), 'Q4{Enter}');

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/folders',
      expect.objectContaining({ body: JSON.stringify({ name: 'Q4', parentId: 'parent1' }) }),
    );
  });

  it('cancels on Escape without sending a request', async () => {
    global.fetch = vi.fn();
    const onDone = vi.fn();
    renderRow(null, onDone);

    await userEvent.type(screen.getByLabelText('Folder name'), 'abc{Escape}');

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels on Enter without sending a request when the name is blank', async () => {
    global.fetch = vi.fn();
    const onDone = vi.fn();
    renderRow(null, onDone);

    await userEvent.type(screen.getByLabelText('Folder name'), '{Enter}');

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an inline error and stays open (without calling onDone) when creation fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const onDone = vi.fn();
    renderRow(null, onDone);

    await userEvent.type(screen.getByLabelText('Folder name'), 'Marketing{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the folder. Try again.');
    expect(onDone).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
