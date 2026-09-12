import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { trayItems } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { ComponentTray, filterTrayItems } from './component-tray';

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

  it('filterTrayItems keeps every item for a blank or whitespace query', () => {
    expect(filterTrayItems(trayItems, '')).toEqual(trayItems);
    expect(filterTrayItems(trayItems, '')).toHaveLength(trayItems.length);
    expect(filterTrayItems(trayItems, '   ')).toEqual(trayItems);
    expect(filterTrayItems(trayItems, '   ')).toHaveLength(trayItems.length);
  });

  it('filterTrayItems matches label, hint or type case-insensitively', () => {
    expect(filterTrayItems(trayItems, 'textarea').map((item) => item.type)).toEqual(['Textarea']);
    expect(filterTrayItems(trayItems, 'CONTAINER').map((item) => item.type)).toEqual(['LayoutBox']);
    expect(filterTrayItems(trayItems, 'zzz')).toEqual([]);
  });

  it('filters the rendered rows as the user types, and clears back to the full list', async () => {
    const { container } = renderInEditor(<ComponentTray />);
    const input = screen.getByLabelText('Search components');

    await userEvent.type(input, 'dia');
    const matched = container.querySelectorAll('[data-tray-item]');
    expect(matched).toHaveLength(1);
    expect(matched[0]).toHaveAttribute('data-tray-item', 'Dialog');

    await userEvent.clear(input);
    await userEvent.type(input, 'zzz');
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(0);
    expect(screen.getByText('No components match.')).toBeInTheDocument();

    await userEvent.clear(input);
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(trayItems.length);
  });
});
