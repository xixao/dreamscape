'use client';

import { Component, type ReactNode } from 'react';
import Link from 'next/link';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { Button } from '@/components/ui/button';
import type { Screen } from '@/lib/files/repository';
import { DANGER_GHOST, EMPTY, EMPTY_TITLE } from './chrome';

interface StageErrorBoundaryProps {
  fileId: string;
  screens: Screen[];
  currentScreenId: string;
  children: ReactNode;
}

interface StageErrorBoundaryState {
  hasError: boolean;
}

// Clears only the screen that failed to load, leaving every other screen in
// the file untouched - this boundary catches a saved layout Craft.js refuses
// to deserialize, which is a property of that one screen's data, not the
// whole file.
function resetScreen(fileId: string, screens: Screen[], currentScreenId: string): void {
  const resetScreens = screens.map((screen) =>
    screen.id === currentScreenId ? { ...screen, layout: emptyLayoutJson() } : screen,
  );
  fetch(`/api/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ screens: resetScreens }),
  })
    .catch((error: unknown) => console.warn('Could not reset the file.', error))
    .finally(() => window.location.reload());
}

// Catches a saved layout Craft.js refuses to deserialize (for example a dangling
// child reference `validateLayout`'s own shallow check cannot see). Storage is
// no longer this boundary's business: it shows an explicit recovery action
// instead of silently discarding anything.
export class StageErrorBoundary extends Component<StageErrorBoundaryProps, StageErrorBoundaryState> {
  state: StageErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): StageErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.warn('Saved layout could not be loaded.', error);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-w-0 items-center justify-center rounded-xl bg-canvas p-6">
        <div className={EMPTY}>
          <b className={EMPTY_TITLE}>This file could not be opened.</b>
          <div className="mt-3 flex items-center justify-center gap-4">
            <Link href="/" className="text-[13px] font-medium text-acc hover:underline">
              Back to files
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className={DANGER_GHOST}
              onClick={() => resetScreen(this.props.fileId, this.props.screens, this.props.currentScreenId)}
            >
              Reset file
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
