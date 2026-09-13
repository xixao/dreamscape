import { renderDiagramSvg, svgToPngBlob, type ExportFrame, type MeasureText } from '@/lib/diagram/export';
import type { DiagramEdge, DiagramNode, DiagramSelection } from '@/lib/diagram/store';

export interface ExportDiagramInput {
  format: 'png' | 'svg';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  selection?: DiagramSelection;
  frames: ExportFrame[];
  fileName: string;
  pageName: string;
}

/**
 * Exports a diagram selection (or the whole diagram if selection is omitted)
 * as PNG or SVG, triggering a browser download. Handles text measurement via
 * canvas and SVG-to-PNG rasterisation at 2x scale.
 */
export async function exportDiagram(input: ExportDiagramInput): Promise<void> {
  const { format, nodes, edges, selection, frames, fileName, pageName } = input;

  // Create a canvas measurer for text wrapping and label sizing
  const createCanvasMeasureText = (): MeasureText => {
    const context = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    return (text, font) => {
      if (!context) return text.length * font.size * 0.6;
      context.font = `${font.weight ?? 400} ${font.size}px ${font.family}`;
      return context.measureText(text).width;
    };
  };

  const measureText = createCanvasMeasureText();

  // Render the diagram to SVG
  const result = renderDiagramSvg({ nodes, edges, frames, selection, measureText });
  if (!result) return;

  // Create the blob
  const blob =
    format === 'svg' ? new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }) : await svgToPngBlob(result.svg);

  // Trigger the download
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName} - ${pageName}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
