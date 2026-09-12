import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InteractionTag } from './interaction-tag';

describe('InteractionTag', () => {
  it('renders the given text at the node\'s top-right corner', () => {
    const rect = { top: 10, left: 20, width: 100 } as DOMRect;
    render(<InteractionTag rect={rect} text="→ Hello world" />);

    const tag = screen.getByTestId('interaction-tag');
    expect(tag).toHaveTextContent('→ Hello world');
    expect(tag).toHaveStyle({ top: '10px', left: '120px' });
  });

  it('renders a Back tag the same way', () => {
    const rect = { top: 0, left: 0, width: 50 } as DOMRect;
    render(<InteractionTag rect={rect} text="← Back" />);
    expect(screen.getByTestId('interaction-tag')).toHaveTextContent('← Back');
  });
});
