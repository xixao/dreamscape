import { describe, expect, it, vi, beforeEach } from 'vitest';
import { exportDiagram } from './export-actions';
import * as exportLib from '@/lib/diagram/export';

// Mock the export library
vi.mock('@/lib/diagram/export', () => ({
  renderDiagramSvg: vi.fn(),
  svgToPngBlob: vi.fn(),
}));

describe('exportDiagram', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock document.createElement
    vi.spyOn(document, 'createElement').mockImplementation((tag: string): HTMLElement => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: vi.fn(),
        } as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return {
          getContext: vi.fn(() => ({
            font: '',
            measureText: vi.fn(() => ({ width: 50 })),
          })),
        } as unknown as HTMLElement;
      }
      return {} as HTMLElement;
    });

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    // Mock svgToPngBlob
    vi.mocked(exportLib.svgToPngBlob).mockResolvedValue(new Blob(['png-data'], { type: 'image/png' }));
  });

  it('exports SVG with correct blob type', async () => {
    vi.mocked(exportLib.renderDiagramSvg).mockReturnValue({
      svg: '<svg></svg>',
      width: 100,
      height: 100,
    });

    await exportDiagram({
      format: 'svg',
      nodes: [],
      edges: [],
      frames: [],
      fileName: 'test',
      pageName: 'Page 1',
    });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image/svg+xml;charset=utf-8',
      })
    );
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('exports PNG using svgToPngBlob', async () => {
    vi.mocked(exportLib.renderDiagramSvg).mockReturnValue({
      svg: '<svg></svg>',
      width: 100,
      height: 100,
    });

    await exportDiagram({
      format: 'png',
      nodes: [],
      edges: [],
      frames: [],
      fileName: 'test',
      pageName: 'Page 1',
    });

    expect(vi.mocked(exportLib.svgToPngBlob)).toHaveBeenCalledWith('<svg></svg>');
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('revokes URL on successful download', async () => {
    vi.mocked(exportLib.renderDiagramSvg).mockReturnValue({
      svg: '<svg></svg>',
      width: 100,
      height: 100,
    });

    await exportDiagram({
      format: 'svg',
      nodes: [],
      edges: [],
      frames: [],
      fileName: 'test',
      pageName: 'Page 1',
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('returns early when renderDiagramSvg returns null (nothing exportable)', async () => {
    vi.mocked(exportLib.renderDiagramSvg).mockReturnValue(null);

    await exportDiagram({
      format: 'png',
      nodes: [],
      edges: [],
      frames: [],
      fileName: 'test',
      pageName: 'Page 1',
    });

    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('creates download with correct file name format', async () => {
    vi.mocked(exportLib.renderDiagramSvg).mockReturnValue({
      svg: '<svg></svg>',
      width: 100,
      height: 100,
    });

    const createdElements: HTMLAnchorElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag: string): HTMLElement => {
      if (tag === 'a') {
        const elem = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
        createdElements.push(elem);
        return elem as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return {
          getContext: vi.fn(() => ({
            font: '',
            measureText: vi.fn(() => ({ width: 50 })),
          })),
        } as unknown as HTMLElement;
      }
      return {} as HTMLElement;
    });

    await exportDiagram({
      format: 'png',
      nodes: [],
      edges: [],
      frames: [],
      fileName: 'My Design',
      pageName: 'Dashboard',
    });

    const anchor = createdElements[0];
    expect(anchor.download).toBe('My Design - Dashboard.png');
  });
});
