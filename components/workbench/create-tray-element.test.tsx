import { it, expect } from 'vitest';
import { Element } from '@craftjs/core';
import { createTrayElement } from './create-tray-element';
import { trayItems } from '@/components/blocks/registry';
it('uses the mounted editor component identity instead of a stale tray component', () => {
  const RegisteredImage = () => null;
  const result = createTrayElement(trayItems.find(item => item.type === 'Image')!, { Image: RegisteredImage });
  expect(result.type).toBe(RegisteredImage);
});
it('preserves canvas props when resolving a Frame', () => {
  const RegisteredFrame = () => null;
  const result = createTrayElement(trayItems.find(item => item.type === 'LayoutBox')!, { LayoutBox: RegisteredFrame });
  expect(result.type).toBe(Element);
  expect(result.props).toMatchObject({ is: RegisteredFrame, canvas: true });
});
