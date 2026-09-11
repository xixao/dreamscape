import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { trayItems } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { ComponentTray } from './component-tray';

describe('ComponentTray', () => {
  it('lists every tray item with its label and hint', () => {
    renderInEditor(<ComponentTray />);
    expect(screen.getByText('Components')).toBeInTheDocument();
    for (const item of trayItems) {
      const row = screen.getByText(item.label).closest('[data-tray-item]');
      expect(row).toHaveAttribute('data-tray-item', item.type);
      expect(row).toHaveTextContent(item.hint);
    }
  });
});
