'use client';

import type { DesignerKind } from '@/lib/accessibility/designer-kit';
import { ANNOTATION_DRAG, ANNOTATION_MIME, readAnnotationPreset, type Annotation, type Category } from '@/lib/accessibility/kit';
import { useEffect, useState, type DragEvent } from 'react';
import { DIAGRAM_DRAG_EVENT, DIAGRAM_SHAPE_MIME, readDiagramShape } from '@/lib/diagram/insertion';
import type { DiagramNodeKind } from '@/lib/diagram/store';
import { toCanvasPoint, type Point, type Viewport } from '@/lib/canvas/viewport';

/** Covers frame iframes only during a palette drag, so drops reach the canvas. */
export function DiagramDropSurface({ viewport, onInsert, onAnnotation }: {
  onAnnotation?: (category: Category, format: Annotation['format'], point: Point, template?: DesignerKind) => void;
  viewport: Viewport;
  onInsert: (kind: DiagramNodeKind, point: Point) => void;
}) {
  const [annotation, setAnnotation] = useState<ReturnType<typeof readAnnotationPreset>>(null);
  const [kind, setKind] = useState<DiagramNodeKind | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  useEffect(() => {
    const start = (event: Event) => { setKind(readDiagramShape((event as CustomEvent<string>).detail)); setPoint(null); };
    const annotationStart = (event: Event) => { setAnnotation(readAnnotationPreset((event as CustomEvent<string>).detail)); setPoint(null); };
    const end = () => { setKind(null); setAnnotation(null); setPoint(null); };
    window.addEventListener(ANNOTATION_DRAG, annotationStart);
    window.addEventListener(DIAGRAM_DRAG_EVENT, start);
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener(ANNOTATION_DRAG, annotationStart);
      window.removeEventListener(DIAGRAM_DRAG_EVENT, start);
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
      window.removeEventListener('blur', end);
    };
  }, []);
  function localPoint(event: DragEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  if (!kind && !annotation) return null;
  return <div
    data-testid="diagram-drop-surface"
    className="absolute inset-0 z-30"
    onDragOver={event => {
      if (!event.dataTransfer.types.includes(DIAGRAM_SHAPE_MIME) && !event.dataTransfer.types.includes(ANNOTATION_MIME)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setPoint(localPoint(event));
    }}
    onDragLeave={() => setPoint(null)}
    onDrop={event => {
      const shape = readDiagramShape(event.dataTransfer.getData(DIAGRAM_SHAPE_MIME));
      event.preventDefault(); event.stopPropagation();
      const preset = readAnnotationPreset(event.dataTransfer.getData(ANNOTATION_MIME));
      if (preset) {
        const point=toCanvasPoint(localPoint(event),viewport);
        if(preset.template)onAnnotation?.(preset.category,preset.format,point,preset.template);
        else onAnnotation?.(preset.category,preset.format,point);
      }
      else if (shape) onInsert(shape, toCanvasPoint(localPoint(event), viewport));
      setAnnotation(null);
      setKind(null); setPoint(null);
    }}
  >
    {point && <div className="pointer-events-none absolute rounded border border-acc bg-acc/10" style={{ left: point.x - 24, top: point.y - 16, width: 48, height: 32 }} />}
  </div>;
}
