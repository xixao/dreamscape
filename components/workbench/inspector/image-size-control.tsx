'use client';
import { shiftNumericStep } from './numeric-step';
import { useEditor } from '@craftjs/core';
import { useEffect, useState } from 'react';
import { resizeImage, type ImageSize } from '@/components/blocks/image-size';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
export function ImageSizeControl({ value, onChange }: { value: ImageSize; onChange: (size: ImageSize) => void }) {
  const { dom } = useEditor(state => ({ dom: state.nodes[[...state.events.selected][0]]?.dom }));
  const [measured, setMeasured] = useState({ width: 320, height: 320 });
  useEffect(() => { if (!dom) return; const update = () => setMeasured({ width: dom.offsetWidth || 320, height: dom.offsetHeight || 320 }); const observer = new ResizeObserver(update); observer.observe(dom); update(); return () => observer.disconnect(); }, [dom]);
  const size = { width: value?.width || measured.width, height: value?.height || measured.height, locked: value?.locked ?? true };
  return <div className="space-y-3"><div className="grid grid-cols-2 gap-2">{(['width', 'height'] as const).map(axis => <label key={axis} className="text-xs capitalize">{axis} (px)<Input aria-label={`Image ${axis}`} type="number" min={1} max={10000} value={size[axis]} onKeyDown={event => shiftNumericStep(event, size[axis], next => onChange(resizeImage(size, axis, next)), 1, 10000)} onChange={event => { if (Number(event.target.value) > 0) onChange(resizeImage(size, axis, Number(event.target.value))); }} /></label>)}</div><label className="flex items-center justify-between text-xs">Lock aspect ratio<Switch aria-label="Lock aspect ratio" checked={size.locked} onCheckedChange={locked => onChange({ ...size, locked })} /></label></div>;
}
