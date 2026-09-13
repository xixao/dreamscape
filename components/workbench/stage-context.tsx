'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type Breakpoint, breakpointForWidth } from '@/lib/responsive';
import { STAGE_PRESETS, type StagePreset, clampWidth, presetForWidth } from '@/lib/stage';
import { breakpointForDevice, type DevicePreset } from '@/lib/stage/device-presets';

export interface StageContextValue {
  width: number;
  // Set only by setDevice: a Figma-style frame with a fixed device height
  // (content scrolls inside it instead of the artboard growing to fit).
  // Null means automatic - the artboard falls back to its own min-height.
  height: number | null;
  // The chosen device's exact Figma label, or null when the frame is a
  // plain width (grip drag or a Mobile/Tablet/Desktop segment).
  deviceName: string | null;
  breakpoint: Breakpoint;
  preset: StagePreset | null;
  zoom: number;
  setWidth: (width: number) => void;
  setDevice: (device: DevicePreset) => void;
  setPreset: (preset: StagePreset) => void;
  setZoom: (zoom: number) => void;
}

const StageContext = createContext<StageContextValue | null>(null);

export function StageProvider({
  initialWidth = STAGE_PRESETS.desktop,
  initialHeight = null,
  initialDeviceName = null,
  onWidthChange,
  onDeviceChange,
  children,
}: {
  initialWidth?: number;
  initialHeight?: number | null;
  initialDeviceName?: string | null;
  onWidthChange?: (width: number) => void;
  onDeviceChange?: (device: { width: number; height: number; deviceName: string }) => void;
  children: ReactNode;
}) {
  const [width, setWidthState] = useState(() => clampWidth(initialWidth));
  const [height, setHeightState] = useState<number | null>(initialHeight);
  const [deviceName, setDeviceNameState] = useState<string | null>(initialDeviceName);
  const [zoom, setZoom] = useState(1);

  // Used by the grip, the Mobile/Tablet/Desktop segments and the arrow-key
  // resize - every one of them a plain width, which always clears whatever
  // device the frame was previously set to (Figma's own frame dropdown
  // behavior: typing a custom size drops the preset).
  const setWidth = useCallback(
    (next: number) => {
      const clamped = clampWidth(next);
      setWidthState(clamped);
      setHeightState(null);
      setDeviceNameState(null);
      onWidthChange?.(clamped);
    },
    [onWidthChange],
  );

  const setPreset = useCallback(
    (preset: StagePreset) => setWidth(STAGE_PRESETS[preset]),
    [setWidth],
  );

  const setDevice = useCallback(
    (device: DevicePreset) => {
      const clampedWidth = clampWidth(device.width);
      const clampedHeight = Math.max(1, Math.round(device.height));
      setWidthState(clampedWidth);
      setHeightState(clampedHeight);
      setDeviceNameState(device.name);
      onDeviceChange?.({ width: clampedWidth, height: clampedHeight, deviceName: device.name });
    },
    [onDeviceChange],
  );

  const value = useMemo<StageContextValue>(
    () => ({
      width,
      height,
      deviceName,
      breakpoint: breakpointForWidth(width),
      // A device's own group (Phone/Tablet/Desktop/...), not its exact pixel
      // width, decides which segment lights up - see breakpointForDevice.
      // Without a device, an exact preset width still lights up its segment
      // (presetForWidth), same as before this feature existed.
      preset: deviceName ? breakpointForDevice(deviceName) : presetForWidth(width),
      zoom,
      setWidth,
      setDevice,
      setPreset,
      setZoom,
    }),
    [width, height, deviceName, zoom, setWidth, setDevice, setPreset],
  );

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage(): StageContextValue {
  const context = useContext(StageContext);
  if (!context) throw new Error('useStage must be used inside StageProvider');
  return context;
}
