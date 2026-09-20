# Variations integration

## Current behavior
Explore variations is available from frame and selection menus, the inline AI
prompt, and the Pages list. A spacious entry dialog accepts one optional prompt.
Generate variations submits written instructions; I’m feeling lucky requests
three alternatives. Teaching annotations are always requested.

Each exploration is stored under pages[].exploration with kind "variations".
Source snapshots remain unchanged. The dedicated workspace presents generation
rounds as automatically arranged Sections on one infinite canvas. Options sit
side by side with anchored designer annotations. Clicking an option title fits
it for inspection and explicitly targets it in chat. Parent connectors show
refinement ancestry; Jump to round fits an entire Section.

Try another round retains the current round's source and constraints, carries
feedback and prior option names, and does not refine a rejected option. Earlier
rounds remain intact. Add to canvas is per option and creates editable frames
beside the source, avoiding existing frames and diagram objects. A missing
source creates a new Design page. Copies clear promotion links and remap lineage.

## Model integration
Pass a ChatTransport to Workbench. All chat, inline prompt, and variation calls
use sendDesignRequest, which prepends the shared instructions in
lib/chat/design-instructions.ts. Those instructions distinguish UX principles,
supplied facts, hypotheses, and validation needs; they prohibit invented roles,
workflows, research and citations. They are currently code-managed, not editable
in Settings. The proposed application-wide editor has NOT been implemented.

The placeholder transport reports that generation is unavailable. There is no
live model connection in this checkout. Examples in the local Testing Page were
manually generated during the assistant session and are not repository fixtures.
The implementation is provider-neutral and does not require Cursor.

Return JSON matching lib/variations/model.ts. Prompt-driven requests permit one
to three alternatives; explicit-count requests require their exact count. Trees
must use registered components, valid parent/child links and preserve unselected
nodes. Rationale supports up to three annotations with 650-character explanations.
Validation is not a complete component-prop or accessibility validator. Provider
keys, authorization, usage limits and model routing belong server-side.

## Limits
Existing saved rationale is not rewritten by changes to model instructions.
The local Testing Page has reported a save conflict; this change does not claim
to resolve concurrent editing conflicts. Live generation, long-history performance,
atomic promotion undo, cross-screen prototype target remapping, and verified
external precedent retrieval need further work. Natural-language rejection is
not automatically classified: use Try another round for an explicit same-source
request. Round labels are automatic; editable names are not yet implemented.
