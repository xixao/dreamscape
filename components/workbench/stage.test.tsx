import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
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

// Craft's <Frame> content renders inside the CanvasFrame iframe now, a
// separate document `screen` (bound to the outer document) cannot see into -
// find it here instead. Waits for the iframe and its body to exist (both are
// synchronous once React has committed, per canvas-frame.test.tsx, but this
// stays robust if that ever changes).
async function frameBody(): Promise<HTMLElement> {
  return waitFor(() => {
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error('canvas frame body not ready');
    return body;
  });
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

// Exposes width/height/deviceName/zoom from context for assertions, the same
// pattern stage-context.test.tsx's own Probe uses.
function StageProbe() {
  const { width, height, deviceName, zoom } = useStage();
  return (
    <div>
      <output data-testid="probe-width">{width}</output>
      <output data-testid="probe-height">{height ?? 'auto'}</output>
      <output data-testid="probe-device">{deviceName ?? 'none'}</output>
      <output data-testid="probe-zoom">{zoom}</output>
    </div>
  );
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

  it('renders the artboard at the stage width, in an iframe whose body is theme-basic', async () => {
    renderInEditor(<Stage {...screenProps({ data: emptyLayoutJson() })} />, { width: 768 });
    const artboard = screen.getByTestId('artboard');
    await waitFor(() => expect(artboard).toHaveStyle({ width: '768px' }));

    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    expect(iframe).toHaveStyle({ width: '768px' });
    const body = await frameBody();
    expect(body.className).toBe('theme-basic');
    expect(within(body).getByText('This frame is empty')).toBeInTheDocument();
  });

  it('gives the frame a fixed height once a device sets one, and returns to auto when the width handle clears it', async () => {
    renderInEditor(
      <DeviceSetter>
        <Stage {...screenProps()} />
        <StageProbe />
      </DeviceSetter>,
    );
    await waitFor(() => expect(screen.getByTestId('probe-height')).toHaveTextContent('874'));
    const iframe = screen.getByTestId('canvas-frame') as HTMLIFrameElement;
    await waitFor(() => expect(iframe).toHaveStyle({ width: '402px', height: '874px' }));

    const widthHandle = screen.getByRole('separator', { name: 'Resize width' });
    fireEvent.pointerDown(widthHandle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(widthHandle, { clientX: 50, pointerId: 1 });
    fireEvent.pointerUp(widthHandle, { clientX: 50, pointerId: 1 });

    expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
    expect(screen.getByTestId('probe-height')).toHaveTextContent('auto');
    await waitFor(() => expect(iframe).toHaveStyle({ height: `${ARTBOARD_MIN_HEIGHT}px` }));
  });

  it('deselects when the canvas outside the artboard is pressed', async () => {
    const { editor } = renderInEditor(<Stage {...screenProps()} />);
    await frameBody();
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('stage-column'));
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(false));
  });

  it('keeps the selection when the artboard itself is pressed', async () => {
    const { editor } = renderInEditor(<Stage {...screenProps()} />);
    await frameBody();
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('artboard'));
    expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true);
  });

  describe('resize handles', () => {
    it('renders three handles with the right aria roles, orientation and values', async () => {
      renderInEditor(<Stage {...screenProps()} />, { width: 1000 });
      const width = await screen.findByRole('separator', { name: 'Resize width' });
      const height = screen.getByRole('separator', { name: 'Resize height' });
      const corner = screen.getByRole('separator', { name: 'Resize frame' });

      expect(width).toHaveAttribute('aria-orientation', 'vertical');
      expect(width).toHaveAttribute('aria-valuenow', '1000');
      expect(width).toHaveAttribute('aria-valuemin', '120');
      expect(width).toHaveAttribute('aria-valuemax', '3840');

      expect(height).toHaveAttribute('aria-orientation', 'horizontal');
      expect(height).toHaveAttribute('aria-valuenow', String(ARTBOARD_MIN_HEIGHT));
      expect(height).toHaveAttribute('aria-valuemin', '120');
      expect(height).toHaveAttribute('aria-valuemax', '8192');

      expect(corner).toHaveAttribute('aria-valuenow', '1000');
    });

    it('dragging the width handle changes width, dividing the pointer delta by zoom, and clears the device', async () => {
      renderInEditor(
        <DeviceSetter>
          <Stage {...screenProps()} />
          <StageProbe />
        </DeviceSetter>,
        { width: 1000 },
      );
      await waitFor(() => expect(screen.getByTestId('probe-device')).toHaveTextContent('iPhone 16 & 17 Pro'));

      const handle = screen.getByRole('separator', { name: 'Resize width' });
      fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('602');
      expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
      fireEvent.pointerUp(handle, { clientX: 300, pointerId: 1 });
    });

    it('dragging the corner handle changes both width and height together', async () => {
      renderInEditor(
        <>
          <Stage {...screenProps()} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = await screen.findByRole('separator', { name: 'Resize frame' });

      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientX: 40, clientY: 24, pointerId: 1 });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1040');
      expect(screen.getByTestId('probe-height')).toHaveTextContent(String(ARTBOARD_MIN_HEIGHT + 24));
      fireEvent.pointerUp(handle, { clientX: 40, clientY: 24, pointerId: 1 });
    });

    it('dragging the height handle sets a fixed height without touching width or the device', async () => {
      renderInEditor(
        <DeviceSetter>
          <Stage {...screenProps()} />
          <StageProbe />
        </DeviceSetter>,
        { width: 1000 },
      );
      await waitFor(() => expect(screen.getByTestId('probe-height')).toHaveTextContent('874'));

      const handle = screen.getByRole('separator', { name: 'Resize height' });
      fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 30, pointerId: 1 });
      expect(screen.getByTestId('probe-height')).toHaveTextContent('904');
      expect(screen.getByTestId('probe-width')).toHaveTextContent('402');
      expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
      fireEvent.pointerUp(handle, { clientY: 30, pointerId: 1 });
    });

    it('double-clicking the height handle returns the height to auto', async () => {
      renderInEditor(
        <DeviceSetter>
          <Stage {...screenProps()} />
          <StageProbe />
        </DeviceSetter>,
        { width: 1000 },
      );
      await waitFor(() => expect(screen.getByTestId('probe-height')).toHaveTextContent('874'));

      fireEvent.doubleClick(screen.getByRole('separator', { name: 'Resize height' }));
      expect(screen.getByTestId('probe-height')).toHaveTextContent('auto');
      expect(screen.getByTestId('probe-device')).toHaveTextContent('none');
    });

    it('steps the width by 8 px with the arrow keys', async () => {
      renderInEditor(
        <>
          <Stage {...screenProps()} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = await screen.findByRole('separator', { name: 'Resize width' });
      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1008');
      fireEvent.keyDown(handle, { key: 'ArrowLeft' });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1000');
    });

    it('steps the height by 8 px with the arrow keys, starting from the measured auto height', async () => {
      renderInEditor(
        <>
          <Stage {...screenProps()} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = await screen.findByRole('separator', { name: 'Resize height' });
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(screen.getByTestId('probe-height')).toHaveTextContent(String(ARTBOARD_MIN_HEIGHT + 8));
    });

    it('steps both axes on the corner handle depending on which arrow key is pressed', async () => {
      renderInEditor(
        <>
          <Stage {...screenProps()} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = await screen.findByRole('separator', { name: 'Resize frame' });
      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1008');
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(screen.getByTestId('probe-height')).toHaveTextContent(String(ARTBOARD_MIN_HEIGHT + 8));
    });

    it('ends the drag on pointer cancel, so a later move does not resize', async () => {
      renderInEditor(
        <>
          <Stage {...screenProps()} />
          <StageProbe />
        </>,
        { width: 1000 },
      );
      const handle = await screen.findByRole('separator', { name: 'Resize width' });
      fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
      expect(handle.firstElementChild).toHaveClass('bg-acc');
      fireEvent.pointerCancel(handle, { clientX: 100, pointerId: 1 });
      expect(handle.firstElementChild).toHaveClass('bg-border');
      fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
      expect(screen.getByTestId('probe-width')).toHaveTextContent('1000');
    });

    it('shows a live width x height readout while dragging', async () => {
      renderInEditor(<Stage {...screenProps()} />, { width: 1000 });
      const handle = await screen.findByRole('separator', { name: 'Resize width' });
      expect(screen.queryByTestId('resize-readout')).toBeNull();
      fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
      expect(screen.getByTestId('resize-readout')).toHaveTextContent(`1000 × ${ARTBOARD_MIN_HEIGHT}`);
      fireEvent.pointerMove(handle, { clientX: 40, pointerId: 1 });
      expect(screen.getByTestId('resize-readout')).toHaveTextContent(`1040 × ${ARTBOARD_MIN_HEIGHT}`);
      fireEvent.pointerUp(handle, { clientX: 40, pointerId: 1 });
      expect(screen.queryByTestId('resize-readout')).toBeNull();
    });

    it('keeps the selection when a handle is pressed', async () => {
      const { editor } = renderInEditor(<Stage {...screenProps()} />);
      await frameBody();
      editor().actions.selectNode(ROOT_NODE);
      await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));
      fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize width' }), {
        clientX: 0,
        pointerId: 1,
      });
      expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true);
    });
  });

  it('scales the artboard down when the column is narrower than it', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(768);
    renderInEditor(
      <>
        <Stage {...screenProps()} />
        <StageProbe />
      </>,
      { width: 1440 },
    );
    await waitFor(() => expect(screen.getByTestId('probe-zoom')).toHaveTextContent('0.5'));
    spy.mockRestore();
  });
});
