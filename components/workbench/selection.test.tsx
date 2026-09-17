import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Card } from '@/components/blocks/card';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { useSelectedNode, useZoneRedirect } from './selection';

function Probe() {
  useZoneRedirect();
  const selected = useSelectedNode();
  return (
    <output data-testid="selected">
      {[
        selected.id ?? 'none',
        selected.type ?? 'none',
        selected.isRoot ? 'root' : 'child',
        selected.isZone ? 'zone' : 'block',
      ].join('|')}
    </output>
  );
}

describe('useSelectedNode and useZoneRedirect', () => {
  it('keeps the other selected components when redirecting a card content zone', async () => {
    const { editor } = renderInEditor(<><Frame><Element is={LayoutBox} canvas><Card /><Card /></Element></Frame><Probe /></>);
    await screen.findAllByText('Card title');
    const [first, second] = editor().query.node(ROOT_NODE).get().data.nodes;
    const zone = editor().query.node(second).get().data.linkedNodes.content;
    editor().actions.selectNode([first, zone]);
    await waitFor(() => expect(editor().query.getEvent('selected').all()).toEqual([first, second]));
  });

  it('reports nothing selected, then the root, then a child', async () => {
    const { editor } = renderInEditor(
      <>
        <Frame>
          <Element is={LayoutBox} canvas>
            <Card />
          </Element>
        </Frame>
        <Probe />
      </>,
    );
    await screen.findByText('Card title');
    expect(screen.getByTestId('selected')).toHaveTextContent('none|none|child|block');

    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(`${ROOT_NODE}|LayoutBox|root|block`),
    );

    const cardId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(cardId);
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(`${cardId}|Card|child|block`),
    );
  });

  it('redirects a selected content zone to its parent block', async () => {
    const { editor } = renderInEditor(
      <>
        <Frame>
          <Element is={LayoutBox} canvas>
            <Card />
          </Element>
        </Frame>
        <Probe />
      </>,
    );
    await screen.findByText('Card title');
    const cardId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    const zoneId = editor().query.node(cardId).get().data.linkedNodes.content;

    editor().actions.selectNode(zoneId);
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(`${cardId}|Card|child|block`),
    );
  });
});
