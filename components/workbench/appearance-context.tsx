'use client';
import { createContext, useContext } from 'react';
export type Appearance = 'light' | 'dark' | 'internal-light' | 'internal-dark';
export const AppearanceContext = createContext<{ appearance: Appearance; setAppearance?: (value: Appearance) => void; setFrameAppearance?: (id: string, value: Appearance | undefined) => void }>({ appearance: 'light' });
export const useAppearance = () => useContext(AppearanceContext);

export const APPEARANCE_OPTIONS = [
  { value: 'light', label: 'External - Light' },
  { value: 'dark', label: 'External - Dark' },
  { value: 'internal-light', label: 'Internal - Light' },
  { value: 'internal-dark', label: 'Internal - Dark' },
] as const;
