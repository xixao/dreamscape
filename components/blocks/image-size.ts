export interface ImageSize { width: number; height: number; locked: boolean }
export function resizeImage(size: ImageSize, axis: 'width' | 'height', value: number): ImageSize {
  const next = Math.max(1, Math.min(10000, Math.round(value)));
  const ratio = size.width / size.height || 1;
  return { ...size, [axis]: next, ...(size.locked ? axis === 'width' ? { height: Math.max(1, Math.round(next / ratio)) } : { width: Math.max(1, Math.round(next * ratio)) } : {}) };
}

export function applyImageAspect(props: Record<string, unknown>, aspect: unknown) {
  const size = props.size as ImageSize | undefined;
  const ratio = ({ square: 1, video: 16 / 9, portrait: 3 / 4, wide: 21 / 9 } as Record<string, number>)[String(aspect)];
  if (size?.width && ratio) props.size = { ...size, height: Math.round(size.width / ratio) };
}
