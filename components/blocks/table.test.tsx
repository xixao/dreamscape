import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, ROOT_NODE } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Table } from './table';
import { makePlayValue, renderPlayTree, renderTree } from '@/test/craft-harness';

describe('Table block', () => {
  it('renders the default columns as headers and 3 placeholder rows', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Table />
      </Element>,
    );
    expect(await screen.findByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    const block = container.querySelector('[data-block="Table"]');
    expect(block?.tagName).toBe('TABLE');
    const cells = screen.getAllByText('Cell');
    expect(cells).toHaveLength(9); // 3 columns x 3 rows
    for (const cell of cells) expect(cell).toHaveClass('text-muted-foreground');
  });

  it('renders a custom column list and row count', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Table columns="Title, Author" rows={5} />
      </Element>,
    );
    expect(await screen.findByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getAllByText('Cell')).toHaveLength(10); // 2 columns x 5 rows
  });

  it('renders one row of cells for rows=1', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Table columns="Only" rows={1} />
      </Element>,
    );
    expect(await screen.findByText('Only')).toBeInTheDocument();
    expect(screen.getAllByText('Cell')).toHaveLength(1);
  });

  it('applies grow', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Table grow />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Table"]')).not.toBeNull());
    expect(container.querySelector('[data-block="Table"]')).toHaveClass('flex-1');
  });
});

describe('Table block in play mode', () => {
  it('runs its own click interaction', async () => {
    const play = makePlayValue();
    const { container, editor } = renderPlayTree(
      <Element is={LayoutBox} canvas>
        <Table />
      </Element>,
      play,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Table"]')).not.toBeNull());
    const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
    act(() => {
      editor().actions.setCustom(id, (custom: Record<string, unknown>) => {
        custom.interactions = [{ id: 'i1', trigger: 'click', action: 'back' }];
      });
    });
    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());

    await userEvent.click(container.querySelector('[data-block="Table"]')!);

    expect(play.back).toHaveBeenCalledTimes(1);
  });
});
