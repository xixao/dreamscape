# Assembly Workbench, Sub-project 1: Foundation

Date: 2026-09-11
Status: draft for Matt's review

## 1. What this sub-project delivers

A Next.js app where a designer drags shadcn components from a tray onto a responsive stage, nests them inside flex/grid layout containers, edits their props in an inspector (with separate mobile and desktop values for layout props), and switches the stage between 375, 768 and 1440 px. The layout is stored as a Craft.js JSON tree and survives a reload.

The full PRD ("The Responsive Shadcn Assembly Workbench") is split into four sub-projects. This spec covers the first one, which is PRD Phases 1 to 3 without the interaction triggers.

Later sub-projects, each with its own spec:

- Sub-project 2: interaction prototyping (button click routes views or opens a dialog).
- Sub-project 3: code generator and handoff panel, with the Vitest suite the PRD describes for it.
- Sub-project 4: multiplayer presence and pinned comments (Yjs vs. Liveblocks decision happens then).

Out of scope for this sub-project, deliberately: any interaction wiring, code export, presence, comments, a backend, a light theme for the workbench chrome, and workbench use on phones or tablets (the tool itself is desktop-only; the stage it contains is what's responsive).

## 2. Decisions already made with Matt

| Decision | Choice |
|---|---|
| Project location | `~/Documents/shadcn-assembly-workbench`, new git repo |
| Sidebars | Docked (280 px left, 320 px right), not floating panels |
| Breakpoints | Two: mobile and desktop. Tablet previews the desktop config at 768 px |
| Visual system for the chrome | The SF2 design system spec (`SF2-UI-DESIGN-SYSTEM-SPEC.md`) |
| shadcn components | Real files installed by the shadcn CLI, not stand-ins |
| Stage width | Source of truth for the breakpoint; presets set it, dragging the edge changes it freely |
| Undo/redo | Included (Craft.js history) |

## 3. Stack

Versions observed on npm on 2026-09-11. The scaffold uses whatever `create-next-app` and `shadcn init` produce that day; the numbers here are for orientation, not pins.

- Next.js 16.x (App Router), React 19.x, TypeScript, Tailwind CSS 4.x, lucide-react
- shadcn CLI 4.x, installing `button`, `input`, `card`, `dialog`, `label` into `components/ui/`
- `@craftjs/core` 0.2.12 (peer range includes React 19; last release Feb 2025, see Risks)
- Vitest 5, `@testing-library/react`, `@testing-library/user-event`, `jsdom`
- npm, Node 20

## 4. Architecture

### 4.1 Two visual systems in one window

The workbench chrome (topbar, tray, inspector, stage background) uses the SF2 system: dark surfaces, Archivo for prose, IBM Plex Mono for labels and measurements, the indigo accent, beveled panels, segmented controls, chip-style fields, no motion beyond the one 150 ms border fade.

The stage frame is a separate visual world. It renders the real shadcn components in shadcn's default light theme, in the font create-next-app installs for the app (Geist), like an artboard sitting inside a dark tool. The chrome's colors and fonts never cascade into it.

How the two are kept apart:

- shadcn's CSS variables (`--background`, `--card`, `--accent`, ...) stay exactly as `shadcn init` writes them on `:root`.
- Every SF2 token is namespaced `--wb-*` (`--wb-page`, `--wb-panel`, `--wb-card`, `--wb-hover`, `--wb-t1` to `--wb-t4`, `--wb-line`, `--wb-line-soft`, `--wb-line-strong`, `--wb-acc`, `--wb-acc2`, `--wb-grad`, `--wb-ok`, `--wb-warn`, `--wb-bad`, `--wb-shadow`, `--wb-shadow-lg`, `--wb-sans`, `--wb-mono`). The prefix exists because SF2 and shadcn both define `--card`. The tokens are registered in Tailwind's `@theme inline` block so chrome components can use classes like `bg-wb-panel` and `text-wb-t3`.
- The stage frame root sets `color-scheme: light`, `bg-background text-foreground`, and an explicit `font-family` (the stage font), so nothing from the chrome leaks in.
- Fonts load through `next/font/google`: Archivo and IBM Plex Mono for the chrome, Geist (the create-next-app default) for the stage.

### 4.2 Layout shell

The workbench is the full window (the SF2 "editor takeover" idea; there is no marketing shell or footer).

```
+------------------------------------------------------------------+
| Topbar  54 px, 12 px inset on top and sides                       |
+-----------+------------------------------------------+-----------+
| Tray      | Stage column (scrolls)                    | Inspector |
| 280 px    |   stage frame, centered, width = W px     | 320 px    |
|           |   scaled down to fit when W > column      |           |
+-----------+------------------------------------------+-----------+
```

- Grid: `grid-rows-[auto_1fr] grid-cols-[280px_1fr_320px]`, 12 px gutters, page background `--wb-page`.
- Topbar: SF2 §3 topbar (panel surface, 1 px `--wb-line` border, radius 14, `--wb-shadow`, height 54). Contents left to right: the product name, "Assembly Workbench", in Archivo 600 13 px, a 22 px vertical separator, the viewport segmented control (Mobile / Tablet / Desktop, SF2 `.fig-seg`), the stage readout in mono (for example `1440 px · desktop config · 72%`), a flex spacer, then Undo, Redo and New as ghost buttons with lucide icons (Undo2, Redo2, FilePlus2).
- Tray and Inspector: SF2 §7 `.card` plus the §10.1 `.sf-float` bevel, each with the §10.2 grip header (mono 10 px uppercase title in `--wb-t3`, no drag handle since the panels are docked, no minimize). Body scrolls independently.
- Stage column background: `#14121B`, the near-black SF2 reserves for full-bleed canvas moments.

### 4.3 The stage

- The frame is a `div` of exactly `W` px width, `min-height` 640 px (grows with content), shadcn `bg-background`, 1 px `--wb-line-strong` border, square corners, `--wb-shadow`. Centered horizontally in the column with 24 px padding around it.
- Presets: Mobile = 375, Tablet = 768, Desktop = 1440. Clicking a preset sets `W`. The segmented control highlights a preset only when `W` equals it exactly; at any other width nothing is highlighted and the readout shows the custom width.
- Resize: a 12 px wide grip on the frame's right edge. Pointer drag changes `W` live, clamped to [320, 1920]. Pointer events are used (not mouse events) and the drag captures the pointer so it survives leaving the grip.
- Scale to fit: when `W` exceeds the column's inner width, the frame gets CSS `zoom: innerWidth / W` (zoom is layout-aware, so scroll height and hit-testing stay correct; if Craft.js drop indicators misplace under `zoom`, the fallback is `transform: scale()` with a sized wrapper). The readout shows the resulting percentage; at 100% it shows nothing.
- Breakpoint derivation: `breakpoint = W < 768 ? 'mobile' : 'desktop'` (768 is Tailwind's `md`). A `StageProvider` context exposes `{ width, breakpoint, setWidth, presets }`. Blocks read `breakpoint` to resolve responsive props; nothing in the stage relies on browser media queries, because the stage is a div inside a wide window and `md:` classes would never fire there.
- Empty stage: the root container shows the SF2 §4 empty state (dashed `--wb-line-strong` border, centered): bold line "Nothing on the stage yet", then "Drag a component from the Components panel on the left and drop it here." Rendered in the chrome font and colors, since it is an editor affordance, not page content. The root uses this instead of the small "Drop here" placeholder described next.
- Empty containers: any LayoutBox, Card content area or Dialog content area with no children renders a dashed placeholder with `min-height` 80 px and the mono caption "Drop here" so it stays a visible drop target.

### 4.4 Selection and hover

- Craft.js reports `hovered` and `selected` per node. A `NodeIndicator` overlay (positioned with the node's bounding rect, not a border on the element, so layout never shifts) draws: hover = 1 px `--wb-acc` outline at 60% opacity; selected = 2 px `--wb-acc` outline plus a name tag at the top-left corner (mono 10 px uppercase, `--wb-acc` background, white text) showing the block name.
- Only one node is selected at a time. Clicking the root's own empty area selects the root; clicking the dark column outside the frame, or pressing Escape, deselects.
- The overlay takes `{ nodeId, color, label }`, so sub-project 4 can reuse it for other people's color-coded selections without changes.

### 4.5 Blocks (the draggable components)

"Block" is the name for a Craft.js-aware wrapper around a shadcn component. The Craft.js resolver keys match the PRD's component type identifiers exactly: `LayoutBox`, `Button`, `Input`, `Card`, `Dialog`. Files live in `components/blocks/`.

Common to every block except the root: draggable, deletable, and a `grow` boolean (adds `flex-1`) so items in a row can share the width.

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

The root of the tree is a LayoutBox (`column` at both breakpoints, padding 6, gap 4) that cannot be dragged or deleted. Its inspector hides `grow`.

**Button**: shadcn `Button`. Props: `label` (text, default "Button"), `variant` (default, destructive, outline, secondary, ghost, link), `size` (default, sm, lg), `disabled` (boolean). Not a container.

**Input**: shadcn `Input`, with an optional shadcn `Label` above it. Props: `label` (text, empty hides the label), `placeholder` (text), `type` (text, email, password, number), `disabled` (boolean). Not a container. Fills its parent's width like shadcn's Input does.

**Card**: shadcn `Card` with `CardHeader` (`CardTitle`, `CardDescription`) and a `CardContent` that is a drop zone. Props: `title` (text, default "Card title"), `description` (text, empty hides it). The header disappears entirely when both are empty.

**Dialog**: in this sub-project there are no interactions, so the dialog is rendered in "design mode": a shadcn `Button` (variant outline) as the trigger, and directly below it an inline panel styled like `DialogContent` (border, radius, `bg-background`, padding 6, shadow) holding the title, description and a drop zone. The real Radix dialog portals to `document.body`, ignores the stage's zoom and would cover the chrome, which is wrong for editing; sub-project 2 adds a play mode that uses the real one. Props: `triggerLabel` (text, default "Open dialog"), `title` (text, default "Dialog title"), `description` (text), `previewOpen` (boolean, default on, marked `editorOnly` so the code generator later skips it; off hides the inline panel).

### 4.6 Drop rules

Craft.js only allows drops into nodes rendered as `canvas` Elements. Exactly three things are canvas zones: a LayoutBox, a Card's content area, a Dialog's content area. That is the PRD's "elements can only be structured inside standard, fluid layout containers" rule, enforced by the engine rather than by a separate validator. Two additional node rules:

- A Dialog's content area rejects another Dialog (`canMoveIn` returns false for type `Dialog`).
- The root cannot be moved or deleted (`canDrag` false, delete action ignores it).

On a rejected drop Craft.js draws its drop indicator in the error color (set to `--wb-bad`) and releasing does nothing; there is no toast.

### 4.7 Responsive props

Storage shape, for any prop marked responsive:

```ts
type Breakpoint = 'mobile' | 'desktop';
type Responsive<T> = { mobile: T; desktop?: T };
```

`resolve(value, breakpoint)` returns `value[breakpoint] ?? value.mobile`. Non-responsive props are plain values. The PRD's schema example used flat keys (`mobileDirection`, `desktopDirection`); one key per prop holding `{ mobile, desktop }` avoids synthesizing key names in generic code and adds a third breakpoint later by adding a key, so that is the shape used. Saved layouts stay compatible if tablet is ever added.

Class mapping lives in `lib/classes.ts` as tables of literal Tailwind strings (Tailwind 4 only generates classes it can see written out; no `gap-${n}` interpolation anywhere). `layoutBoxClasses(props, breakpoint)` returns the resolved class list for the stage; `blockClasses(props)` returns the shared `grow` class (`flex-1`, which has no effect inside a grid parent, and that is acceptable). The same tables are what sub-project 3's generator will read to emit `flex-col md:flex-row`, so the stage and the export can't drift.

### 4.8 Inspector

Bound to the current selection.

- Nothing selected: SF2 empty state, "Nothing selected", "Click a component on the stage to edit it."
- Selected: a breadcrumb of ancestors (mono 10.5 px, each ancestor clickable to select it, so a parent container is one click away), then the type name (Archivo 600 13 px) with, for containers, a mono count of direct children ("3 items"), then the fields, then a Delete row (SF2 `.btn.danger`, hidden for the root).
- Fields are generated from a per-block prop schema (`components/blocks/schemas.ts`), one entry per prop with `kind`, `label`, `options`, `responsive`, `editorOnly`, `showWhen` (for `columns` only when `mode` is grid). Field kinds map to SF2 controls: 2 or 3 options → `.fig-seg` segmented control; 4 or more → native `select` inside a `.fig-chip`; text → `.fig-chip` text input; boolean → a two-option segmented control (Off / On). Every field has the SF2 mono uppercase label above it. Fields group into `.fig-section` blocks: "Layout" (LayoutBox props, or `grow` for others), "Content" (labels, titles, placeholder), "Style" (variant, size, background), "Editor" (`previewOpen`).
- Responsive fields edit the value for the stage's current breakpoint. The label carries a small chip reading MOBILE or DESKTOP, and below the control a mono caption shows the other breakpoint's value, for example `desktop: row`. Clicking that caption switches the stage to that breakpoint's preset (375 or 1440). This is the "what you see is what you're editing" model: at 768 the desktop config is active, and the readout says so.
- Edits go through Craft.js `setProp` and are therefore undoable. Text fields commit on every keystroke, throttled inside Craft's history so typing a word is one undo step.

### 4.9 Keyboard

Ignored while focus is inside any input, textarea or select.

- Delete or Backspace: delete the selected node (never the root).
- Cmd/Ctrl+Z: undo. Shift+Cmd/Ctrl+Z: redo.
- Escape: deselect.

### 4.10 Persistence and reset

- On every change, `query.serialize()` is written to `localStorage` under `assembly-workbench:layout:v1`, debounced 500 ms.
- On load, the saved JSON is passed to `<Frame data={...}>`. If the JSON is missing, corrupt, or references a block type that no longer exists, the stage starts empty and a `console.warn` explains why. No toast, no modal.
- Stage width also persists (`assembly-workbench:stage-width`), so a reload comes back at the same width.
- New (topbar) opens the SF2 §8 confirm modal: "Start a new layout?", "This clears everything on the stage. Undo will not bring it back.", Cancel on the left, "Clear stage" as the danger action on the right. Escape and clicking the overlay cancel.

### 4.11 Data model summary

The serialized tree is Craft.js's own format: a map from node id to `{ type: { resolvedName }, props, parent, nodes, linkedNodes, custom, hidden, isCanvas, displayName }`. It carries everything the PRD's schema lists (id, component type, props, parent, children). One deviation to flag: node ids are Craft.js's random 10-character strings, not RFC 4122 UUIDs. They are unique for the purpose (including across collaborators later), and Craft.js offers no hook to swap its generator, so no mapping layer is added.

## 5. File layout

```
app/
  layout.tsx                 fonts, globals.css, <html> shell
  page.tsx                   renders <Workbench />
  globals.css                tailwind import, shadcn tokens, --wb-* tokens, @theme inline
components/
  ui/                        shadcn: button, input, card, dialog, label
  chrome/                    SF2 primitives as React components
    panel.tsx                card + bevel + grip header
    seg.tsx                  segmented control
    chip-field.tsx           icon-prefixed field chip (text, number, select)
    ghost-button.tsx, danger-button.tsx
    empty-state.tsx
    confirm-modal.tsx
  workbench/
    workbench.tsx            Craft <Editor> provider, StageProvider, shell grid
    topbar.tsx
    component-tray.tsx
    stage.tsx                frame, resize grip, zoom, root <Frame>
    stage-context.tsx        width, breakpoint, presets
    node-indicator.tsx       hover/selection overlay
    keyboard.tsx             the shortcuts hook
    inspector/
      inspector.tsx          selection → schema → sections
      field.tsx              one schema entry → one control (responsive aware)
      breadcrumb.tsx
  blocks/
    layout-box.tsx, button.tsx, input.tsx, card.tsx, dialog.tsx
    registry.ts              resolver map + tray metadata (name, icon, hint)
    schemas.ts               prop schemas
    drop-zone.tsx            the shared empty-container placeholder
lib/
  responsive.ts              Breakpoint, Responsive<T>, resolve(), breakpointForWidth(), presets, clamp
  classes.ts                 prop → Tailwind class tables
  persistence.ts             save/load with validation
*.test.ts(x)                 colocated next to the file under test
vitest.config.ts, vitest.setup.ts
```

## 6. Testing

Vitest and React Testing Library are wired in before the first block is written, and each piece gets its tests as it is built (test first).

Unit tests (pure code, fast):

- `lib/responsive`: `breakpointForWidth` at 320, 375, 767, 768, 1440; `resolve` picks the breakpoint value, falls back to mobile when desktop is missing, passes plain values through; `clampWidth` bounds.
- `lib/classes`: LayoutBox class output for flex row/column, grid with 1 to 4 columns, every gap and padding step, every background; at both breakpoints; asserts exact class strings.
- `lib/persistence`: save/load round trip; corrupt JSON returns null and warns; JSON naming an unknown block type returns null.
- `blocks/schemas`: every block has a schema; every responsive schema entry corresponds to a `Responsive` default; `showWhen` for columns.

Component tests (jsdom, RTL):

- Each block renders the right shadcn element for its props (Button variant classes, Input with and without label, Card header hidden when title and description are empty, Dialog panel hidden when `previewOpen` is off). Craft.js hooks are provided through a small test harness that mounts a real `Editor` with the registry and a fixed tree, so the blocks are tested as they run.
- Inspector: for a selected Button node, the schema produces the expected fields; changing the variant field updates the node's props; for a LayoutBox at 375 px the direction field shows MOBILE and the caption shows the desktop value.
- Stage: width presets change the readout and the derived breakpoint; a LayoutBox with row/column responsive direction renders `flex-col` at 375 and `flex-row` at 1440.

Not unit-tested (jsdom has no real drag and drop): the drag from tray to stage, drop indicators, the resize grip. These are verified by hand in the browser, below.

## 7. How we verify it in the running app

1. `npm run dev` starts with no compiler warnings; `npm test` and `npm run lint` pass.
2. Empty stage shows the empty state. Drag a LayoutBox in; drag a Card into it; drag a Button and an Input into the Card. Drag a second Card into the LayoutBox.
3. With the LayoutBox selected: Desktop shows the two cards side by side; Mobile shows them stacked; Tablet shows them side by side at 768.
4. Drag the stage edge to 700: cards stack. Drag to 800: side by side. Readout follows.
5. Change the Button variant and label, the Input label; the inspector's responsive chip reads MOBILE at 375 and DESKTOP at 1440; the caption click jumps between them.
6. Undo and redo through the topbar and the keyboard; Delete removes the selection; Escape deselects; typing in a field never triggers Delete.
7. Reload: the layout and the stage width come back. New clears the stage after the confirm.
8. Try dropping a Dialog into a Dialog's content: no drop indicator appears.
9. Screenshots at 375, 768 and 1440 for the record.

## 8. Risks and the order of work

- **Craft.js on React 19.3 and Next 16.** The library's last release is 19 months old. The very first implementation step after scaffolding is a spike: mount `Editor`, `Frame`, one canvas `Element` and one draggable in the fresh app and confirm drag, drop, select and undo work in dev with React Strict Mode on. If Strict Mode breaks it, turn Strict Mode off for the workbench route and note it. If it is broken beyond that, stop and report before building anything on top of it. The alternative if it comes to that is dnd-kit plus a hand-rolled tree store, which is a different spec.
- **`zoom` and drop indicators.** Craft.js positions indicators with bounding rects; `zoom` is layout-aware so this should just work, but it is checked in the spike at 1440 in a narrow window. Fallback: transform scale with manual rect scaling.
- **Tailwind 4 class detection.** Every class string must be written out literally in `lib/classes.ts`. A test asserts the tables only contain strings from an allow-list, so a future `gap-${n}` refactor fails immediately.
- **Next 16 defaults.** Turbopack, `next.config.ts`, and whatever create-next-app asks about (React Compiler is declined) are accepted as they come; nothing here depends on a specific Next feature beyond the App Router and `next/font`.

## 9. Copy and styling rules for the chrome

- No em dashes in any UI string. Plain complete sentences. Instructions name what the user physically does and where ("Drag a component from the Components panel on the left").
- No colored card borders, tinted alert washes, gradient trim or entrance animations. The SF2 primary gradient button is not used anywhere in this sub-project; nothing here is the one primary action per view yet.
- The only transition in the chrome is SF2's 150 ms border-color fade on hoverable cards, which applies to tray items on hover.
