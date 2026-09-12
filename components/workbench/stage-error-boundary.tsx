'use client';

import { Component, type ReactNode } from 'react';
import { LAYOUT_STORAGE_KEY } from '@/lib/persistence';

interface StageErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface StageErrorBoundaryState {
  hasError: boolean;
}

// Catches a saved layout Craft.js refuses to deserialize (for example a dangling
// child reference loadLayout's own shallow validation cannot see). Drops the bad
// layout from storage so the next load does not hit the same crash, and renders
// an empty stage instead of a blank screen.
export class StageErrorBoundary extends Component<StageErrorBoundaryProps, StageErrorBoundaryState> {
  state: StageErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): StageErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.warn('Saved layout could not be loaded; starting empty.', error);
    try {
      window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } catch (storageError) {
      console.warn('Could not clear the saved layout.', storageError);
    }
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
