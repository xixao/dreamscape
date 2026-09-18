import { describe, expect, it, vi } from 'vitest';
import {
  getInteraction,
  interactionHandler,
  setInteraction,
  type Interaction,
} from './interactions';

describe('getInteraction', () => {
  it('returns null when the node has no custom data', () => {
    expect(getInteraction({ data: {} })).toBeNull();
  });

  it('returns null when the node is null or undefined', () => {
    expect(getInteraction(null)).toBeNull();
    expect(getInteraction(undefined)).toBeNull();
  });

  it('returns null when custom.interactions is missing or empty', () => {
    expect(getInteraction({ data: { custom: {} } })).toBeNull();
    expect(getInteraction({ data: { custom: { interactions: [] } } })).toBeNull();
  });

  it('returns the one interaction stored on the node', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'back' };
    expect(getInteraction({ data: { custom: { interactions: [interaction] } } })).toEqual(interaction);
  });
});

describe('setInteraction', () => {
  it('replaces custom.interactions with a single-item array through actions.setCustom', () => {
    const custom: Record<string, unknown> = {};
    const setCustom = vi.fn((_id: string, cb: (data: Record<string, unknown>) => void) => cb(custom));
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'back' };

    setInteraction({ setCustom }, 'node1', interaction);

    expect(setCustom).toHaveBeenCalledTimes(1);
    expect(setCustom.mock.calls[0][0]).toBe('node1');
    expect(custom.interactions).toEqual([interaction]);
  });

  it('deletes custom.interactions when given null', () => {
    const custom: Record<string, unknown> = { interactions: [{ id: 'i1', trigger: 'click', action: 'back' }] };
    const setCustom = vi.fn((_id: string, cb: (data: Record<string, unknown>) => void) => cb(custom));

    setInteraction({ setCustom }, 'node1', null);

    expect('interactions' in custom).toBe(false);
  });
});

describe('interactionHandler', () => {
  function runner() {
    return { navigate: vi.fn(), back: vi.fn(), openDialog: vi.fn(), openOverlay: vi.fn(), closeOverlay: vi.fn() };
  }

  it('returns undefined for no interaction', () => {
    expect(interactionHandler(null, runner())).toBeUndefined();
  });

  it('calls navigate with the target screen id', () => {
    const play = runner();
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'navigate', targetScreenId: 's2' };
    const handler = interactionHandler(interaction, play);
    handler?.();
    expect(play.navigate).toHaveBeenCalledWith('s2');
    expect(play.back).not.toHaveBeenCalled();
    expect(play.openDialog).not.toHaveBeenCalled();
  });

  it('calls openDialog with the target node id', () => {
    const play = runner();
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openDialog', targetNodeId: 'dialog1' };
    interactionHandler(interaction, play)?.();
    expect(play.openDialog).toHaveBeenCalledWith('dialog1');
    expect(play.navigate).not.toHaveBeenCalled();
  });

  it('calls back with no arguments', () => {
    const play = runner();
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'back' };
    interactionHandler(interaction, play)?.();
    expect(play.back).toHaveBeenCalledWith();
    expect(play.navigate).not.toHaveBeenCalled();
  });

  it('calls openOverlay with the target screen id', () => {
    const play = runner();
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openOverlay', targetScreenId: 'o1' };
    interactionHandler(interaction, play)?.();
    expect(play.openOverlay).toHaveBeenCalledWith('o1');
    expect(play.navigate).not.toHaveBeenCalled();
    expect(play.openDialog).not.toHaveBeenCalled();
    expect(play.closeOverlay).not.toHaveBeenCalled();
  });

  it('calls closeOverlay with no arguments', () => {
    const play = runner();
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'closeOverlay' };
    interactionHandler(interaction, play)?.();
    expect(play.closeOverlay).toHaveBeenCalledWith();
    expect(play.back).not.toHaveBeenCalled();
    expect(play.openOverlay).not.toHaveBeenCalled();
  });
});
