# Assembly Workbench, Sub-project 3: Screens, Prototype mode and Play

Date: 2026-09-12
Status: approved in conversation (Matt, 2026-09-12: "build a login screen and connect the button to trigger loading a hello world screen ... design or prototype modes"); technical choices delegated to Claude

## 1. What this delivers

A file holds several screens. The editor has Figma's two right-panel tabs, Design and Prototype. In Prototype, a layer gets an "On click" interaction that navigates to another screen of the same file. Play runs the prototype full-window: the wired button loads the target screen, dialogs open for real, Escape returns to the editor. This is the PRD's Feature B (zero-code interaction prototyping) plus the multi-screen model it needs.

Frame titles (earlier request) become screen names. Device presets and comments attach to screens in later tasks.

## 2. Decisions

| Decision | Choice |
|---|---|
| Screen model | `files.screens` jsonb: `Screen[]` where `Screen = { id: nanoid(10), name, layout (Craft tree), stageWidth, stageHeight?: number, deviceName?: string }`. Existing files migrate their `layout`/`stage_width` into one screen named "Frame 1"; `layout` and `stage_width` columns are dropped after the migration copies them |
| Editing model | One screen visible at a time (the current artboard), chosen from a Screens strip; the infinite canvas showing every screen at once arrives with the diagram canvas later |
| Interactions | Stored on the node in Craft's `custom` data: `custom.interactions = [{ id, trigger: 'click', action: 'navigate', targetScreenId }]` or `{ action: 'openDialog', targetNodeId }` for a Dialog on the same screen or `{ action: 'back' }`. One click interaction per layer in v1 |
| Which layers | Any block can carry an interaction; the Prototype tab shows it for the selected layer. Buttons are the demo case |
| Play | Route `/f/[id]/play?screen=<id>` renders the file's screens with Craft's `Editor enabled={false}`, real components (inputs typeable, dialogs open), click handling from `custom.interactions`, a slim mono overlay in the top-right corner with the screen name and "Esc to exit", history for `back`. Also opened by the ▶ Present button in the top bar (new tab) |
| Saving | The saver sends `{ screens }` for the whole file (small documents); conflict rules unchanged; the current screen id is remembered in the URL hash `#s=<id>` so reload keeps it |

## 3. Data and API

- Schema: `screens jsonb not null default '[]'` on `files`; migration `0002` adds it, backfills from `layout`/`stage_width` (`[{ id, name: 'Frame 1', layout, stageWidth }]`), then drops `layout` and `stage_width`. PGlite tests run the same migrations.
- Repository: `FileRecord.screens: Screen[]` replaces `layout`/`stageWidth`; `save` accepts `screens?: Screen[]` (each layout validated with `validateLayout`, names trimmed 1..80, widths clamped); `create` takes `screens?` or builds one default screen; `duplicate` copies screens with new ids; examples become files with one screen each (the example JSON stays a layout; the example loader wraps it).
- API: `PATCH /api/files/[id]` body gains `screens?: Screen[]` (zod); `GET` returns `screens`; `POST /api/files` accepts `screens?`.
- Interactions live inside each screen's layout (Craft `custom`), so no schema change beyond `screens`.

## 4. Editor

- Screens strip: a horizontal strip at the top of the stage column (SF2 segmented look): one chip per screen (name, active state), a "+" chip ("New screen": adds "Frame N" with the current screen's width, switches to it), right-click or a small chevron menu per chip with Rename (inline), Duplicate, Delete (confirm; not allowed on the last screen). Switching screens swaps the Craft `Frame` (remount with the screen's layout; the saver flushes first). Double-click the chip renames, as Figma renames a frame title.
- Right panel tabs "Design" and "Prototype" (SF2 segmented control in the panel header). Design is today's inspector. Prototype: for the selected layer, a section "Interactions" with "On click" as a select: None, Navigate to..., Open dialog..., Back; a second select for the target (screens by name, or Dialog layers on this screen); a "Remove" ghost action. Nothing selected: "Select a layer to add an interaction." Interactions are shown on the canvas as a small tag at the layer's top-right (`→ Hello world`) only while the Prototype tab is active.
- Top bar: ▶ Present (ghost icon button, lucide `Play`, opens `/f/<id>/play?screen=<current>` in a new tab). Keyboard: Figma uses Shift+Space or the ▶ button; no new shortcut beyond the button in v1.
- The keyboard hook, layer stack menu, comments and outlines keep working per screen.

## 5. Play

- `app/f/[id]/play/page.tsx`: server component loads the file; `Player` client component with `Editor enabled={false}` and one `Frame` for the current screen; a `PlayContext` `{ mode: 'play', navigate(screenId), back(), openDialog(nodeId) }`.
- Blocks read `usePlay()`: in play mode the Button is a real button whose `onClick` runs the node's interaction; Input/Textarea/Select/Checkbox/Switch/Slider are interactive (no `readOnly`/`pointer-events-none`); Dialog renders the real shadcn `Dialog` opened by `openDialog` or by its own trigger button; Card/Text/Image are static. The `NodeIndicator` outlines and drag connectors are not rendered in play mode.
- Transitions: instant swap in v1 (Figma's default "Instant").
- The page is full-window, `bg-background` of the screen theme (`theme-basic`), the frame centered at its width with the device height when set; a top-right mono overlay: screen name, "Esc to exit", a close button linking back to `/f/<id>#s=<screen>`.

## 6. Tests

- Repository/API: migration backfill (a legacy row becomes one screen), `screens` validation (bad layout inside a screen → 400), duplicate gives new screen ids, examples wrap into one screen.
- Editor: screens strip renders chips, New screen adds and switches, rename inline, delete confirm and last-screen guard, switching screens swaps the layout (harness: a Button from screen 2 appears), saver receives `{ screens }` with both screens; Prototype tab lists interactions for the selected layer and writes `custom.interactions` through `actions.setCustom`; the canvas tag shows the target name.
- Play: the wired Button click navigates to the target screen (RTL), Back returns, a Dialog interaction opens the real dialog (`role="dialog"`), Escape returns... (Escape navigates to the editor URL; assert the link target).
- Browser (production after redeploy): open Login screen, add a screen "Hello world" with a Text "Hello world", wire Sign in → Hello world in Prototype, Present, click Sign in, see Hello world, Esc back.

## 7. Out of scope now

Hover and press triggers, transitions and easing, scroll positions, overlays with positioning, component states, and the infinite canvas (that comes with the diagram work).
