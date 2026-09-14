import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { Dialog } from '@/components/blocks/dialog';
import { LayoutBox } from '@/components/blocks/layout-box';
import type { Page, Screen } from '@/lib/files/repository';
import { createOverlayScreen } from '@/lib/files/screens';
import { renderInEditor } from '@/test/craft-harness';
import { PrototypePanel } from './prototype-panel';

const SCREENS: Screen[] = [
  { id: 's1', name: 'Login', layout: '{}', stageWidth: 1440 },
  { id: 's2', name: 'Hello world', layout: '{}', stageWidth: 1440 },
];

function mount(children: ReactNode, screens: Screen[] = SCREENS, currentScreenId = 's1', pages: Page[] = []) {
  return renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          {children}
        </Element>
      </Frame>
      <PrototypePanel screens={screens} currentScreenId={currentScreenId} pages={pages} />
    </>,
  );
}

async function selectFirstChild(editor: ReturnType<typeof mount>['editor']): Promise<string> {
  const id = editor().query.node(ROOT_NODE).get().data.nodes[0];
  act(() => editor().actions.selectNode(id));
  await waitFor(() => expect(editor().query.getEvent('selected').contains(id)).toBe(true));
  return id;
}

async function chooseOnClick(label: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: 'On click' }));
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

describe('PrototypePanel', () => {
  it('shows the empty state when nothing is selected', () => {
    mount(<Button label="Sign in" />);
    expect(screen.getByText('Select a layer to add an interaction.')).toBeInTheDocument();
  });

  it('shows "None" for a selected layer with no interaction, and no target select or Remove button', async () => {
    const { editor } = mount(<Button label="Sign in" />);
    await selectFirstChild(editor);

    expect(screen.getByRole('combobox', { name: 'On click' })).toHaveTextContent('None');
    expect(screen.queryByRole('combobox', { name: 'Screen' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Dialog' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('does not offer Navigate to when there is no other screen', async () => {
    const { editor } = mount(<Button label="Sign in" />, [SCREENS[0]], 's1');
    await selectFirstChild(editor);

    await userEvent.click(screen.getByRole('combobox', { name: 'On click' }));
    expect(screen.queryByRole('option', { name: 'Navigate to...' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Back' })).toBeInTheDocument();
  });

  it('does not offer Open dialog when there is no Dialog on the canvas', async () => {
    const { editor } = mount(<Button label="Sign in" />);
    await selectFirstChild(editor);

    await userEvent.click(screen.getByRole('combobox', { name: 'On click' }));
    expect(screen.queryByRole('option', { name: 'Open dialog...' })).toBeNull();
  });

  it('wires Navigate to the first other screen and lets it be changed via the Screen select', async () => {
    const { editor } = mount(<Button label="Sign in" />);
    const id = await selectFirstChild(editor);

    await chooseOnClick('Navigate to...');

    await waitFor(() =>
      expect(editor().query.node(id).get().data.custom?.interactions).toEqual([
        expect.objectContaining({ action: 'navigate', targetScreenId: 's2' }),
      ]),
    );
    expect(screen.getByRole('combobox', { name: 'Screen' })).toHaveTextContent('Hello world');
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('wires Back with no target select', async () => {
    const { editor } = mount(<Button label="Sign in" />);
    const id = await selectFirstChild(editor);

    await chooseOnClick('Back');

    await waitFor(() =>
      expect(editor().query.node(id).get().data.custom?.interactions).toEqual([
        expect.objectContaining({ action: 'back' }),
      ]),
    );
    expect(screen.queryByRole('combobox', { name: 'Screen' })).toBeNull();
  });

  it('wires Open dialog to the Dialog layer on the same screen', async () => {
    // Craft's Element resolves each of *its own* JSX children into a node;
    // passed as one child element here it would instead try to resolve the
    // wrapping Fragment itself as a node type. An array of two real elements
    // (same as writing them as JSX siblings, which is not possible through
    // this helper's single `children` parameter) avoids that.
    const { editor } = mount([<Button key="button" label="Sign in" />, <Dialog key="dialog" title="Welcome" />]);
    const id = await selectFirstChild(editor);

    await chooseOnClick('Open dialog...');

    await waitFor(() =>
      expect(editor().query.node(id).get().data.custom?.interactions[0].action).toBe('openDialog'),
    );
    const dialogSelect = screen.getByRole('combobox', { name: 'Dialog' });
    expect(within(dialogSelect).getByText('Welcome')).toBeInTheDocument();
  });

  it('removes the interaction when None is chosen', async () => {
    const { editor } = mount(<Button label="Sign in" />);
    const id = await selectFirstChild(editor);
    await chooseOnClick('Back');
    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeDefined());

    await chooseOnClick('None');

    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeUndefined());
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('removes the interaction when the Remove button is clicked', async () => {
    const { editor } = mount(<Button label="Sign in" />);
    const id = await selectFirstChild(editor);
    await chooseOnClick('Back');
    await screen.findByRole('button', { name: 'Remove' });

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(editor().query.node(id).get().data.custom?.interactions).toBeUndefined());
    expect(screen.getByRole('combobox', { name: 'On click' })).toHaveTextContent('None');
  });

  describe('overlay frames', () => {
    const PAGES: Page[] = [
      { id: 'p1', name: 'Page 1' },
      { id: 'p2', name: 'v2' },
    ];
    const PAGED_SCREENS: Screen[] = SCREENS.map((s) => ({ ...s, pageId: 'p1' }));
    const OVERLAY_1 = createOverlayScreen({ type: 'dialog', id: 'o1', name: 'Confirm', pageId: 'p1', x: 0, y: 0 });
    const OVERLAY_2 = createOverlayScreen({ type: 'sheet', id: 'o2', name: 'Filters', pageId: 'p2', x: 0, y: 0 });
    const SCREENS_WITH_OVERLAYS: Screen[] = [...PAGED_SCREENS, OVERLAY_1, OVERLAY_2];

    it('does not offer Open overlay when the file has no overlay frame, but always offers Close overlay', async () => {
      const { editor } = mount(<Button label="Sign in" />);
      await selectFirstChild(editor);

      await userEvent.click(screen.getByRole('combobox', { name: 'On click' }));
      expect(screen.queryByRole('option', { name: 'Open overlay...' })).toBeNull();
      expect(screen.getByRole('option', { name: 'Close overlay' })).toBeInTheDocument();
    });

    it('offers Open overlay when the file has an overlay frame on ANY page', async () => {
      const { editor } = mount(<Button label="Sign in" />, SCREENS_WITH_OVERLAYS, 's1', PAGES);
      await selectFirstChild(editor);

      await userEvent.click(screen.getByRole('combobox', { name: 'On click' }));
      expect(screen.getByRole('option', { name: 'Open overlay...' })).toBeInTheDocument();
    });

    it('wires Open overlay to the first overlay, grouped by page, showing the presentation badge', async () => {
      const { editor } = mount(<Button label="Sign in" />, SCREENS_WITH_OVERLAYS, 's1', PAGES);
      const id = await selectFirstChild(editor);

      await chooseOnClick('Open overlay...');

      await waitFor(() =>
        expect(editor().query.node(id).get().data.custom?.interactions).toEqual([
          expect.objectContaining({ action: 'openOverlay', targetScreenId: 'o1' }),
        ]),
      );
      const overlaySelect = screen.getByRole('combobox', { name: 'Overlay' });
      expect(overlaySelect).toHaveTextContent('Confirm');
      expect(overlaySelect).toHaveTextContent('Dialog');

      await userEvent.click(overlaySelect);
      expect(screen.getByRole('group', { name: 'Page 1' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'v2' })).toBeInTheDocument();
      const secondOverlayOption = screen.getByRole('option', { name: /Filters/ });
      expect(secondOverlayOption).toHaveTextContent('Sheet · Right');

      await userEvent.click(secondOverlayOption);
      await waitFor(() =>
        expect(editor().query.node(id).get().data.custom?.interactions).toEqual([
          expect.objectContaining({ action: 'openOverlay', targetScreenId: 'o2' }),
        ]),
      );
    });

    it('wires Close overlay with no target select, even with overlay frames present', async () => {
      const { editor } = mount(<Button label="Sign in" />, SCREENS_WITH_OVERLAYS, 's1', PAGES);
      const id = await selectFirstChild(editor);

      await chooseOnClick('Close overlay');

      await waitFor(() =>
        expect(editor().query.node(id).get().data.custom?.interactions).toEqual([
          expect.objectContaining({ action: 'closeOverlay' }),
        ]),
      );
      expect(screen.queryByRole('combobox', { name: 'Overlay' })).toBeNull();
      expect(screen.queryByRole('combobox', { name: 'Screen' })).toBeNull();
    });
  });
});
