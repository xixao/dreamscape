import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Dialog } from './dialog';
import { Button } from './button';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Dialog block', () => {
  it('renders the trigger and the inline preview with a content zone', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Dialog triggerLabel="Invite" title="Invite a teammate" description="They get an email." />
      </Element>,
    );
    expect(await screen.findByRole('button', { name: 'Invite' })).toBeInTheDocument();
    expect(screen.getByText('Invite a teammate')).toBeInTheDocument();
    expect(screen.getByText('They get an email.')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-preview')).toBeInTheDocument();
    expect(container.querySelector('[data-zone="DialogContent"]')).not.toBeNull();
  });

  it('hides the preview when previewOpen is off and keeps its children for later', async () => {
    const { container, editor } = renderTree(
      <Element is={LayoutBox} canvas>
        <Dialog />
      </Element>,
    );
    await screen.findByTestId('dialog-preview');
    const dialogId = editor().query.node('ROOT').get().data.nodes[0];
    const zoneId = editor().query.node(dialogId).get().data.linkedNodes.content;

    act(() => {
      const tree = editor().query.parseReactElement(<Button label="Inside" />).toNodeTree();
      editor().actions.addNodeTree(tree, zoneId);
    });
    expect(await screen.findByRole('button', { name: 'Inside' })).toBeInTheDocument();

    act(() => {
      editor().actions.setProp(dialogId, (props: { previewOpen: boolean }) => {
        props.previewOpen = false;
      });
    });
    await waitFor(() => expect(screen.queryByTestId('dialog-preview')).toBeNull());
    expect(container.querySelector('[data-zone="DialogContent"]')).toBeNull();

    act(() => {
      editor().actions.setProp(dialogId, (props: { previewOpen: boolean }) => {
        props.previewOpen = true;
      });
    });
    expect(await screen.findByRole('button', { name: 'Inside' })).toBeInTheDocument();
  });

  it('refuses a Dialog inside its content zone', async () => {
    const { editor } = renderTree(
      <Element is={LayoutBox} canvas>
        <Dialog />
      </Element>,
    );
    await screen.findByTestId('dialog-preview');
    const dialogId = editor().query.node('ROOT').get().data.nodes[0];
    const zoneId = editor().query.node(dialogId).get().data.linkedNodes.content;

    const incomingDialog = editor().query.parseReactElement(<Dialog />).toNodeTree();
    const incomingButton = editor().query.parseReactElement(<Button />).toNodeTree();
    const zone = editor().query.node(zoneId);
    expect(zone.get().rules.canMoveIn([incomingDialog.nodes[incomingDialog.rootNodeId]], zone.get(), editor().query.node)).toBe(false);
    expect(zone.get().rules.canMoveIn([incomingButton.nodes[incomingButton.rootNodeId]], zone.get(), editor().query.node)).toBe(true);
  });
});

describe('Dialog block in play mode', () => {
  it('calls openDialog with its own node id when the trigger is clicked', async () => {
    const play = makePlayValue();
    const { editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Dialog triggerLabel="Invite" title="Invite a teammate" />
      </Element>,
      play,
    );
    const dialogId = editor().query.node(ROOT_NODE).get().data.nodes[0];

    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));

    expect(play.openDialog).toHaveBeenCalledWith(dialogId);
  });

  it('renders the real dialog with its title when isDialogOpen says it is open', async () => {
    const play = makePlayValue({ isDialogOpen: () => true });
    renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Dialog title="Already open" />
      </Element>,
      play,
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Already open')).toBeInTheDocument();
  });

  it('renders no dialog while isDialogOpen says it is closed', async () => {
    const play = makePlayValue();
    renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Dialog title="Should stay closed" />
      </Element>,
      play,
    );
    await screen.findByRole('button', { name: 'Open dialog' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('calls closeDialog with its own node id when the close button is clicked', async () => {
    const play = makePlayValue({ isDialogOpen: () => true });
    const { editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Dialog title="Closable" />
      </Element>,
      play,
    );
    const dialogId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(play.closeDialog).toHaveBeenCalledWith(dialogId);
  });
});
