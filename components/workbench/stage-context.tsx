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
import { clampHeight } from '@/lib/stage/size';
import { breakpointForDevice, type DevicePreset } from '@/lib/stage/device-presets';

// The iframe document/window the artboard currently renders into, once
// canvas-frame.tsx's CanvasFrame has prepared it - null before it is ready,
// in Play mode, and in any test that renders a block tree without a Stage.
// Lives here (rather than as a context canvas-frame.tsx provides on its
// own) because the real consumers - NodeIndicator (a descendant of
// CanvasFrame's own children, fine either way) but also useLayerStack and
// useWorkbenchKeyboard (siblings of Stage in workbench.tsx's tree, NOT
// descendants of CanvasFrame) - need a provider scoped above Stage itself.
// StageProvider already wraps every one of them, so it is the natural home;
// canvas-frame.tsx's own useCanvasDocument() just reads it from here.
export type CanvasDocument = { document: Document; window: Window };

export interface StageContextValue {
  width: number;
  // Set only by setDevice: a Figma-style frame with a fixed device height
  // (content scrolls inside it instead of the artboard growing to fit).
  // Null means automatic - the artboard falls back to its own min-height.
  height: number | null;
  // The chosen device's exact Figma label, or null when the frame is a
  // plain width (grip drag, a Mobile/Tablet/Desktop segment, or a manual
  // height/corner handle drag).
  deviceName: string | null;
  breakpoint: Breakpoint;
  preset: StagePreset | null;
  zoom: number;
  canvasDocument: CanvasDocument | null;
  syncSize: (size: { width: number; height: number | null; deviceName: string | null }) => void;
  setWidth: (width: number) => void;
  // A manual, deviceless size: the height handle (width unchanged) and the
  // corner handle (both). Always clears deviceName, same as setWidth.
  setSize: (size: { width: number; height: number | null }) => void;
  setDevice: (device: DevicePreset) => void;
  setPreset: (preset: StagePreset) => void;
  setZoom: (zoom: number) => void;
  setCanvasDocument: (canvasDocument: CanvasDocument | null) => void;
}

const StageContext = createContext<StageContextValue | null>(null);

export function StageProvider({
  initialWidth = STAGE_PRESETS.desktop,
  initialHeight = null,
  initialDeviceName = null,
  onWidthChange,
  onSizeChange,
  onDeviceChange,
  children,
}: {
  initialWidth?: number;
  initialHeight?: number | null;
  initialDeviceName?: string | null;
  onWidthChange?: (width: number) => void;
  onSizeChange?: (size: { width: number; height: number | null }) => void;
  onDeviceChange?: (device: { width: number; height: number; deviceName: string }) => void;
  children: ReactNode;
}) {
  const [width, setWidthState] = useState(() => clampWidth(initialWidth));
  const [height, setHeightState] = useState<number | null>(initialHeight);
  const [deviceName, setDeviceNameState] = useState<string | null>(initialDeviceName);
  const [zoom, setZoom] = useState(1);
  const [canvasDocument, setCanvasDocument] = useState<CanvasDocument | null>(null);

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

  // The height handle (width unchanged) and the corner handle (both) - a
  // manual, deviceless size, same "clears the device" rule as setWidth.
  const setSize = useCallback(
    (next: { width: number; height: number | null }) => {
      const clampedWidth = clampWidth(next.width);
      const clampedHeight = next.height == null ? null : clampHeight(next.height);
      setWidthState(clampedWidth);
      setHeightState(clampedHeight);
      setDeviceNameState(null);
      onSizeChange?.({ width: clampedWidth, height: clampedHeight });
    },
    [onSizeChange],
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

  // Loading a different screen is not a resize and must never write history or save.
  const syncSize = useCallback((size: { width: number; height: number | null; deviceName: string | null }) => {
    setWidthState(size.width);
    setHeightState(size.height);
    setDeviceNameState(size.deviceName);
  }, []);

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
      canvasDocument,
      syncSize,
      setWidth,
      setSize,
      setDevice,
      setPreset,
      setZoom,
      setCanvasDocument,
    }),
    [width, height, deviceName, zoom, canvasDocument, setWidth, setSize, setDevice, setPreset, syncSize],
  );

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage(): StageContextValue {
  const context = useContext(StageContext);
  if (!context) throw new Error('useStage must be used inside StageProvider');
  return context;
}
