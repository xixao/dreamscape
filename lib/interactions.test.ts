import { describe, expect, it, vi } from 'vitest';
import type { Screen } from './files/repository';
import {
  describeInteraction,
  getInteraction,
  interactionHandler,
  setInteraction,
  type DescribeNodes,
  type Interaction,
} from './interactions';

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: 'screen0001', name: 'Frame 1', layout: '{}', stageWidth: 1440, ...overrides };
}

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

describe('describeInteraction', () => {
  const screens: Screen[] = [
    screen({ id: 's1', name: 'Login' }),
    screen({ id: 's2', name: 'Hello world' }),
    screen({ id: 'o1', name: 'Confirm delete', kind: 'overlay', presentation: { type: 'dialog', dismissible: true } }),
  ];
  const nodes: DescribeNodes = {
    dialog1: { data: { name: 'Dialog', displayName: 'Dialog', props: { title: 'Confirm delete' } } },
    dialog2: { data: { name: 'Dialog', displayName: 'Dialog', props: {} } },
  };

  it('returns null for no interaction', () => {
    expect(describeInteraction(null, screens, nodes)).toBeNull();
  });

  it('describes a navigate interaction with the target screen name', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'navigate', targetScreenId: 's2' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Hello world');
  });

  it('falls back to a generic label when the target screen no longer exists', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'navigate', targetScreenId: 'gone' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Unknown screen');
  });

  it('describes an openDialog interaction with the dialog title', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openDialog', targetNodeId: 'dialog1' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Dialog: Confirm delete');
  });

  it('falls back to the default dialog title when the dialog has none set', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openDialog', targetNodeId: 'dialog2' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Dialog: Dialog');
  });

  it('falls back to a generic label when the target dialog no longer exists', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openDialog', targetNodeId: 'gone' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Unknown dialog');
  });

  it('describes a back interaction', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'back' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('← Back');
  });

  it('describes an openOverlay interaction with the target overlay name', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openOverlay', targetScreenId: 'o1' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Overlay: Confirm delete');
  });

  it('falls back to a generic label when the target overlay no longer exists', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openOverlay', targetScreenId: 'gone' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Unknown overlay');
  });

  it('falls back to a generic label when the target id now names a plain screen, not an overlay (uses isOverlay)', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'openOverlay', targetScreenId: 's1' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('→ Unknown overlay');
  });

  it('describes a closeOverlay interaction', () => {
    const interaction: Interaction = { id: 'i1', trigger: 'click', action: 'closeOverlay' };
    expect(describeInteraction(interaction, screens, nodes)).toBe('× Close overlay');
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
