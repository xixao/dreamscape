import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Card } from './card';
import { renderTree } from '@/test/craft-harness';

describe('Card block', () => {
  it('renders title, description and an empty content zone', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Card title="Billing" description="Update your plan." />
      </Element>,
    );
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Update your plan.')).toBeInTheDocument();
    expect(screen.getByText('Drop here')).toBeInTheDocument();
    expect(container.querySelector('[data-block="Card"] [data-zone="CardContent"]')).not.toBeNull();
  });

  it('drops the header when title and description are both empty', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Card title="" description="" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Card"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="card-header"]')).toBeNull();
  });

  it('cannot drag its content zone', async () => {
    const { container, editor } = renderTree(
      <Element is={LayoutBox} canvas>
        <Card />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-zone="CardContent"]')).not.toBeNull());
    const cardId = editor().query.node('ROOT').get().data.nodes[0];
    const zoneId = editor().query.node(cardId).get().data.linkedNodes.content;
    expect(editor().query.node(zoneId).isDraggable()).toBe(false);
    expect(editor().query.node(cardId).isDraggable()).toBe(true);
  });
});
