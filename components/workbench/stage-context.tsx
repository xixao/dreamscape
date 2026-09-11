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

export interface StageContextValue {
  width: number;
  breakpoint: Breakpoint;
  preset: StagePreset | null;
  zoom: number;
  setWidth: (width: number) => void;
  setPreset: (preset: StagePreset) => void;
  setZoom: (zoom: number) => void;
}

const StageContext = createContext<StageContextValue | null>(null);

export function StageProvider({
  initialWidth = STAGE_PRESETS.desktop,
  onWidthChange,
  children,
}: {
  initialWidth?: number;
  onWidthChange?: (width: number) => void;
  children: ReactNode;
}) {
  const [width, setWidthState] = useState(() => clampWidth(initialWidth));
  const [zoom, setZoom] = useState(1);

  const setWidth = useCallback(
    (next: number) => {
      const clamped = clampWidth(next);
      setWidthState(clamped);
      onWidthChange?.(clamped);
    },
    [onWidthChange],
  );

  const setPreset = useCallback(
    (preset: StagePreset) => setWidth(STAGE_PRESETS[preset]),
    [setWidth],
  );

  const value = useMemo<StageContextValue>(
    () => ({
      width,
      breakpoint: breakpointForWidth(width),
      preset: presetForWidth(width),
      zoom,
      setWidth,
      setPreset,
      setZoom,
    }),
    [width, zoom, setWidth, setPreset],
  );

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage(): StageContextValue {
  const context = useContext(StageContext);
  if (!context) throw new Error('useStage must be used inside StageProvider');
  return context;
}
