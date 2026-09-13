import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { Card } from '@/components/blocks/card';
import { LayoutBox } from '@/components/blocks/layout-box';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { useStage } from '../stage-context';
import { Inspector, type PanelMode } from './inspector';

function WidthProbe() {
  return <output data-testid="width">{useStage().width}</output>;
}

const ONE_SCREEN: Screen[] = [{ id: 's1', name: 'Frame 1', layout: '{}', stageWidth: 1440 }];

function mount(
  width = 1440,
  {
    panelMode = 'design',
    onPanelModeChange = vi.fn(),
    collapsed = false,
    onToggleCollapsed = vi.fn(),
  }: {
    panelMode?: PanelMode;
    onPanelModeChange?: (mode: PanelMode) => void;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
  } = {},
) {
  return renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          <Card title="Billing" />
          <Button label="Pay" />
        </Element>
      </Frame>
      <Inspector
        screens={ONE_SCREEN}
        currentScreenId="s1"
        panelMode={panelMode}
        onPanelModeChange={onPanelModeChange}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      <WidthProbe />
    </>,
    { width },
  );
}

async function select(editor: ReturnType<typeof mount>['editor'], pick: 'root' | 'card' | 'button') {
  const nodes = editor().query.node(ROOT_NODE).get().data.nodes;
  const id = pick === 'root' ? ROOT_NODE : pick === 'card' ? nodes[0] : nodes[1];
  act(() => editor().actions.selectNode(id));
  await waitFor(() => expect(editor().query.getEvent('selected').contains(id)).toBe(true));
  return id;
}

describe('Inspector', () => {
  it('shows the empty state when nothing is selected', async () => {
    mount();
    await screen.findByText('Billing');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    expect(within(panel).getByText('Nothing selected')).toBeInTheDocument();
    expect(within(panel).getByText('Select a layer on the canvas to edit it.')).toBeInTheDocument();
  });

  it('builds the fields for a selected Button from its schema and edits them', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    const buttonId = await select(editor, 'button');
    const panel = screen.getByRole('complementary', { name: 'Design' });

    expect(within(panel).getByTestId('inspector-type')).toHaveTextContent('Button');
    expect(within(panel).getByText('Frame')).toBeInTheDocument();
    for (const section of ['Auto layout', 'Content', 'Appearance']) {
      expect(within(panel).getByRole('heading', { name: section })).toBeInTheDocument();
    }
    expect(within(panel).queryByRole('heading', { name: 'Editor' })).toBeNull();

    const label = within(panel).getByLabelText('Label');
    expect(label).toHaveValue('Pay');
    await userEvent.clear(label);
    await userEvent.type(label, 'Checkout');
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.label).toBe('Checkout'));

    await userEvent.click(within(panel).getByText('Small'));
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.size).toBe('sm'));

    await userEvent.click(within(panel).getByRole('switch', { name: 'Fill container' }));
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.grow).toBe(true));

    expect(within(panel).getByRole('combobox', { name: 'Variant' })).toHaveTextContent('Default');
  });

  it('edits the current breakpoint of a LayoutBox and jumps to the other one', async () => {
    const { editor } = mount(375);
    await screen.findByText('Billing');
    await select(editor, 'root');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    expect(within(panel).getByTestId('inspector-type')).toHaveTextContent('Frame');

    const direction = within(panel).getByText('Direction').closest('[data-field]') as HTMLElement;
    expect(within(direction).getByText('mobile')).toBeInTheDocument();
    // The root here is a bare `<Element is={LayoutBox} canvas>`, so it takes
    // LayoutBox.craft.props (LAYOUT_BOX_DEFAULTS from lib/classes.ts), whose
    // `direction` default is `{ mobile: 'column', desktop: 'row' }` -- not the
    // app's ROOT_LAYOUT_PROPS override (`desktop: 'column'`), which only applies
    // via emptyLayoutJson()/renderTree(). Verified directly against the
    // installed default, independent of the Inspector code under test.
    expect(within(direction).getByTestId('breakpoint-caption')).toHaveTextContent('desktop: row');

    await userEvent.click(within(direction).getByText('Horizontal'));
    await waitFor(() =>
      expect(editor().query.node(ROOT_NODE).get().data.props.direction).toEqual({
        mobile: 'row',
        desktop: 'row',
      }),
    );

    await userEvent.click(within(direction).getByTestId('breakpoint-caption'));
    await waitFor(() => expect(screen.getByTestId('width')).toHaveTextContent('1440'));
  });

  it('hides Grow and Delete for the root and counts a container\'s children', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    await select(editor, 'root');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    expect(within(panel).queryByRole('switch', { name: 'Fill container' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(panel).getByText('2 items')).toBeInTheDocument();

    await select(editor, 'card');
    expect(within(panel).getByText('0 items')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('deletes the selected block', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    await select(editor, 'button');
    const panel = screen.getByRole('complementary', { name: 'Design' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pay' })).toBeNull());
    expect(within(panel).getByText('Nothing selected')).toBeInTheDocument();
  });

  describe('Design / Prototype / Components panel mode', () => {
    it('shows a Design | Prototype | Components segmented control, Design active by default', () => {
      mount();
      const seg = screen.getByRole('radiogroup', { name: 'Panel mode' });
      expect(within(seg).getByRole('radio', { name: 'Design' })).toHaveAttribute('data-state', 'on');
      expect(within(seg).getByRole('radio', { name: 'Prototype' })).toHaveAttribute('data-state', 'off');
      expect(within(seg).getByRole('radio', { name: 'Components' })).toHaveAttribute('data-state', 'off');
    });

    it('calls onPanelModeChange when Prototype is clicked', async () => {
      const onPanelModeChange = vi.fn();
      mount(1440, { onPanelModeChange });
      await userEvent.click(screen.getByRole('radio', { name: 'Prototype' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('prototype');
    });

    it('calls onPanelModeChange when Components is clicked', async () => {
      const onPanelModeChange = vi.fn();
      mount(1440, { onPanelModeChange });
      await userEvent.click(screen.getByRole('radio', { name: 'Components' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('components');
    });

    it('shows the Prototype tab content instead of the Design fields when panelMode is prototype', async () => {
      const { editor } = mount(1440, { panelMode: 'prototype' });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).getByText('Select a layer to add an interaction.')).toBeInTheDocument();
      expect(within(panel).queryByText('Nothing selected')).toBeNull();

      await select(editor, 'button');
      expect(within(panel).getByRole('combobox', { name: 'On click' })).toBeInTheDocument();
      expect(within(panel).queryByTestId('inspector-type')).toBeNull();
    });

    it('shows the Components tab content (search field, grouped list, drag sources) when panelMode is components', async () => {
      mount(1440, { panelMode: 'components' });
      await screen.findByText('Billing');
      const panel = screen.getByRole('complementary', { name: 'Design' });

      expect(within(panel).getByLabelText('Search components')).toBeInTheDocument();
      expect(within(panel).getByText('Layout')).toBeInTheDocument();
      expect(within(panel).getByText('Frame')).toBeInTheDocument();
      expect(within(panel).queryByText('Nothing selected')).toBeNull();
      expect(within(panel).queryByText('Select a layer to add an interaction.')).toBeNull();
    });

    it('keeps the tab list keyboard operable with three items (roving focus)', async () => {
      mount();
      const design = screen.getByRole('radio', { name: 'Design' });
      const prototype = screen.getByRole('radio', { name: 'Prototype' });
      const components = screen.getByRole('radio', { name: 'Components' });

      design.focus();
      expect(design).toHaveFocus();

      await userEvent.keyboard('{ArrowRight}');
      expect(prototype).toHaveFocus();

      await userEvent.keyboard('{ArrowRight}');
      expect(components).toHaveFocus();

      await userEvent.keyboard('{ArrowLeft}');
      expect(prototype).toHaveFocus();
    });
  });

  describe('Minimize panel', () => {
    it('shows a Minimize panel button when expanded; clicking it calls onToggleCollapsed', async () => {
      const onToggleCollapsed = vi.fn();
      mount(1440, { onToggleCollapsed });
      const button = screen.getByRole('button', { name: 'Minimize panel' });
      expect(button).toHaveAttribute('aria-expanded', 'true');

      await userEvent.click(button);
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });

    it('collapses to a rail with an Expand panel button and the three tab icons, hiding the tab list and fields', () => {
      mount(1440, { collapsed: true });
      const panel = screen.getByRole('complementary', { name: 'Design' });

      const expandButton = within(panel).getByRole('button', { name: 'Expand panel' });
      expect(expandButton).toHaveAttribute('aria-expanded', 'false');
      expect(within(panel).getByRole('button', { name: 'Design' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Prototype' })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Components' })).toBeInTheDocument();
      expect(within(panel).queryByRole('radiogroup', { name: 'Panel mode' })).toBeNull();
      expect(within(panel).queryByText('Nothing selected')).toBeNull();
    });

    it('clicking a rail icon expands the panel on that tab', async () => {
      const onPanelModeChange = vi.fn();
      const onToggleCollapsed = vi.fn();
      mount(1440, { collapsed: true, onPanelModeChange, onToggleCollapsed });
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Prototype' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('prototype');
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });

    it('clicking the Components rail icon selects Components and expands', async () => {
      const onPanelModeChange = vi.fn();
      const onToggleCollapsed = vi.fn();
      mount(1440, { collapsed: true, onPanelModeChange, onToggleCollapsed });
      const panel = screen.getByRole('complementary', { name: 'Design' });

      await userEvent.click(within(panel).getByRole('button', { name: 'Components' }));
      expect(onPanelModeChange).toHaveBeenCalledWith('components');
      expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    });
  });
});
