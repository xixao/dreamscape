'use client';
import { createContext, useContext } from 'react';
export const ExplorationEntryContext = createContext<((screenId?: string, nodeIds?: string[]) => void) | null>(null);
export function useExploreVariations() { return useContext(ExplorationEntryContext); }
