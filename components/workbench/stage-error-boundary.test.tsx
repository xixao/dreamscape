import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { StageErrorBoundary } from './stage-error-boundary';

function Throws(): never {
  throw new Error('boom');
}

describe('StageErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <StageErrorBoundary fileId="file123">
        <p>All good</p>
      </StageErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.queryByText('This file could not be opened.')).toBeNull();
  });

  it('renders the fallback with the message, a link back to files and a Reset file button', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <StageErrorBoundary fileId="file123">
        <Throws />
      </StageErrorBoundary>,
    );

    expect(screen.getByText('This file could not be opened.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to files' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Reset file' })).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('Reset file PATCHes the empty layout with no baseUpdatedAt and then reloads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ updatedAt: 'T1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

    render(
      <StageErrorBoundary fileId="file123">
        <Throws />
      </StageErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reset file' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/files/file123');
    expect(init.method).toBe('PATCH');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ layout: emptyLayoutJson() });

    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reloads even when the reset request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const reloadSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

    render(
      <StageErrorBoundary fileId="file123">
        <Throws />
      </StageErrorBoundary>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Reset file' }));
    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
