import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileSummary, FolderSummary } from '@/lib/files/repository';
import { FilesPage } from './files-page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

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

function file(overrides: Partial<FileSummary> & { id: string; name: string }): FileSummary {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const marketing = folder({ id: 'marketing1', name: 'Marketing', parentId: null });
const q4 = folder({ id: 'q4-1', name: 'Q4', parentId: 'marketing1' });

describe('FilesPage - title and breadcrumb per level', () => {
  it('shows "Files" as the title with no breadcrumb eyebrow above it at the top level (Matt, 2026-09-14: "get rid of the eyebrow \'Files\' text above the Files header")', () => {
    render(<FilesPage path={[]} folders={[]} files={[]} folderId={null} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Files' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'breadcrumb' })).toBeNull();
  });

  it('shows the folder name as the title and "Files > Marketing" one level deep', () => {
    render(<FilesPage path={[marketing]} folders={[]} files={[]} folderId="marketing1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Marketing' })).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByText('Marketing')).toBeInTheDocument();
    expect(within(breadcrumb).getByText('Marketing').closest('a')).toBeNull();
  });

  it('shows "Files > Marketing > Q4" two levels deep, with only the current crumb plain', () => {
    render(<FilesPage path={[marketing, q4]} folders={[]} files={[]} folderId="q4-1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Q4' })).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Files' })).toHaveAttribute('href', '/');
    expect(within(breadcrumb).getByRole('link', { name: 'Marketing' })).toHaveAttribute(
      'href',
      '/folders/marketing1',
    );
    expect(within(breadcrumb).getByText('Q4')).toBeInTheDocument();
    expect(within(breadcrumb).getByText('Q4').closest('a')).toBeNull();
  });
});

describe('FilesPage - counts', () => {
  it('shows both counts, pluralized', () => {
    render(
      <FilesPage
        path={[]}
        folders={[marketing, folder({ id: 'f2', name: 'Ops' })]}
        files={[file({ id: 'file1', name: 'A' })]}
        folderId={null}
      />,
    );
    expect(screen.getByText('2 folders, 1 file')).toBeInTheDocument();
  });

  it('uses singular forms for exactly one folder or one file', () => {
    const { rerender } = render(<FilesPage path={[]} folders={[marketing]} files={[]} folderId={null} />);
    expect(screen.getByText('1 folder')).toBeInTheDocument();

    rerender(<FilesPage path={[]} folders={[]} files={[file({ id: 'file1', name: 'A' })]} folderId={null} />);
    expect(screen.getByText('1 file')).toBeInTheDocument();
  });

  it('omits the zero part instead of showing "0 folders" or "0 files"', () => {
    render(<FilesPage path={[]} folders={[]} files={[file({ id: 'file1', name: 'A' })]} folderId={null} />);
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.queryByText(/0 folders/)).toBeNull();
  });

  it('shows no count text at all when the level is completely empty', () => {
    render(<FilesPage path={[]} folders={[]} files={[]} folderId={null} />);
    // Anchored to a leading digit so this can't accidentally match the
    // "New folder" action button's label.
    expect(screen.queryByText(/^\d+ (folders?|files?)/)).toBeNull();
  });
});

describe('FilesPage - actions wiring', () => {
  it('shows the inline New folder row in the table when New folder is clicked', async () => {
    render(<FilesPage path={[]} folders={[]} files={[]} folderId={null} />);

    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));

    expect(screen.getByLabelText('Folder name')).toBeInTheDocument();
  });

  it('creates a new file inside the current folder from a nested level', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ file: { id: 'newfile' } }),
    });

    render(<FilesPage path={[marketing]} folders={[]} files={[]} folderId="marketing1" />);
    await userEvent.click(screen.getByRole('button', { name: '+ New file' }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/files',
        expect.objectContaining({ body: JSON.stringify({ folderId: 'marketing1' }) }),
      ),
    );
  });

  it('renders folders before files in the table', () => {
    render(
      <FilesPage
        path={[]}
        folders={[marketing]}
        files={[file({ id: 'file1', name: 'A file' })]}
        folderId={null}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Marketing')).toBeInTheDocument();
    expect(within(rows[1]).getByText('A file')).toBeInTheDocument();
  });
});

describe('FilesPage - source download', () => {
  it('has a header link next to the Dreamscape name that downloads the zipped source', () => {
    render(<FilesPage path={[]} folders={[]} files={[]} folderId={null} />);

    const link = screen.getByRole('link', { name: 'Download Dreamscape source' });
    expect(link).toHaveAttribute('href', '/dreamscape-source.zip');
    expect(link).toHaveAttribute('download');
  });
});
