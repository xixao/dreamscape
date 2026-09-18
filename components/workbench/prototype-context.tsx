'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Screen } from '@/lib/files/repository';
import type { PanelMode } from '@/lib/workbench/panel-store';

export type { PanelMode };

export interface PrototypeContextValue {
  showAllConnections?: boolean;
  setShowAllConnections?: (show: boolean) => void;
  panelMode: PanelMode;
  screens: Screen[];
}

// Defaults to design mode with no screens, rather than throwing when there is
// no provider, so every existing Craft harness/test that mounts NodeIndicator
// without wrapping it in a Workbench keeps behaving exactly as it did before
// interactions existed: no tag, outline logic unaffected.
const DEFAULT_VALUE: PrototypeContextValue = { panelMode: 'design', screens: [] };

const PrototypeContext = createContext<PrototypeContextValue>(DEFAULT_VALUE);

/**
 * Bridges `WorkbenchShell`'s panelMode/screens state to `NodeIndicator`,
 * which Craft renders internally (via the Editor's `onRender` prop) rather
 * than as a normal descendant in JSX we control - a plain prop cannot reach
 * it, so this context does instead. Wrap it around anything that renders the
 * Craft `<Frame>` (Stage), not the whole app.
 */
export function PrototypeProvider({
  value,
  children,
}: {
  value: PrototypeContextValue;
  children: ReactNode;
}) {
  const [showAllConnections, setShowAllConnections] = useState(false);
  return <PrototypeContext.Provider value={{...value,showAllConnections,setShowAllConnections}}>{children}</PrototypeContext.Provider>;
}

export function usePrototypeContext(): PrototypeContextValue {
  return useContext(PrototypeContext);
}
