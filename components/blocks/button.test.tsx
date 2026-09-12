import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Button } from './button';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Button block', () => {
  it('renders the shadcn button with label, variant and size', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Save changes" variant="destructive" size="sm" />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Save changes' });
    expect(button).toHaveAttribute('data-block', 'Button');
    expect(button).toHaveClass('bg-destructive/10');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('uses the defaults when no props are given', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Button' });
    expect(button).toHaveClass('bg-primary');
  });

  it('shows disabled as aria-disabled so it stays selectable', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Off" disabled />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Off' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveClass('opacity-50');
  });

  it('applies grow', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Wide" grow />
      </Element>,
    );
    expect(await screen.findByRole('button', { name: 'Wide' })).toHaveClass('flex-1');
  });
});

async function wireInteraction(
  editor: ReturnType<typeof renderPlayTree>['editor'],
  interaction: Record<string, unknown>,
): Promise<string> {
  const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
  act(() => {
    editor().actions.setCustom(id, (custom: Record<string, unknown>) => {
      custom.interactions = [interaction];
    });
  });
  await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());
  return id;
}

describe('Button in play mode', () => {
  it('calls navigate when the wired interaction is a navigate action', async () => {
    const play = makePlayValue();
    const { editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Button label="Go" />
      </Element>,
      play,
    );
    await screen.findByRole('button', { name: 'Go' });
    await wireInteraction(editor, { id: 'i1', trigger: 'click', action: 'navigate', targetScreenId: 's2' });

    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(play.navigate).toHaveBeenCalledWith('s2');
  });

  it('calls back when the wired interaction is a back action', async () => {
    const play = makePlayValue();
    const { editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Button label="Go back" />
      </Element>,
      play,
    );
    await screen.findByRole('button', { name: 'Go back' });
    await wireInteraction(editor, { id: 'i1', trigger: 'click', action: 'back' });

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));

    expect(play.back).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no wired interaction', async () => {
    const play = makePlayValue();
    renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Button label="Idle" />
      </Element>,
      play,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Idle' }));

    expect(play.navigate).not.toHaveBeenCalled();
    expect(play.back).not.toHaveBeenCalled();
    expect(play.openDialog).not.toHaveBeenCalled();
  });

  it('becomes really disabled (not just aria-disabled) when disabled is on', async () => {
    const play = makePlayValue();
    renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Button label="Off" disabled />
      </Element>,
      play,
    );
    expect(await screen.findByRole('button', { name: 'Off' })).toBeDisabled();
  });
});
