import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('commits on blur (clicking away), not just Enter (Matt, 2026-09-14: "there\'s no way for it to register as \'done\' when typing the folder name")', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ folder: { id: 'f3', name: 'Design' } }),
    });
    const onDone = vi.fn();
    renderRow(null, onDone);

    await userEvent.type(screen.getByLabelText('Folder name'), 'Design');
    await userEvent.click(document.body);

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      '/api/folders',
      expect.objectContaining({ body: JSON.stringify({ name: 'Design', parentId: null }) }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('cancels on blur without sending a request when the name is blank', async () => {
    global.fetch = vi.fn();
    const onDone = vi.fn();
    renderRow(null, onDone);

    screen.getByLabelText('Folder name').focus();
    await userEvent.click(document.body);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('disables the input while the request is in flight, and re-enables it if creation fails', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    renderRow();
    const input = screen.getByLabelText('Folder name');

    await userEvent.type(input, 'Marketing{Enter}');
    expect(input).toBeDisabled();

    resolveFetch({ ok: false, status: 500, json: async () => ({}) });
    await screen.findByRole('alert');
    expect(input).toBeEnabled();
  });

  it('does not send a second request if disabling the input on Enter also blurs it', async () => {
    // Setting `disabled` on a focused input fires a real browser blur as a
    // side effect (jsdom does not reproduce this quirk, so it is fired by
    // hand here) - without the `pending` guard in commit(), that blur
    // would re-enter commit() through the input's own onBlur handler for
    // the same keypress and send a second POST.
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onDone = vi.fn();
    renderRow(null, onDone);
    const input = screen.getByLabelText('Folder name');

    await userEvent.type(input, 'Marketing{Enter}');
    expect(input).toBeDisabled();
    fireEvent.blur(input);

    resolveFetch({ ok: true, status: 201, json: async () => ({ folder: { id: 'f4', name: 'Marketing' } }) });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not reopen or resend after Escape, even though it also blurs the input', async () => {
    global.fetch = vi.fn();
    const onDone = vi.fn();
    renderRow(null, onDone);

    await userEvent.type(screen.getByLabelText('Folder name'), 'abc{Escape}');
    expect(onDone).toHaveBeenCalledTimes(1);

    // Same input node still exists in this render (the row's own removal
    // is the parent's job, driven by onDone); firing the blur it would
    // realistically receive on the way out must still be a no-op.
    screen.getByLabelText('Folder name').blur();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
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
