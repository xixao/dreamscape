'use client';
import { createContext, useContext } from 'react';
export type Appearance = 'light' | 'dark';
export const AppearanceContext = createContext<{ appearance: Appearance; setAppearance?: (value: Appearance) => void; setFrameAppearance?: (id: string, value: Appearance | undefined) => void }>({ appearance: 'light' });
export const useAppearance = () => useContext(AppearanceContext);
