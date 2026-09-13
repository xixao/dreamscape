import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import type { Screen } from '@/lib/files/repository';
import { renderInEditor } from '@/test/craft-harness';
import { Stage } from './stage';
import { useStage } from './stage-context';

const ONE_SCREEN: Screen[] = [{ id: 's1', name: 'Frame 1', layout: emptyLayoutJson(), stageWidth: 1440 }];

// The screens-strip's own chip/rename/menu behavior is covered in
// screens-strip.test.tsx in isolation; these props just confirm Stage wires
// it in above the artboard with what it's given.
function screenProps(overrides: Partial<ComponentProps<typeof Stage>> = {}): ComponentProps<typeof Stage> {
  return {
    data: emptyLayoutJson(),
    screens: ONE_SCREEN,
    currentScreenId: 's1',
    onSelectScreen: vi.fn(),
    onAddScreen: vi.fn(),
    onRenameScreen: vi.fn(),
    onDuplicateScreen: vi.fn(),
    onDeleteScreen: vi.fn(),
    ...overrides,
  };
}

// Sets a device (and its fixed height) on mount, through the real context -
// there is no prop on Stage itself for this, it always reads useStage().
function DeviceSetter({ children }: { children: ReactNode }) {
  const { setDevice } = useStage();
  useEffect(() => {
    setDevice({ name: 'iPhone 16 & 17 Pro', width: 402, height: 874 });
  }, [setDevice]);
  return <>{children}</>;
}

describe('Stage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the screens strip above the artboard', async () => {
    const screens: Screen[] = [
      { id: 's1', name: 'Login', layout: emptyLayoutJson(), stageWidth: 1440 },
      { id: 's2', name: 'Hello world', layout: emptyLayoutJson(), stageWidth: 1440 },
    ];
    const onSelectScreen = vi.fn();
    renderInEditor(<Stage {...screenProps({ screens, currentScreenId: 's1', onSelectScreen })} />);

    const tablist = await screen.findByRole('tablist', { name: 'Screens' });
    expect(within(tablist).getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tablist).getByRole('tab', { name: 'Hello world' })).toHaveAttribute('aria-selected', 'false');

    await userEvent.click(within(tablist).getByRole('tab', { name: 'Hello world' }));
    expect(onSelectScreen).toHaveBeenCalledWith('s2');
  });

  it('calls onAddScreen from the strip\'s New screen button', async () => {
    const onAddScreen = vi.fn();
    renderInEditor(<Stage {...screenProps({ onAddScreen })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'New screen' }));
    expect(onAddScreen).toHaveBeenCalledTimes(1);
  });

  it('renders the artboard at the stage width in the basic theme', async () => {
    renderInEditor(<Stage {...screenProps({ data: emptyLayoutJson() })} />, { width: 768 });
    const artboard = await screen.findByTestId('artboard');
    expect(artboard).toHaveClass('theme-basic');
    expect(artboard).toHaveStyle({ width: '768px', minHeight: '640px' });
    expect(artboard.className).not.toMatch(/overflow-auto/);
    expect(await screen.findByText('This frame is empty')).toBeInTheDocument();
  });

  it('gives the artboard a fixed height and overflow-auto once a device sets one, and drops min-height', async () => {
    renderInEditor(
      <DeviceSetter>
        <Stage {...screenProps()} />
      </DeviceSetter>,
    );
    const artboard = await screen.findByTestId('artboard');
    await waitFor(() => expect(artboard).toHaveStyle({ width: '402px', height: '874px' }));
    expect(artboard.className).toMatch(/overflow-auto/);
    expect(artboard.style.minHeight).toBe('');
  });

  it('the grip clears a device the stage had set, reverting to a plain width with min-height', async () => {
    function DeviceNameProbe() {
      return <output data-testid="ctx-device">{useStage().deviceName ?? 'none'}</output>;
    }
    renderInEditor(
      <DeviceSetter>
        <Stage {...screenProps()} />
        <DeviceNameProbe />
      </DeviceSetter>,
    );
    await waitFor(() => expect(screen.getByTestId('ctx-device')).toHaveTextContent('iPhone 16 & 17 Pro'));
    const artboard = await screen.findByTestId('artboard');
    await waitFor(() => expect(artboard).toHaveStyle({ height: '874px' }));

    const grip = screen.getByRole('separator', { name: 'Resize the frame' });
    fireEvent.pointerDown(grip, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientX: 50, pointerId: 1 });

    expect(screen.getByTestId('ctx-device')).toHaveTextContent('none');
    expect(artboard.style.height).toBe('');
    expect(artboard).toHaveStyle({ minHeight: '640px' });
  });

  it('deselects when the canvas outside the artboard is pressed', async () => {
    const { editor } = renderInEditor(<Stage {...screenProps()} />);
    await screen.findByText('This frame is empty');
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('stage-column'));
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(false));
  });

  it('keeps the selection when the artboard itself is pressed', async () => {
    const { editor } = renderInEditor(<Stage {...screenProps()} />);
    await screen.findByText('This frame is empty');
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('artboard'));
    expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true);
  });

  it('resizes with the grip, dividing the pointer delta by the zoom', async () => {
    renderInEditor(<Stage {...screenProps()} />, { width: 1000 });
    const grip = await screen.findByRole('separator', { name: 'Resize the frame' });
    expect(grip).toHaveAttribute('aria-valuenow', '1000');

    fireEvent.pointerDown(grip, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 300, pointerId: 1 });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1200px' });
    fireEvent.pointerUp(grip, { clientX: 300, pointerId: 1 });

    fireEvent.pointerDown(grip, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: -5000, pointerId: 1 });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '120px' });
    fireEvent.pointerUp(grip, { clientX: -5000, pointerId: 1 });
  });

  it('resizes with the arrow keys, ten times faster with Shift', async () => {
    renderInEditor(<Stage {...screenProps()} />, { width: 1000 });
    const grip = await screen.findByRole('separator', { name: 'Resize the frame' });
    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1010px' });
    fireEvent.keyDown(grip, { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1110px' });
    fireEvent.keyDown(grip, { key: 'ArrowLeft' });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1100px' });
  });

  it('ends the drag on pointer cancel, so a later move does not resize', async () => {
    renderInEditor(<Stage {...screenProps()} />, { width: 1000 });
    const grip = await screen.findByRole('separator', { name: 'Resize the frame' });
    fireEvent.pointerDown(grip, { clientX: 100, pointerId: 1 });
    expect(grip.firstElementChild).toHaveClass('bg-acc');
    fireEvent.pointerCancel(grip, { clientX: 100, pointerId: 1 });
    expect(grip.firstElementChild).toHaveClass('bg-border');
    fireEvent.pointerMove(grip, { clientX: 400, pointerId: 1 });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1000px' });
  });

  it('keeps the selection when the grip is pressed', async () => {
    const { editor } = renderInEditor(<Stage {...screenProps()} />);
    await screen.findByText('This frame is empty');
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));
    fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize the frame' }), {
      clientX: 0,
      pointerId: 1,
    });
    expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true);
  });

  it('scales the artboard down when the column is narrower than it', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(768);
    function ZoomProbe() {
      return <output data-testid="zoom">{useStage().zoom}</output>;
    }
    renderInEditor(
      <>
        <Stage {...screenProps()} />
        <ZoomProbe />
      </>,
      { width: 1440 },
    );
    await waitFor(() => expect(screen.getByTestId('zoom')).toHaveTextContent('0.5'));
    spy.mockRestore();
  });
});
