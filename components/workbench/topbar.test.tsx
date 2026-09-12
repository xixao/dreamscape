import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Frame, ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { Topbar, stageReadout } from './topbar';

function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
}

describe('stageReadout', () => {
  it('shows width, breakpoint and zoom only when scaled', () => {
    expect(stageReadout(1440, 'desktop', 1)).toBe('1440 px · desktop');
    expect(stageReadout(375, 'mobile', 1)).toBe('375 px · mobile');
    expect(stageReadout(1440, 'desktop', 0.72)).toBe('1440 px · desktop · 72%');
  });
});

describe('Topbar', () => {
  it('marks the active preset and switches width on click', async () => {
    renderInEditor(<Topbar onNew={() => {}} />, { width: 1440 });
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px · desktop');
    expect(presetButton('Desktop')).toHaveAttribute('data-state', 'on');
    expect(presetButton('Mobile')).toHaveAttribute('data-state', 'off');

    await userEvent.click(presetButton('Tablet'));
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('768 px · desktop');
    expect(presetButton('Tablet')).toHaveAttribute('data-state', 'on');

    await userEvent.click(presetButton('Mobile'));
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('375 px · mobile');
  });

  it('shows no active preset at a custom width', () => {
    renderInEditor(<Topbar onNew={() => {}} />, { width: 900 });
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('900 px · desktop');
    for (const label of ['Mobile', 'Tablet', 'Desktop']) {
      expect(presetButton(label)).toHaveAttribute('data-state', 'off');
    }
  });

  it('enables Undo and Redo as the history changes', async () => {
    const { editor } = renderInEditor(
      <>
        <Frame data={emptyLayoutJson()} />
        <Topbar onNew={() => {}} />
      </>,
    );
    await screen.findByText('This frame is empty');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    editor().actions.setProp(ROOT_NODE, (props: { gap: number }) => {
      props.gap = 8;
    });
    await waitFor(() => expect(undo).toBeEnabled());

    await userEvent.click(undo);
    await waitFor(() => expect(redo).toBeEnabled());
    expect(undo).toBeDisabled();
  });

  it('calls onNew', async () => {
    const onNew = vi.fn();
    renderInEditor(<Topbar onNew={onNew} />);
    await userEvent.click(screen.getByRole('button', { name: 'New frame' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
