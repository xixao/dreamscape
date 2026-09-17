import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DevicePreset } from '@/lib/stage/device-presets';
import { StageProvider, useStage } from './stage-context';

const IPHONE: DevicePreset = { name: 'iPhone 16 & 17 Pro', width: 402, height: 874 };

function Probe() {
  const stage = useStage();
  return (
    <div>
      <output data-testid="width">{stage.width}</output>
      <output data-testid="height">{stage.height ?? 'none'}</output>
      <output data-testid="deviceName">{stage.deviceName ?? 'none'}</output>
      <output data-testid="breakpoint">{stage.breakpoint}</output>
      <output data-testid="preset">{stage.preset ?? 'none'}</output>
      <output data-testid="zoom">{stage.zoom}</output>
      <button onClick={() => stage.syncSize({ width: 900, height: 1120, deviceName: null })}>activate screen</button>
      <button onClick={() => stage.setWidth(700)}>seven hundred</button>
      <button onClick={() => stage.setWidth(50)}>too small</button>
      <button onClick={() => stage.setPreset('mobile')}>mobile</button>
      <button onClick={() => stage.setZoom(0.5)}>half</button>
      <button onClick={() => stage.setDevice(IPHONE)}>set device</button>
      <button onClick={() => stage.setSize({ width: 1024, height: 768 })}>set size</button>
      <button onClick={() => stage.setSize({ width: 900, height: null })}>set size auto</button>
    </div>
  );
}

describe('StageProvider', () => {
  it('starts at the desktop preset and derives breakpoint and preset', () => {
    render(
      <StageProvider>
        <Probe />
      </StageProvider>,
    );
    expect(screen.getByTestId('width')).toHaveTextContent('1440');
    expect(screen.getByTestId('height')).toHaveTextContent('none');
    expect(screen.getByTestId('deviceName')).toHaveTextContent('none');
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('desktop');
    expect(screen.getByTestId('preset')).toHaveTextContent('desktop');
    expect(screen.getByTestId('zoom')).toHaveTextContent('1');
  });

  it('updates width, clamps it, and reports the change', async () => {
    const onWidthChange = vi.fn();
    render(
      <StageProvider initialWidth={375} onWidthChange={onWidthChange}>
        <Probe />
      </StageProvider>,
    );
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('mobile');
    expect(screen.getByTestId('preset')).toHaveTextContent('mobile');

    await userEvent.click(screen.getByText('seven hundred'));
    expect(screen.getByTestId('width')).toHaveTextContent('700');
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('mobile');
    expect(screen.getByTestId('preset')).toHaveTextContent('none');
    expect(onWidthChange).toHaveBeenLastCalledWith(700);

    await userEvent.click(screen.getByText('too small'));
    expect(screen.getByTestId('width')).toHaveTextContent('120');
    expect(onWidthChange).toHaveBeenLastCalledWith(120);

    await userEvent.click(screen.getByRole('button', { name: 'mobile' }));
    expect(screen.getByTestId('width')).toHaveTextContent('375');

    await userEvent.click(screen.getByText('half'));
    expect(screen.getByTestId('zoom')).toHaveTextContent('0.5');
  });

  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useStage must be used inside StageProvider');
    spy.mockRestore();
  });

  describe('setDevice', () => {
    it('sets width, height and deviceName, and selects the matching Mobile/Tablet/Desktop segment', async () => {
      const onDeviceChange = vi.fn();
      const onWidthChange = vi.fn();
      render(
        <StageProvider onWidthChange={onWidthChange} onDeviceChange={onDeviceChange}>
          <Probe />
        </StageProvider>,
      );

      await userEvent.click(screen.getByText('set device'));

      expect(screen.getByTestId('width')).toHaveTextContent('402');
      expect(screen.getByTestId('height')).toHaveTextContent('874');
      expect(screen.getByTestId('deviceName')).toHaveTextContent('iPhone 16 & 17 Pro');
      expect(screen.getByTestId('preset')).toHaveTextContent('mobile');
      expect(onDeviceChange).toHaveBeenLastCalledWith({ width: 402, height: 874, deviceName: 'iPhone 16 & 17 Pro' });
      expect(onWidthChange).not.toHaveBeenCalled();
    });

    it('a later setWidth (grip drag or a preset click) clears height and deviceName', async () => {
      const onWidthChange = vi.fn();
      render(
        <StageProvider onWidthChange={onWidthChange}>
          <Probe />
        </StageProvider>,
      );

      await userEvent.click(screen.getByText('set device'));
      expect(screen.getByTestId('deviceName')).toHaveTextContent('iPhone 16 & 17 Pro');

      await userEvent.click(screen.getByText('seven hundred'));
      expect(screen.getByTestId('width')).toHaveTextContent('700');
      expect(screen.getByTestId('height')).toHaveTextContent('none');
      expect(screen.getByTestId('deviceName')).toHaveTextContent('none');
      expect(onWidthChange).toHaveBeenLastCalledWith(700);
    });

    it('clicking a Mobile/Tablet/Desktop segment after a device also clears height and deviceName', async () => {
      render(
        <StageProvider>
          <Probe />
        </StageProvider>,
      );

      await userEvent.click(screen.getByText('set device'));
      await userEvent.click(screen.getByRole('button', { name: 'mobile' }));

      expect(screen.getByTestId('width')).toHaveTextContent('375');
      expect(screen.getByTestId('height')).toHaveTextContent('none');
      expect(screen.getByTestId('deviceName')).toHaveTextContent('none');
    });

    it('accepts an initial height and device name from props', () => {
      render(
        <StageProvider initialWidth={402} initialHeight={874} initialDeviceName="iPhone 16 & 17 Pro">
          <Probe />
        </StageProvider>,
      );

      expect(screen.getByTestId('height')).toHaveTextContent('874');
      expect(screen.getByTestId('deviceName')).toHaveTextContent('iPhone 16 & 17 Pro');
      expect(screen.getByTestId('preset')).toHaveTextContent('mobile');
    });
  });

  describe('setSize', () => {
    it('sets width and a fixed height, clamps both, and clears the device', async () => {
      const onSizeChange = vi.fn();
      render(
        <StageProvider onSizeChange={onSizeChange}>
          <Probe />
        </StageProvider>,
      );

      await userEvent.click(screen.getByText('set device'));
      expect(screen.getByTestId('deviceName')).toHaveTextContent('iPhone 16 & 17 Pro');

      await userEvent.click(screen.getByText('set size'));
      expect(screen.getByTestId('width')).toHaveTextContent('1024');
      expect(screen.getByTestId('height')).toHaveTextContent('768');
      expect(screen.getByTestId('deviceName')).toHaveTextContent('none');
      expect(onSizeChange).toHaveBeenLastCalledWith({ width: 1024, height: 768 });
    });

    it('accepts a null height (auto)', async () => {
      render(
        <StageProvider initialWidth={1024} initialHeight={768}>
          <Probe />
        </StageProvider>,
      );

      await userEvent.click(screen.getByText('set size auto'));
      expect(screen.getByTestId('width')).toHaveTextContent('900');
      expect(screen.getByTestId('height')).toHaveTextContent('none');
    });
  });

  describe('canvasDocument', () => {
    it('starts null and is settable through setCanvasDocument', () => {
      function CanvasProbe() {
        const stage = useStage();
        return (
          <div>
            <output data-testid="canvas-doc">{stage.canvasDocument ? 'set' : 'none'}</output>
            <button onClick={() => stage.setCanvasDocument({ document, window })}>set doc</button>
            <button onClick={() => stage.setCanvasDocument(null)}>clear doc</button>
          </div>
        );
      }
      render(
        <StageProvider>
          <CanvasProbe />
        </StageProvider>,
      );
      expect(screen.getByTestId('canvas-doc')).toHaveTextContent('none');
    });
  });
});


it('activates saved screen dimensions without firing resize persistence callbacks', async () => {
  const onWidthChange = vi.fn(), onSizeChange = vi.fn(), onDeviceChange = vi.fn();
  render(<StageProvider onWidthChange={onWidthChange} onSizeChange={onSizeChange} onDeviceChange={onDeviceChange}><Probe /></StageProvider>);
  await userEvent.click(screen.getByText('activate screen'));
  expect(screen.getByTestId('width')).toHaveTextContent('900');
  expect(screen.getByTestId('height')).toHaveTextContent('1120');
  expect(onWidthChange).not.toHaveBeenCalled();
  expect(onSizeChange).not.toHaveBeenCalled();
  expect(onDeviceChange).not.toHaveBeenCalled();
});
