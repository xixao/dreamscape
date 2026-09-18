'use client';
import { createContext, useContext, type ComponentType, type ReactElement } from 'react';
export interface WriterContextValue {
  scope?: string;
  statePreview?: { key: string; state: string } | null;
  selected: string | null;
  select: (key: string) => void;
  edit: (key: string, prop: string, value: string) => void;
  renderer: ComponentType<{ render: ReactElement }>;
}
export const WriterContext = createContext<WriterContextValue | null>(null);
export const useWriter = () => useContext(WriterContext);
