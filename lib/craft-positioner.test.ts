import { describe, expect, it } from 'vitest';
import { invalidateDropCache } from './craft-positioner';

describe('invalidateDropCache', () => {
  it('clears currentTargetChildDimensions and currentTargetId on the live positioner', () => {
    const eventHandler = {
      positioner: {
        currentTargetChildDimensions: [{ id: 'node-1', top: 0, left: 0, width: 10, height: 10 }],
        currentTargetId: 'node-1',
      },
    };

    invalidateDropCache(eventHandler);

    expect(eventHandler.positioner.currentTargetChildDimensions).toBeNull();
    expect(eventHandler.positioner.currentTargetId).toBeNull();
  });

  it('is a no-op when there is no positioner (no drag in progress)', () => {
    expect(() => invalidateDropCache({ positioner: null })).not.toThrow();
    expect(() => invalidateDropCache({})).not.toThrow();
  });

  it('is a no-op when the event handler itself is missing (no Editor ancestor, or a future Craft upgrade removing it)', () => {
    expect(() => invalidateDropCache(null)).not.toThrow();
    expect(() => invalidateDropCache(undefined)).not.toThrow();
  });
});
