import { toCanvas } from 'html-to-image';

export async function selectionPng(elements: HTMLElement[]): Promise<Blob> {
  if (!elements.length) throw new Error('Select a component first.');
  const rects = elements.map(element => element.getBoundingClientRect());
  const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
  const width = Math.ceil(Math.max(...rects.map(r => r.right)) - left);
  const height = Math.ceil(Math.max(...rects.map(r => r.bottom)) - top);
  if (!width || !height || width * height > 32_000_000) throw new Error('Select a smaller area to copy as PNG.');
  const result = document.createElement('canvas');
  result.width = width * 2; result.height = height * 2;
  const context = result.getContext('2d');
  if (!context) throw new Error('Image export is unavailable in this browser.');
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index], rect = rects[index];
    const image = await toCanvas(element, { pixelRatio: 2, width: rect.width, height: rect.height,
      filter: node => !(node as HTMLElement).matches?.('[data-testid="selection-outline"], [data-editor-control], button[aria-label^="Resize image"]'),
    });
    context.drawImage(image, (rect.left - left) * 2, (rect.top - top) * 2, rect.width * 2, rect.height * 2);
  }
  return new Promise((resolve, reject) => result.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the image.')), 'image/png'));
}
export async function copySelectionPng(elements: HTMLElement[]) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('PNG clipboard is unavailable in this browser.');
  // Start clipboard permission during the key/click gesture, before image rendering completes.
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': selectionPng(elements) })]);
}
