import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { renderTree, renderPlayTree } from '@/test/craft-harness';
import { LayoutBox } from './layout-box';
import { Button } from './button';
import { Textarea } from './textarea';
import { designStyle } from './design-controls';

describe('prompt composer atoms', () => {
  it('composes a rounded shell, borderless entry, and accessible icon actions', () => {
    renderTree(<Element is={LayoutBox} canvas cornerRadius={24} borderWidth={1} borderColor="#888888" fillColor="#ffffff" paddingTopPx={12} paddingRightPx={16} paddingBottomPx={8} paddingLeftPx={16} widthMode="fill">
      <Textarea borderless autoGrow placeholder="Ask anything" minHeightPx={64} maxHeightPx={200} />
      <Element is={LayoutBox} canvas direction={{ mobile: 'row' }} justify={{ mobile: 'between' }}>
        <Button icon="paperclip" iconOnly accessibleLabel="Attach a file" variant="ghost" circular />
        <Button icon="arrowUp" iconOnly accessibleLabel="Send message" circular />
      </Element>
    </Element>);
    const textarea = screen.getByPlaceholderText('Ask anything');
    expect(textarea.style.borderWidth).toBe('0px');
    expect(textarea.style.maxHeight).toBe('200px');
    expect(textarea.style.resize).toBe('none');
    expect(screen.getByRole('button', { name: 'Send message' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveStyle({ borderRadius: '50%' });
    expect(textarea.closest('[data-block="LayoutBox"]')).toHaveStyle({ borderRadius: '24px', paddingLeft: '16px', width: '100%' });
  });
  it('grows input to its maximum and shrinks when text is removed', () => {
    renderPlayTree(<Element is={LayoutBox} canvas><Textarea autoGrow minHeightPx={64} maxHeightPx={200} placeholder="Message" /></Element>);
    const textarea = screen.getByPlaceholderText('Message');
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 350 });
    fireEvent.input(textarea, { target: { value: 'Long message' } });
    expect(textarea).toHaveStyle({ height: '200px', overflowY: 'auto' });
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 40 });
    fireEvent.input(textarea, { target: { value: '' } });
    expect(textarea).toHaveStyle({ height: '64px', overflowY: 'hidden' });
  });
  it('keeps unspecified styling absent and resolves explicit dimensions', () => {
    expect(designStyle({})).toEqual({});
    expect(designStyle({ widthMode: 'fixed', widthPx: 320, heightMode: 'fit', cornerRadius: 0 })).toMatchObject({ width: 320, height: 'fit-content', borderRadius: 0 });
  });
});
