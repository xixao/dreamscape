import type { Screen } from './files/repository';

// v1 supports exactly one click interaction per layer (spec
// docs/superpowers/specs/2026-09-12-screens-prototype-play-design.md #2), but
// it is still stored as an array on the node's Craft `custom` data so a later
// task can add more triggers without another data-shape migration.
export type NavigateInteraction = {
  id: string;
  trigger: 'click';
  action: 'navigate';
  targetScreenId: string;
};

export type OpenDialogInteraction = {
  id: string;
  trigger: 'click';
  action: 'openDialog';
  targetNodeId: string;
};

export type BackInteraction = {
  id: string;
  trigger: 'click';
  action: 'back';
};

// Overlay frames (spec docs/superpowers/specs/2026-09-13-overlay-frames-
// design.md section 3): open an overlay frame (a Screen with `kind:
// 'overlay'`, see lib/files/validate.ts) on top of the current screen, or
// close one. The legacy openDialog (an inline Dialog block designed inside
// the requesting screen) stays exactly as it was.
export type OpenOverlayInteraction = {
  id: string;
  trigger: 'click';
  action: 'openOverlay';
  targetScreenId: string;
};

export type CloseOverlayInteraction = {
  id: string;
  trigger: 'click';
  action: 'closeOverlay';
};

export type Interaction =
  | NavigateInteraction
  | OpenDialogInteraction
  | BackInteraction
  | OpenOverlayInteraction
  | CloseOverlayInteraction;

export type InteractionActionType = Interaction['action'];

type CustomData = { interactions?: Interaction[] } & Record<string, unknown>;

type NodeWithCustom = { data: { custom?: CustomData } };

/**
 * Reads the (at most one, in v1) interaction stored on a Craft node's custom
 * data. Accepts the live node object from `useEditor`/`useNode` state
 * (`state.nodes[id]`), which is always `{ data: { custom, ... } }` whether or
 * not anything has ever been set.
 */
export function getInteraction(node: NodeWithCustom | null | undefined): Interaction | null {
  const interactions = node?.data.custom?.interactions;
  if (!Array.isArray(interactions) || interactions.length === 0) return null;
  return interactions[0] ?? null;
}

interface SetCustomActions {
  setCustom: (id: string, cb: (custom: CustomData) => void) => void;
}

/**
 * Writes (or clears, when `interaction` is null) the one interaction a node
 * carries, through Craft's own `actions.setCustom` so the change is tracked
 * and serialized like any other node data.
 */
export function setInteraction(actions: SetCustomActions, id: string, interaction: Interaction | null): void {
  actions.setCustom(id, (custom) => {
    if (interaction) {
      custom.interactions = [interaction];
    } else {
      delete custom.interactions;
    }
  });
}

// Loose structural shape of Craft's `EditorState['nodes']`, just enough for
// describeInteraction to look up a target Dialog's title. Matches
// `state.nodes` directly, so callers can pass it with no reshaping.
export type DescribeNodes = Record<
  string,
  { data: { name: string; displayName?: string; props?: Record<string, unknown> } }
>;

const DEFAULT_DIALOG_TITLE = 'Dialog';

export interface InteractionRunner {
  navigate: (screenId: string) => void;
  back: () => void;
  openDialog: (nodeId: string) => void;
  /**
   * Runs an `openOverlay` interaction: pushes the overlay frame `screenId`
   * onto Play's overlay stack. A no-op for an id already in the stack (no
   * loops), an id that is a plain screen, or an id the file does not have
   * (spec section 3) - the Player enforces all three.
   */
  openOverlay: (screenId: string) => void;
  /**
   * Runs a `closeOverlay` interaction: closes the top overlay - or, fired
   * from inside an overlay, that overlay itself (the Player rebinds it per
   * overlay, see components/play/player.tsx).
   */
  closeOverlay: () => void;
}

/**
 * Turns a node's stored interaction into a ready-to-call onClick handler
 * bound to the given play-context actions, or undefined when there is no
 * interaction to run (so a block can pass the result straight to its root
 * element's `onClick` with no further branching). Used by every block in
 * play mode (spec docs/superpowers/specs/2026-09-12-screens-prototype-play-design.md
 * #5: "Any block with a click interaction ... gets the onClick in play
 * mode"), so the action-to-context-call mapping lives in exactly one place
 * instead of being re-derived in each of the 20 block components.
 */
export function interactionHandler(
  interaction: Interaction | null,
  runner: InteractionRunner,
): (() => void) | undefined {
  if (!interaction) return undefined;
  if (interaction.action === 'navigate') {
    const { targetScreenId } = interaction;
    return () => runner.navigate(targetScreenId);
  }
  if (interaction.action === 'openDialog') {
    const { targetNodeId } = interaction;
    return () => runner.openDialog(targetNodeId);
  }
  if (interaction.action === 'openOverlay') {
    const { targetScreenId } = interaction;
    return () => runner.openOverlay(targetScreenId);
  }
  if (interaction.action === 'closeOverlay') {
    return () => runner.closeOverlay();
  }
  return () => runner.back();
}

/**
 * Builds the canvas tag text (spec #4: "→ <target name>", "→ Dialog:
 * <title>", "← Back"; overlay frames spec section 3: "→ Overlay: <name>",
 * "× Close overlay") for a node's interaction. `screens` and `nodes` are
 * used only to resolve a target's current display name, since interactions
 * only ever store an id.
 */
export function describeInteraction(
  interaction: Interaction | null,
  screens: Pick<Screen, 'id' | 'name'>[],
  nodes: DescribeNodes,
): string | null {
  if (!interaction) return null;

  if (interaction.action === 'back') return '← Back';

  if (interaction.action === 'closeOverlay') return '× Close overlay';

  if (interaction.action === 'navigate') {
    const target = screens.find((screen) => screen.id === interaction.targetScreenId);
    return `→ ${target ? target.name : 'Unknown screen'}`;
  }

  if (interaction.action === 'openOverlay') {
    const target = screens.find((screen) => screen.id === interaction.targetScreenId);
    return target ? `→ Overlay: ${target.name}` : '→ Unknown overlay';
  }

  const node = nodes[interaction.targetNodeId];
  if (!node) return '→ Unknown dialog';
  const title = node.data.props?.title;
  return `→ Dialog: ${typeof title === 'string' && title.trim() !== '' ? title : DEFAULT_DIALOG_TITLE}`;
}
