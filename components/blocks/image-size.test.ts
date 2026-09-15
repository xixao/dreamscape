import { it, expect } from 'vitest';
import { resizeImage } from './image-size';
it('links dimensions only when aspect ratio is locked', () => {
  expect(resizeImage({ width: 400, height: 200, locked: true }, 'height', 300)).toEqual({ width: 600, height: 300, locked: true });
  expect(resizeImage({ width: 400, height: 200, locked: false }, 'width', 500)).toEqual({ width: 500, height: 200, locked: false });
});
