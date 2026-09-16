# Shared presentation and design review

Working branch: `presentation-integration`, based on `80d9a48`.
The Tone reference application and existing mockups are preserved.

## Latest upstream integration — September 15, 2026

Merged development/default branch `origin/Matt` at `6280058` in local merge
`c7ded45`. There is no remote branch named `dev`. Existing uncommitted review
work was restored; recovery stash `77f7a78389f5a982623ff2182dde93a56cf8532d`
has been retained. No changes were pushed or deployed.

Matt's `SharePrototypeButton` is beside Present in `components/workbench/topbar.tsx`.
It opens the existing `ShareSettings` dialog with starting screen, navigation,
comment and approval options. Generated links use the existing Play route and
`view=shared`, with the chosen `screen` and matching `page`, excluding overlays.
`PlayerLoader` forwards shared mode; legacy shared playback hides editor/review chrome
and does not return to the editor on Escape. Normal previews use `exitPreview`
to close the Play tab, with an editor-return fallback. These behaviors are preserved.

The implementation now saves one validated `SharedReview` on the existing file
through `createFileSaver` and the Files PATCH endpoint. `ShareSettings` keeps a
browser draft but saves it before exposing/copying a link. It includes the preset,
starting screen, navigation preference, supported capability grants, explicitly
selected artifacts, and Matt's future comment/approval preferences. This updates
existing shared links for the file; it is not a versioned snapshot.

Shared Player reads saved configuration and ignores local review/overview/comment
notes. Legacy shared links with no saved configuration retain prototype-only
playback. Configured shared views expose read-only review tools, never the editor
return link or a preset that can elevate permissions. Stored start takes precedence
over query parameters; removed source IDs fall back safely. Navigation off hides
story/page browsing, search and pivot, while prototype interactions remain usable.

Refer to `docs/features/editor-update-handoff.md` for Matt's integration boundaries.

## Existing architecture inspected before implementation

- `/f/[id]/play` loads the saved file through the existing repository, normalizes
  layouts and validates screens. `PlayerLoader` preserves the client-only Craft boundary.
- `Player` owns one reducer for screen history, inline dialogs and overlay stacks.
  `PlayProvider` supplies those same interactions to the source components.
- `StageProvider`, Craft `Editor`/`Frame`, the block resolver and `OverlayHost`
  remain the rendering owners. Presentation does not save Craft layouts.
- Present entry already uses the existing file saver. Review state is distinct
  from editor save state and prototype state.
- Comments use the existing per-file browser store. Overview title/notes use
  their existing browser key. Neither is cross-device collaboration.
- Files API routes currently have no authenticated reviewer or file-access checks.
  A display name is not an authenticated identity.

## Incremental sequence and implementation status

1. **Shared player:** fixed same-screen navigation leaving inline dialogs open;
   existing navigation, overlay, reset, zoom and save-handoff behavior retained.
2. **Artifacts:** versioned, validated review metadata references stable screen IDs.
   Supports screen, slide, prototype, journey, flow, comparison, requirement,
   component and decision content. Add content creates a separate story item;
   existing screens are adapted without copying layouts. Narrative items display
   text and source links. Journeys/flows are ordered source references, not a new
   diagram editor. A decision content card is not an approved decision record.
3. **Context:** editable structured context, explicit save, optional pinning across
   navigation. File-scoped browser drafts plus explicit publication through Share; malformed storage is preserved and
   saving is blocked until recovered. Save failures retain drafts. Existing overview
   data is not migrated or overwritten by context saving.
4. **Controls:** content/context search in Screens; Focus, Compare and Prototype/Pivot
   in Presentation options. Focus uses Craft node IDs and measured DOM to dim the
   surrounding view; it also has a keyboard-selectable component list. Comparison
   reuses the resolver with an inert second source and a shared zoom. Prototype
   pause preserves local state. Previous/Next traverses the shared story.
5. **Voting:** transport-independent private → locked → revealed lifecycle and
   decision validation implemented and tested. No voting UI, persistence adapter,
   API, reviewer links or authentication has been connected yet. Voting is deliberately deferred from this implementation scope.
6. **Capabilities:** the Player accepts explicit granted capabilities; presets
   intersect them, never add grants. This is a UI integration contract, not
   server authorization. Current client-only prototype defaults to full grants.
7. **Presets:** Stakeholder Review, Design Review, Research Review and Development Handoff use the
   same Player. Design exposes all implemented capabilities. Presets are experience
   defaults, not PO/designer/developer identity checks.

## Control ownership

- Header: preset, viewport/zoom, Context, Review, expand and exit.
- Presentation options: secondary Focus, Compare, Prototype/Pivot and restart.
- Story footer: Previous, position, Next; a single sequential navigation owner.
- Review panel: screens/search/add content, comments, overview and context.
- Context: content definition, source references, rationale fields, pin and save.
- Canvas: original source interaction; Focus and comment placement are explicit modes.

## Storage and access boundaries

`dreamscape:review:<fileId>` contains the author's versioned review draft. Share
allows explicit selection and preview before saving selected metadata to
`files.shared_review` (nullable JSONB, migration `0006_shared_review`). No Craft
layouts, original overview data or comment IDs are copied into review metadata.
The existing save queue and conflict checks are reused. Legacy patches omit the
field and preserve it; explicit null clears it. Duplicated files start without a
published review, because their sources receive new IDs and require fresh review.
Source references may become unavailable; the text/reference is retained.

Presets organize context fields. Research shows supplied evidence and limitations;
Dev shows supplied interactions, component references and accessibility. Missing
fields say “Not provided.” Manual decisions contain summary, rationale, owner and
next step; they are not approvals. Recipient grants exclude editing, voting and
comments. Authenticated access control, real approvals, voting, collaboration,
study management and tracker integrations remain future work.

Only the local PGlite migration was exercised. No hosted migrations, deployment or
push were performed. Apply the schema migration as part of a future deployment.

Before connecting real votes:

1. Derive reviewer identity and per-file grants from an authenticated server session.
2. Persist ballot mutations atomically, checking phase and capability in the same
   transaction. Never accept client-provided actor IDs or capability booleans as authority.
3. Return only `ballotForReviewer` projections. Raw votes never reach clients;
   totals appear only after lock and reveal. Prevent vote writes after locking.
4. Store append-only decision records with actor, timestamp, selected option,
   rationale, owner, next step and ballot/artifact references.
5. Test simultaneous cast/lock, revoked grants, cross-file access, duplicate
   submission, reconnects and reveal. Do not infer private voting from hidden UI.

For a local rehearsal instead, explicitly label that it is browser-local and
not a private multi-person review. Keep that adapter replaceable.

## Verification

September 15, 2026, saved-review integration:

- Full suite: 2,371 passing tests; four existing editor tests hit their five-second
  timeout while the production build also ran. The two affected files and the
  final Player, ShareSettings and model files passed a single-worker rerun:
  100 tests across five files, with the default timeouts unchanged.
- Type checking, changed-source lint and production build pass.
- Repository tests verify recipient reload, unchanged source layouts, preserved
  metadata on legacy patches, conflict behavior, explicit clearing and duplication.
- Share tests verify deliberate selection, save before copy, and no copy on failure.
- Player tests verify saved start, preset narrowing, read-only recipient context,
  navigation settings and absence of author controls. Existing overlay, Focus,
  artifact, storage and Present tests are retained.
- Browser: editor → Present → save example context → Share → select context and
  Stakeholder preset → save/copy → separate recipient browser. The recipient had
  no local review data, displayed saved context, and showed no runtime errors.
  Navigation off persisted to recipients. Mobile preview and the Context panel
  were inspected, with screenshots under `output/playwright/shared-*.png`.

## Local walkthrough

1. Open the file and choose Present.
2. Use Context to prepare source-linked notes or additional content; Save context.
3. Return to the editor and open Share.
4. Choose a review preset, available tools and starting point. Preview and check
   the context items to include. Use “Update selected items from local context”
   when replacing an earlier published version of those notes.
5. Save and copy link. The recipient loads the saved review configuration.

The Share UI presents the four presets as audience choices with concise outcomes.
On narrow screens this becomes one compact audience selector. Starting point and
browsing are grouped together, only explicitly selected context is highlighted,
and capability controls live under “Customize review tools.” Inactive comments,
voting and approvals are described as future collaboration instead of appearing
as usable controls. The save-and-copy action remains visible while scrolling.

Configured recipient views show the audience as a read-only badge, use one Context
entry point, and omit empty Browse/Previous/Next controls when the review contains
only one item. Recipient context renders as readable text instead of disabled form
fields. The panel uses the preset-specific field order and labels missing values
as “Not provided.”

Remaining product refinements: persistent story ordering, node-specific context
anchors, synchronized comparison scrolling, richer journey visualization, and
cross-device collaborative editing/comments. Formal voting and approvals,
authentication, study management and tracker integrations remain deferred.
