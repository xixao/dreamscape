import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Dialog } from './dialog';
import { Button } from './button';
import { renderTree } from '@/test/craft-harness';

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
