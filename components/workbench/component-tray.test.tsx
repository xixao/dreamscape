import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { trayItems, type TrayGroup } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { ComponentTray, filterTrayItems } from './component-tray';

const GROUP_ORDER: TrayGroup[] = ['Layout', 'Text and media', 'Forms', 'Feedback', 'Data'];

describe('ComponentTray', () => {
  it('shows every tray item by its label', () => {
    renderInEditor(<ComponentTray />);
    for (const item of trayItems) {
      const row = screen.getByText(item.label).closest('[data-tray-item]');
      expect(row).toHaveAttribute('data-tray-item', item.type);
    }
  });

  // The Components tab now renders this content inside the right panel's own
  // <aside> (Inspector owns that panel chrome and its header) - see
  // docs/superpowers/specs/2026-09-12-panels-and-zoom-design.md section 1.
  // ComponentTray must not bring a second, nested landmark or panel title of
  // its own.
  it('renders no panel chrome of its own: no landmark, no "Components" title', () => {
    renderInEditor(<ComponentTray />);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Components')).toBeNull();
  });

  it('renders the five group headings in the spec order', () => {
    const { container } = renderInEditor(<ComponentTray />);
    const headings = Array.from(container.querySelectorAll<HTMLElement>('[data-tray-group]')).map(
      (el) => el.textContent,
    );
    expect(headings).toEqual(GROUP_ORDER);
  });

  it('lists each tray item under its own group heading, in the registry order', () => {
    const { container } = renderInEditor(<ComponentTray />);
    for (const group of GROUP_ORDER) {
      const section = container.querySelector<HTMLElement>(`[data-tray-section="${group}"]`)!;
      const itemsInSection = Array.from(section.querySelectorAll('[data-tray-item]')).map((el) =>
        el.getAttribute('data-tray-item'),
      );
      const expected = trayItems.filter((item) => item.group === group).map((item) => item.type);
      expect(itemsInSection).toEqual(expected);
    }
  });

  it('renders no hint text for any tray item', () => {
    renderInEditor(<ComponentTray />);
    // These were the old per-item hint strings; none of them should appear anywhere now.
    expect(screen.queryByText('Auto layout container')).not.toBeInTheDocument();
    expect(screen.queryByText('Header and content area')).not.toBeInTheDocument();
    expect(screen.queryByText('shadcn Button')).not.toBeInTheDocument();
    expect(screen.queryByText('Dropdown trigger')).not.toBeInTheDocument();
  });

  it('filterTrayItems keeps every item for a blank or whitespace query', () => {
    expect(filterTrayItems(trayItems, '')).toEqual(trayItems);
    expect(filterTrayItems(trayItems, '')).toHaveLength(trayItems.length);
    expect(filterTrayItems(trayItems, '   ')).toEqual(trayItems);
    expect(filterTrayItems(trayItems, '   ')).toHaveLength(trayItems.length);
  });

  it('filterTrayItems matches label or type case-insensitively, and only those two fields', () => {
    expect(filterTrayItems(trayItems, 'textarea').map((item) => item.type)).toEqual(['Textarea']);
    expect(filterTrayItems(trayItems, 'FRAME').map((item) => item.type)).toEqual(['LayoutBox']);
    expect(filterTrayItems(trayItems, 'radio').map((item) => item.type)).toEqual(['RadioGroup']);
    // "container" used to be part of LayoutBox's now-removed hint text; it must not match anymore.
    expect(filterTrayItems(trayItems, 'container')).toEqual([]);
    expect(filterTrayItems(trayItems, 'zzz')).toEqual([]);
  });

  it('hides a group entirely when the search filters out all of its items', async () => {
    const { container } = renderInEditor(<ComponentTray />);
    const input = screen.getByLabelText('Search components');

    await userEvent.type(input, 'table');
    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-tray-section]'));
    expect(sections.map((section) => section.dataset.traySection)).toEqual(['Data']);
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(1);
    expect(container.querySelector('[data-tray-item="Table"]')).toBeInTheDocument();
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
    expect(container.querySelectorAll('[data-tray-section]')).toHaveLength(0);
    expect(screen.getByText('No components match.')).toBeInTheDocument();

    await userEvent.clear(input);
    expect(container.querySelectorAll('[data-tray-item]')).toHaveLength(trayItems.length);
    expect(screen.queryByText('No components match.')).not.toBeInTheDocument();
  });
});
