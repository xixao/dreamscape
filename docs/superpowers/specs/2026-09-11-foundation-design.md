# Assembly Workbench, Sub-project 1: Foundation

Date: 2026-09-11
Status: implemented 2026-09-11; verified against section 7

## 1. What this sub-project delivers

A Next.js app where a designer drags shadcn components from a tray onto a responsive stage, nests them inside flex/grid layout containers, edits their props in an inspector (with separate mobile and desktop values for layout props), and switches the stage between 375, 768 and 1440 px. The layout is stored as a Craft.js JSON tree and survives a reload.

The full PRD ("The Responsive Shadcn Assembly Workbench") is split into four sub-projects. This spec covers the first one, which is PRD Phases 1 to 3 without the interaction triggers.

Later sub-projects, each with its own spec:

- Sub-project 2: interaction prototyping (button click routes views or opens a dialog).
- Sub-project 3: code generator and handoff panel, with the Vitest suite the PRD describes for it.
- Sub-project 4: multiplayer presence and pinned comments (Yjs vs. Liveblocks decision happens then).

Out of scope for this sub-project, deliberately: any interaction wiring, code export, presence, comments, a backend, a light theme for the chrome, and workbench use on phones or tablets (the tool itself is desktop-only; the stage it contains is what's responsive).

## 2. Decisions made with Matt

| Decision | Choice |
|---|---|
| Project location | `~/Documents/shadcn-assembly-workbench`, new git repo |
| Sidebars | Docked (280 px left, 320 px right), not floating panels |
| Breakpoints | Two: mobile and desktop. Tablet previews the desktop config at 768 px |
| Component library | shadcn/ui components for everything: the workbench chrome and the blocks on the stage. Real files installed by the shadcn CLI |
| Chrome theme | The SF2 design system spec (`SF2-UI-DESIGN-SYSTEM-SPEC.md`), values verbatim, applied to shadcn's CSS variables |
| Stage theme | shadcn's basic default (light) theme, as the stand-in for the real product design system, which gets swapped in later (see 4.12) |
| Stage width | Source of truth for the breakpoint; presets set it, dragging the edge changes it freely |
| Undo/redo | Included (Craft.js history) |
| Everything else | Delegated to Claude; the choices are recorded in this document |

## 3. Stack

Versions observed on npm on 2026-09-11. The scaffold uses whatever `create-next-app` and `shadcn init` produce that day; the numbers here are for orientation, not pins.

- Next.js 16.x (App Router), React 19.x, TypeScript, Tailwind CSS 4.x, lucide-react
- shadcn CLI 4.x, Radix-based components, neutral base color. Installed components:
  - for the blocks on the stage: `button`, `input`, `card`, `dialog`, `label`
  - for the chrome: `toggle-group`, `select`, `switch`, `separator`, `tooltip`, `alert-dialog`, `breadcrumb`, `badge`
- `@craftjs/core` 0.2.12 (peer range includes React 19; last release Feb 2025, see Risks)
- Vitest 5, `@testing-library/react`, `@testing-library/user-event`, `jsdom`
- npm, Node 20

## 4. Architecture

### 4.1 One component library, two themes

Everything is built from `@/components/ui/*`. What differs between the chrome and the stage is the theme, and shadcn themes are CSS variable scopes:

- `:root` carries the SF2 tokens mapped onto shadcn's variables: `--background` #1B1922 (SF2 page), `--card` and `--popover` and `--sidebar` #23212C (SF2 panel), `--secondary` and `--muted` #2A2836 (SF2 card), `--accent` #373444 (SF2 hover), `--foreground` #EAE8F0 (t1), `--muted-foreground` #918CA3 (t3), `--primary` #5568C4 with white foreground, `--destructive` #E05D5D, `--border` and `--input` rgba(255,255,255,.09) (SF2 line), `--ring` #8C97DB, `--radius` 0.625rem (so shadcn's `rounded-xl` is SF2's 14 px card radius and `rounded-md` is 8 px), `color-scheme: dark`. SF2 values that shadcn has no slot for are added as extra variables with their SF2 names: `--t2`, `--t4`, `--line-soft`, `--line-strong`, `--acc`, `--acc2`, `--grad`, `--ok`, `--warn`, `--bad`, `--sf-shadow`, `--sf-shadow-lg` (namespaced so they cannot collide with Tailwind's own `--shadow-*` scale), `--canvas` (#14121B), `--chip`, `--bevel-line`, `--bevel-hi`, `--bevel-drop`, and registered in Tailwind's `@theme inline` block so classes like `text-t2`, `border-line-strong`, `bg-canvas`, `shadow-panel-lg` exist.
- Because `:root` is the SF2 theme, anything Radix portals to `document.body` from the chrome (Select menus, Tooltips, the AlertDialog) is SF2-styled automatically.
- The artboard root carries the class `theme-basic`, which re-declares shadcn's default light values for every shadcn variable and sets `color-scheme: light`. Everything inside the artboard is basic shadcn.
- Fonts: `@theme inline` maps `--font-sans` to `var(--ui-font-sans)` and `--font-mono` to `var(--ui-font-mono)`. `:root` sets those to Archivo and IBM Plex Mono; `.theme-basic` sets them to Geist Sans and Geist Mono. All four load through `next/font/google`.
- The SF2 patterns that are not plain tokens (the mono uppercase field label, the beveled chip field, the recessed segmented control, the panel card with its grip header, the dashed empty state, the hairline section divider) live as constants of Tailwind utility classes in `components/workbench/chrome.ts`, with the spec's values verbatim. They are applied to shadcn components through `className`, so they win over the components' own utilities (the `cn` helper merges them), and the shadcn files themselves stay unmodified.
- Editor affordances that need a color: hover and selection outlines use `--acc` (#8C97DB); the selected node's name tag is `--primary` with white text; a rejected drop indicator is `--bad`.

### 4.2 Layout shell

The workbench is the full window (the SF2 "editor takeover" idea; there is no marketing shell or footer).

```
+------------------------------------------------------------------+
| Topbar  54 px, SF2 topbar, 12 px inset on top and sides           |
+-----------+------------------------------------------+-----------+
| Tray      | Stage column (scrolls, bg --canvas)       | Inspector |
| 280 px    |   artboard, centered, width = W px        | 320 px    |
| SF2 panel |   scaled down to fit when W > column      | SF2 panel |
+-----------+------------------------------------------+-----------+
```

- Grid: `h-screen grid grid-rows-[auto_1fr] grid-cols-[280px_1fr_320px] gap-3 p-3` on `bg-background`.
- Topbar: SF2 §3 (card surface, 1 px `--border`, `rounded-xl`, `shadow-panel`, height 54, padding 0 14). Contents left to right: the product name "Assembly Workbench" (`text-[13px] font-semibold`), a 22 px vertical `Separator`, the viewport `ToggleGroup` (type single; items Mobile / Tablet / Desktop with lucide `Smartphone`, `Tablet`, `Monitor` icons and text labels) styled as the SF2 §10.4 segmented control (recessed track, raised active item), the stage readout in `font-mono text-[11px] text-muted-foreground tabular-nums` (for example `1440 px · desktop · 72%`), a flex spacer, then Undo, Redo and New as `Button variant="ghost" size="icon"` with lucide `Undo2`, `Redo2`, `FilePlus2`, each wrapped in a `Tooltip` and carrying an `aria-label`. Undo and Redo are disabled when the history has nothing to do.
- Tray and Inspector: SF2 §7 `.card` plus the §10.1 bevel (card surface, `--bevel-line` border, `rounded-xl`, `shadow-panel-lg`), each with the §10.2 grip header (padding 9 12 7, bottom hairline `--line-soft`, title in the mono label treatment: `font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground`; no drag handle since the panels are docked, no minimize). The body scrolls on its own.

### 4.3 The stage

- The stage column is `bg-canvas` (#14121B, the near-black SF2 reserves for full-bleed canvas moments) and scrolls.
- The artboard is a `div.theme-basic` of exactly `W` px width, `min-height` 640 px (grows with content), `bg-background border border-line-strong shadow-panel-lg`, square corners. Centered horizontally in the column with 24 px padding around it.
- Presets: Mobile = 375, Tablet = 768, Desktop = 1440. Clicking a preset sets `W`. The toggle group shows a preset as active only when `W` equals it exactly; at any other width nothing is active and the readout shows the custom width.
- Resize: a 12 px wide grip on the artboard's right edge (`cursor-col-resize`, a `bg-border` pill that turns `bg-acc` while dragging). Pointer drag changes `W` live, clamped to [320, 1920]. Pointer events with pointer capture, so the drag survives leaving the grip. The pointer delta is divided by the current zoom so the edge follows the cursor when the artboard is scaled.
- Scale to fit: when `W` exceeds the column's inner width (column width minus 48), the artboard wrapper gets CSS `zoom: inner / W` (zoom is layout-aware, so scroll height and hit-testing stay correct; if Craft.js drop indicators misplace under `zoom`, the fallback is `transform: scale()` with a sized wrapper). The readout shows the resulting percentage; at 100% it shows nothing.
- Breakpoint derivation: `breakpoint = W < 768 ? 'mobile' : 'desktop'` (768 is Tailwind's `md`). A `StageProvider` context exposes `{ width, breakpoint, preset, zoom, setWidth, setPreset, setZoom }`. Blocks read `breakpoint` to resolve responsive props; nothing in the stage relies on browser media queries, because the stage is a div inside a wide window and `md:` classes would never fire there.
- Empty stage: the root container shows a dashed empty state in the artboard's own theme (`border border-dashed rounded-lg p-10 text-center`): "This frame is empty" in `text-sm font-medium`, then "Drag a component from the Components panel on the left and drop it here." in `text-sm text-muted-foreground`. The root uses this instead of the small "Drop here" placeholder described next.
- Empty containers: any LayoutBox, Card content area or Dialog content area with no children renders a dashed placeholder (`min-h-20 border border-dashed rounded-md`) with "Drop here" in `text-xs text-muted-foreground`, so it stays a visible drop target.

### 4.4 Selection and hover

- Craft.js reports `hovered` and `selected` per node. A `NodeIndicator` overlay (positioned from the node's bounding rect and portaled to `document.body`, so layout never shifts and zoom is already accounted for) draws: hover = 1 px `--acc` outline at 60% opacity; selected = 2 px `--acc` outline plus a name tag at the top-left corner (`font-mono text-[10px] font-semibold uppercase bg-primary text-white px-1.5 py-0.5`) showing the block type. The root and the content zones never get an outline; the inspector is how you see that the root is selected.
- Only one node is selected at a time. Clicking the root's own empty area selects the root; clicking the canvas outside the artboard, or pressing Escape, deselects. Clicking inside a Card's or Dialog's content zone selects the Card or Dialog, never the zone itself.
- The overlay component takes `{ rect, color, label, weight }`, so sub-project 4 can reuse it for other people's color-coded selections without changes.

### 4.5 Blocks (the draggable components)

"Block" is the name for a Craft.js-aware wrapper around a shadcn component. The Craft.js resolver keys match the PRD's component type identifiers exactly: `LayoutBox`, `Button`, `Input`, `Card`, `Dialog`. The two content zones are also resolver entries, named `CardContent` and `DialogContent`. Files live in `components/blocks/`.

Common to every block except the root: draggable, deletable, and a `grow` boolean (adds `flex-1 min-w-0`) so items in a row can share the width.

**LayoutBox**: the only free-standing container. Renders a `div`.

| Prop | Type | Responsive | Default |
|---|---|---|---|
| `mode` | `flex` or `grid` | no | `flex` |
| `direction` | `row` or `column` | yes | mobile `column`, desktop `row` |
| `columns` | 1 to 4 (grid only) | yes | mobile 1, desktop 3 |
| `align` | `start`, `center`, `end`, `stretch` | yes | `stretch` both |
| `justify` | `start`, `center`, `end`, `between` | yes | `start` both |
| `gap` | 0, 1, 2, 3, 4, 6, 8 (Tailwind steps) | no | 4 |
| `padding` | 0, 2, 4, 6, 8 | no | 4 |
| `background` | `none`, `muted`, `card` (card adds a border and radius) | no | `none` |

The root of the tree is a LayoutBox (`column` at both breakpoints, padding 6, gap 4) that cannot be dragged or deleted and fills the artboard's minimum height. Its inspector hides `grow`.

**Button**: shadcn `Button`. Props: `label` (text, default "Button"), `variant` (default, destructive, outline, secondary, ghost, link), `size` (default, sm, lg), `disabled` (boolean). Not a container. In the editor, `disabled` renders as `aria-disabled` plus reduced opacity, because a truly disabled button can't be clicked to select it.

**Input**: shadcn `Input`, with an optional shadcn `Label` above it. Props: `label` (text, empty hides the label), `placeholder` (text), `type` (text, email, password, number), `disabled` (boolean). Not a container. Fills its parent's width like shadcn's Input does. In the editor the input is read-only and not tabbable, so clicking it selects the block instead of placing a caret.

**Card**: shadcn `Card` with `CardHeader` (`CardTitle`, `CardDescription`) and a `CardContent` zone that accepts drops. Props: `title` (text, default "Card title"), `description` (text, empty hides it). The header disappears entirely when both are empty.

**Dialog**: in this sub-project there are no interactions, so the dialog is rendered in "design mode": a shadcn `Button` (variant outline) as the trigger, and directly below it an inline panel styled like `DialogContent` (`rounded-lg border bg-background p-6 shadow-lg`, max width 32rem) holding the title, description and a `DialogContent` zone. The real Radix dialog portals to `document.body`, ignores the stage's zoom and would cover the chrome, which is wrong for editing; sub-project 2 adds a play mode that uses the real one. Props: `triggerLabel` (text, default "Open dialog"), `title` (text, default "Dialog title"), `description` (text), `previewOpen` (boolean, default on, marked `editorOnly` so the code generator later skips it; off hides the inline panel).

### 4.6 Drop rules

Craft.js only allows drops into nodes rendered as `canvas` Elements. Exactly three things are canvas zones: a LayoutBox, a Card's content zone, a Dialog's content zone. That is the PRD's "elements can only be structured inside standard, fluid layout containers" rule, enforced by the engine rather than by a separate validator. Two additional node rules:

- A Dialog's content zone rejects another Dialog (`canMoveIn` returns false when any incoming node's type is `Dialog`).
- The root and the content zones cannot be dragged (`canDrag` false); the delete action ignores the root and the zones.

On a rejected drop Craft.js draws its drop indicator in the error color (`--bad`) and releasing does nothing; there is no toast.

### 4.7 Responsive props

Storage shape, for any prop marked responsive:

```ts
type Breakpoint = 'mobile' | 'desktop';
type Responsive<T> = { mobile: T; desktop?: T };
```

`resolve(value, breakpoint)` returns `value[breakpoint] ?? value.mobile`. Non-responsive props are plain values. The PRD's schema example used flat keys (`mobileDirection`, `desktopDirection`); one key per prop holding `{ mobile, desktop }` avoids synthesizing key names in generic code and adds a third breakpoint later by adding a key, so that is the shape used. Saved layouts stay compatible if tablet is ever added.

Class mapping lives in `lib/classes.ts` as tables of literal Tailwind strings (Tailwind 4 only generates classes it can see written out; no `gap-${n}` interpolation anywhere). `layoutBoxClasses(props, breakpoint)` returns the resolved class list for the stage; `blockClasses(props)` returns the shared `grow` classes (`flex-1 min-w-0`, which have no effect inside a grid parent, and that is acceptable). The same tables are what sub-project 3's generator will read to emit `flex-col md:flex-row`, so the stage and the export can't drift.

### 4.8 Inspector

Bound to the current selection.

- Nothing selected: the SF2 empty state (dashed `--line-strong` border, `rounded-xl`, centered): "Nothing selected", "Select a layer on the canvas to edit it."
- Selected: a shadcn `Breadcrumb` of ancestors, root first (each ancestor clickable to select it, so a parent container is one click away), then the type name (`text-[13px] font-semibold`) with, for containers, a `Badge variant="secondary"` counting direct children ("3 items"), then the fields, then a Delete button at the bottom (a ghost `Button` with the SF2 danger treatment: `text-bad`, red wash on hover; hidden for the root).
- Fields are generated from a per-block prop schema (each block file exports its own schema; `registry.tsx` collects them), one entry per prop with `kind`, `label`, `section`, `options`, `responsive`, `editorOnly`, `showWhen` (for `columns` only when `mode` is grid). Field kinds map to shadcn controls: 2 or 3 options → `ToggleGroup` styled as the SF2 segmented control; 4 or more → `Select` whose trigger is styled as the SF2 chip; text → `Input` styled as the SF2 chip; boolean → `Switch` on the same row as its label. Every field has a `Label` in the SF2 mono label treatment above it (beside it for switches). Fields group into sections with the SF2 hairline divider and a title (`text-[12.5px] font-semibold`): "Auto layout" (LayoutBox props, or `grow` for others), "Content" (labels, titles, placeholder), "Appearance" (variant, size, background), "Editor" (`previewOpen`).
- Responsive fields edit the value for the stage's current breakpoint. The label carries a `Badge variant="outline"` in mono reading MOBILE or DESKTOP, and below the control a caption in `font-mono text-[10.5px] text-muted-foreground` shows the other breakpoint's value, for example `desktop: row`. Clicking that caption switches the stage to that breakpoint's preset (375 or 1440). This is the "what you see is what you're editing" model: at 768 the desktop config is active, and the readout says so.
- Edits go through Craft.js `setProp` and are therefore undoable. Text fields commit on every keystroke through `actions.history.throttle(500)`, so typing a word is one undo step.

### 4.9 Keyboard

Ignored while focus is inside any input, textarea, select or contenteditable.

- Delete or Backspace: delete the selected node (never the root or a zone).
- Cmd/Ctrl+Z: undo. Shift+Cmd/Ctrl+Z: redo.
- Escape: deselect.

### 4.10 Persistence and reset

- On every change, `query.serialize()` is written to `localStorage` under `assembly-workbench:layout:v1`, debounced 500 ms.
- On load, the saved JSON is passed to `<Frame data={...}>`. If the JSON is missing, corrupt, has no `ROOT`, or references a block type that no longer exists, the stage starts empty and a `console.warn` explains why. No toast, no modal.
- Frame width also persists (`assembly-workbench:stage-width`), so a reload comes back at the same width.
- The workbench renders client-side only (`next/dynamic` with `ssr: false` from a small client loader), because both Craft.js and the localStorage reads need the browser, and a server render would not match.
- New (topbar) opens an `AlertDialog`: title "Start a new frame?", description "This removes every layer in the frame. Undo will not bring it back.", Cancel on the left, "Clear frame" on the right with the SF2 danger treatment (red text, red wash on hover). Confirming deserializes the empty tree and clears the history. Escape and Cancel close it without clearing.

### 4.11 Data model summary

The serialized tree is Craft.js's own format: a map from node id to `{ type: { resolvedName }, props, parent, nodes, linkedNodes, custom, hidden, isCanvas, displayName }`. It carries everything the PRD's schema lists (id, component type, props, parent, children). One deviation to flag: node ids are Craft.js's random 10-character strings, not RFC 4122 UUIDs. They are unique for the purpose (including across collaborators later), and Craft.js offers no hook to swap its generator, so no mapping layer is added.

### 4.12 Swapping the design system later

Four seams, and nothing else, know what the components look like:

1. `components/ui/*`: the shadcn files themselves. Replacing them with the real design system's implementations (same export names) changes every block and the whole chrome at once. The Dialog block's design-mode panel is composed from Tailwind and plain elements rather than `@/components/ui/dialog`, because Radix's `DialogTitle` needs a `Dialog` root; that block's look is restyled by editing `components/blocks/dialog.tsx`.
2. `app/globals.css`, the `.theme-basic` block: the artboard's theme. Replacing its values re-skins every prototyped screen without touching a block.
3. `components/blocks/*`, the `variant` and `size` option lists in each block's schema. If the real system has different variants, these are the lines to edit.
4. `lib/classes.ts`: the layout class tables, which are plain Tailwind and stay as they are.

Blocks never import Radix or Tailwind-specific pieces directly; they only compose `@/components/ui/*` and read the schema. The chrome's SF2 treatment is isolated in `:root` and `components/workbench/chrome.ts`.

### 4.13 Figma terminology

The chrome's copy uses Figma's words, so a designer who already knows Figma feels at home. Nothing underneath changed to match: resolver keys, prop names, file names and saved layouts keep their original names, and the mapping below is the only place the two vocabularies meet.

| What the user sees (Figma word) | What it is in the code |
|---|---|
| Frame | The `LayoutBox` block with auto layout (`mode: 'flex'`) |
| Components panel (Figma says Assets; Matt chose Components) | The component tray |
| Design panel | The inspector |
| Canvas | The stage column |
| Layer | A block, i.e. a Craft.js node |
| Horizontal / Vertical | `direction: 'row'` / `direction: 'column'` (flex row / column) |
| Distribution: Space between | `justify: 'between'` |
| Fill container | The `grow` prop |
| Fill | The `background` prop |
| Alignment | The `align` prop |

Code identifiers, resolver keys (`LayoutBox`, `Button`, `Input`, `Card`, `Dialog`, `CardContent`, `DialogContent`), prop names, file names, storage keys and saved layouts are unchanged by this table. The one runtime seam is `LayoutBox.craft.displayName`, which is `"Frame"`: Craft.js stores it on every node as `data.displayName` alongside the unchanged resolver name `data.name`, so the breadcrumb, the inspector's type name and the selection outline's name tag all read it (falling back to `data.name` when a block has no override) and show "Frame" without renaming `LayoutBox` itself anywhere a saved layout, a test, or another block's code refers to it.

## 5. File layout

```
app/
  layout.tsx                 fonts (Archivo, IBM Plex Mono, Geist, Geist Mono), globals.css, <html> shell
  page.tsx                   renders <WorkbenchLoader />
  globals.css                tailwind import, SF2 theme on :root, .theme-basic, extra tokens in @theme inline
components/
  ui/                        shadcn components, installed by the CLI, unmodified
  workbench/
    workbench-loader.tsx     client component: next/dynamic(ssr: false) around Workbench
    workbench.tsx            Craft <Editor> provider, StageProvider, shell grid, persistence wiring
    chrome.ts                SF2 pattern class constants (label, chip, segmented control, panel, empty state, section)
    topbar.tsx
    component-tray.tsx
    stage.tsx                artboard, resize grip, zoom, root <Frame>
    stage-context.tsx        width, breakpoint, preset, zoom
    node-indicator.tsx       hover/selection overlay (onRender) and SelectionOutline
    selection.tsx            useSelectedNode(), useZoneRedirect()
    keyboard.tsx             useWorkbenchKeyboard(), isEditableTarget()
    new-layout-dialog.tsx    the AlertDialog behind New
    inspector/
      inspector.tsx          selection → schema → sections
      field.tsx              one schema entry → one control (responsive aware)
      breadcrumb.tsx
  blocks/
    schema.ts                FieldSchema, BlockSchema, BlockType
    drop-zone.tsx            DropZone and StageEmptyState placeholders
    layout-box.tsx, button.tsx, input.tsx, card.tsx, dialog.tsx   each exports the block and its schema
    registry.tsx             resolver map, tray items, schemaFor(), emptyLayoutJson(), KNOWN_TYPES, ZONE_TYPES
lib/
  responsive.ts              Breakpoint, Responsive<T>, resolve(), breakpointForWidth(), otherBreakpoint()
  stage.ts                   STAGE_PRESETS, clampWidth(), presetForWidth(), computeZoom()
  classes.ts                 prop → Tailwind class tables, LAYOUT_BOX_DEFAULTS
  persistence.ts             save/load with validation, debounce()
test/
  craft-harness.tsx          renderInEditor(), EditorProbe for tests that need actions/query
*.test.ts(x)                 colocated next to the file under test
vitest.config.ts, vitest.setup.ts
```

## 6. Testing

Vitest and React Testing Library are wired in before the first block is written, and each piece gets its tests as it is built (test first).

Unit tests (pure code, fast):

- `lib/responsive`: `breakpointForWidth` at 320, 375, 767, 768, 1440; `resolve` picks the breakpoint value, falls back to mobile when desktop is missing, passes plain values through; `otherBreakpoint`.
- `lib/stage`: `clampWidth` bounds and rounding; `presetForWidth` exact matches only; `computeZoom` is 1 when it fits and `available / width` when it doesn't.
- `lib/classes`: LayoutBox class output for flex row/column, grid with 1 to 4 columns, every gap and padding step, every background; at both breakpoints; asserts exact class strings; every table value is a literal string.
- `lib/persistence`: save/load round trip; corrupt JSON returns null and warns; JSON with no ROOT returns null; JSON naming an unknown block type returns null; stage width round trip and rejection of out-of-range values.
- `blocks/registry`: every block type has a schema; every responsive schema entry corresponds to a `Responsive` default; `columns` is hidden unless `mode` is grid; `emptyLayoutJson()` parses and has a ROOT LayoutBox with the root defaults.

Component tests (jsdom, RTL, through the Craft harness that mounts a real `Editor` with the registry):

- Each block renders the right shadcn element for its props (Button variant classes and `aria-disabled`, Input with and without label and `readOnly`, Card header hidden when title and description are empty, Dialog panel hidden when `previewOpen` is off, LayoutBox with row/column responsive direction renders `flex-col` at 375 and `flex-row` at 1440, empty containers show "Drop here", the root shows the stage empty state).
- Inspector: nothing selected shows the empty state; for a selected Button the schema produces the expected fields; changing the variant updates the node's props; for a LayoutBox at 375 px the direction field shows MOBILE and the caption shows the desktop value; the breadcrumb lists ancestors root first; Delete removes the node; the root has no Delete.
- Topbar: presets change the width and readout; Undo/Redo disabled state follows the history.
- Keyboard: Delete removes the selected node, is ignored for the root and while typing in an input; Escape deselects; Cmd+Z undoes.

Not unit-tested (jsdom has no real drag and drop): the drag from tray to stage, drop indicators, the resize grip, zoom. These are verified by hand in the browser, below.

## 7. How we verify it in the running app

1. `npm run dev` starts with no compiler warnings; `npm test`, `npm run lint` and `npx tsc --noEmit` pass.
2. Empty stage shows the empty state. Drag a LayoutBox in; drag a Card into it; drag a Button and an Input into the Card. Drag a second Card into the LayoutBox.
3. With the LayoutBox selected: Desktop shows the two cards side by side; Mobile shows them stacked; Tablet shows them side by side at 768.
4. Drag the stage edge to 700: cards stack. Drag to 800: side by side. Readout follows.
5. Change the Button variant and label, the Input label; the inspector's responsive badge reads MOBILE at 375 and DESKTOP at 1440; the caption click jumps between them.
6. Undo and redo through the topbar and the keyboard; Delete removes the selection; Escape deselects; typing in a field never triggers Delete.
7. Reload: the layout and the stage width come back. New clears the stage after the confirm.
8. Try dropping a Dialog into a Dialog's content: the indicator turns red and nothing lands.
9. The chrome is dark SF2 (Archivo, mono labels, beveled chips, recessed segmented control); the artboard is light basic shadcn in Geist. Screenshots at 375, 768 and 1440 for the record.

## 8. Risks and the order of work

- **Craft.js on React 19.3 and Next 16.** The library's last release is 19 months old. The very first implementation step after scaffolding, theming and the pure libraries is a spike: mount `Editor`, `Frame`, one canvas `Element` and one draggable in the fresh app and confirm drag, drop, select and undo work in dev with React Strict Mode on. If Strict Mode breaks it, turn Strict Mode off and note it. If it is broken beyond that, stop and report before building anything on top of it. The alternative if it comes to that is dnd-kit plus a hand-rolled tree store, which is a different spec. Confirmed at verification: Craft.js worked under React 19 and Next 16 with Strict Mode on, so the Strict-Mode-off fallback was not needed.
- **`zoom` and drop indicators.** Craft.js positions indicators with bounding rects; `zoom` is layout-aware so this should just work, but it is checked in the spike at 1440 in a narrow window. Fallback: transform scale with manual rect scaling. Confirmed at verification: CSS `zoom` worked correctly with Craft.js's drop indicators at 375, 768 and 1440, so the transform-scale fallback was not needed.
- **Tailwind 4 class detection.** Every class string must be written out literally in `lib/classes.ts` and `chrome.ts`. A test asserts the class tables only contain literal strings, so a future `gap-${n}` refactor fails immediately.
- **shadcn CLI drift.** After `shadcn add`, the installed `button.tsx` is read to confirm the variant and size names the schemas use; if the CLI's current output differs, the schema option lists follow the installed file.
- **Next 16 defaults.** Turbopack, `next.config.ts`, and whatever create-next-app asks about (React Compiler is declined) are accepted as they come; nothing here depends on a specific Next feature beyond the App Router, `next/font` and `next/dynamic`.

`actions.history.clear` exists on the Craft.js editor and is used by New to reset undo history when the stage is cleared, confirmed at verification (Undo and Redo are both disabled immediately after confirming New), so no workaround was needed.

**Build notes** (deviations found during the build, recorded here for anyone picking this up later):

- The shadcn CLI now defaults to Base UI, so the Radix flavor was installed explicitly (`components.json` style `radix-nova`).
- Vitest config is `vitest.config.mts` with `resolve.tsconfigPaths: true` (Vite 8).
- The installed `Tooltip` has no built-in provider, so the topbar wraps one.
- The design-mode `Input` uses `pointer-events-none` so clicks reach its block.
- The resize grip ends the drag on `pointercancel`.
- The keyboard hook reads the selection from `query.getState()` at keydown time.
- The selection overlay re-measures on zoom/width changes.
- Radix `AlertDialog` does not close on overlay click, so section 4.10's last sentence reads "Escape and Cancel close it without clearing." (confirmed live: clicking outside the New-layout dialog leaves it open; Escape and Cancel both close it without clearing the stage).

## 9. Copy and styling rules

- No em dashes in any UI string. Plain complete sentences. Instructions name what the user physically does and where ("Drag a component from the Components panel on the left").
- Chrome: SF2 values verbatim, nothing invented on top. No colored card borders, no tinted alert washes, no gradient trim, no added animations; the SF2 primary gradient is reserved for a single primary action per view and no view in this sub-project has one. shadcn components keep the transitions they ship with.
- Artboard: basic shadcn, untouched.
