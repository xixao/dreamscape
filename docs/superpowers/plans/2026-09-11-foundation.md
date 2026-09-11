# Assembly Workbench Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js workbench where a designer drags shadcn blocks (LayoutBox, Button, Input, Card, Dialog) onto a responsive artboard, nests them in flex/grid containers, edits their props with separate mobile/desktop values, resizes the artboard between 375/768/1440, and gets it all back after a reload.

**Architecture:** Craft.js owns the node tree, drag/drop, selection and history. A `StageProvider` context owns the artboard width; the breakpoint (`mobile` below 768, else `desktop`) is derived from it and blocks resolve their responsive props from that, never from CSS media queries. One component library (`@/components/ui/*`, shadcn) with two theme scopes: `:root` carries the SF2 design system tokens for the chrome, `.theme-basic` on the artboard carries shadcn's basic light defaults.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), lucide-react, `@craftjs/core` 0.2.x, Vitest 5 + React Testing Library + jsdom, npm.

Spec: `docs/superpowers/specs/2026-09-11-foundation-design.md`. Read it once before starting; each task below points at the sections it implements.

## Global Constraints

Every task inherits these.

- **Chrome theme is SF2, values verbatim.** `:root` maps the SF2 tokens onto shadcn's variables exactly as written in Task 3; the SF2 pattern classes in `components/workbench/chrome.ts` are the only way chrome components get their look. Do not invent colors, borders, gradients or animations. The SF2 primary gradient is not used anywhere in this sub-project.
- **Artboard theme is basic shadcn.** The artboard root has class `theme-basic`; nothing inside it uses a `--wb`/SF2 token or a chrome class constant.
- **shadcn files are never edited.** `components/ui/*` stays as the CLI wrote it. Styling differences are applied through `className` at the call site.
- **Resolver keys are exact:** `LayoutBox`, `Button`, `Input`, `Card`, `Dialog`, `CardContent`, `DialogContent`.
- **Tailwind classes are literal strings.** No template interpolation into class names anywhere (`gap-${n}` is forbidden). Tables in `lib/classes.ts` and constants in `chrome.ts` are the only places layout and chrome classes are written.
- **Dimensions:** sidebars 280 px / 320 px, topbar 54 px, gutters 12 px, presets 375 / 768 / 1440, breakpoint threshold 768, width clamp 320 to 1920, artboard min-height 640, stage padding 24.
- **Storage keys:** `assembly-workbench:layout:v1`, `assembly-workbench:stage-width`.
- **UI copy:** no em dashes, complete sentences, instructions name what the user does and where. The exact strings are given in the tasks; use them as written.
- **Blocks import only `@/components/ui/*`, `@craftjs/core`, `@/lib/*`, `@/components/blocks/*`.** Never Radix or Tailwind internals directly.
- **Tests first.** Every task writes the failing test, runs it, implements, runs it green, commits. Run `npx vitest run <file>` for one file, `npm test` for all.
- **Lint rules.** Next's ESLint config ships the React Compiler hook rules. If `react-hooks/set-state-in-effect` fires on an effect that synchronises a measured DOM value (the zoom in `stage.tsx`, the rect in `node-indicator.tsx`), add `// eslint-disable-next-line react-hooks/set-state-in-effect` on that line; those values only exist after commit. Do not disable the rule globally.
- **Commit after every task** with the message given. Commit messages end with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Working directory:** `/Users/m3dteammember/Documents/shadcn-assembly-workbench`. All paths below are relative to it. The repo already exists with the spec committed; it contains only `docs/` and `.git`.

## File map

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Loads Archivo, IBM Plex Mono, Geist, Geist Mono as CSS variables; imports globals.css |
| `app/page.tsx` | Renders `<WorkbenchLoader />` |
| `app/globals.css` | Tailwind import, SF2 theme on `:root`, `.theme-basic`, extra tokens in `@theme inline` |
| `components/ui/*` | shadcn, installed by CLI, untouched |
| `components/workbench/chrome.ts` | SF2 pattern class constants |
| `components/workbench/workbench-loader.tsx` | `next/dynamic` with `ssr: false` around `Workbench` |
| `components/workbench/workbench.tsx` | `<Editor>` provider, `StageProvider`, shell grid, persistence wiring, New |
| `components/workbench/stage-context.tsx` | `StageProvider`, `useStage` |
| `components/workbench/stage.tsx` | Stage column, artboard, zoom, resize grip, `<Frame>` |
| `components/workbench/topbar.tsx` | Name, viewport toggle, readout, Undo/Redo/New |
| `components/workbench/component-tray.tsx` | Draggable tray items |
| `components/workbench/node-indicator.tsx` | `NodeIndicator` (Craft `onRender`), `SelectionOutline` |
| `components/workbench/selection.tsx` | `useSelectedNode`, `useZoneRedirect` |
| `components/workbench/keyboard.tsx` | `useWorkbenchKeyboard`, `isEditableTarget` |
| `components/workbench/new-layout-dialog.tsx` | AlertDialog behind New |
| `components/workbench/inspector/inspector.tsx` | Selection → schema → sections → Delete |
| `components/workbench/inspector/field.tsx` | One `FieldSchema` → one control, responsive aware |
| `components/workbench/inspector/breadcrumb.tsx` | Ancestor breadcrumb |
| `components/blocks/schema.ts` | `FieldSchema`, `BlockSchema`, `BlockType`, `SectionName` |
| `components/blocks/drop-zone.tsx` | `DropZone`, `StageEmptyState` |
| `components/blocks/layout-box.tsx` | `LayoutBox` block + `layoutBoxSchema` |
| `components/blocks/button.tsx` | `Button` block + `buttonSchema` |
| `components/blocks/input.tsx` | `Input` block + `inputSchema` |
| `components/blocks/card.tsx` | `Card` block, `CardContent` zone + `cardSchema` |
| `components/blocks/dialog.tsx` | `Dialog` block, `DialogContent` zone + `dialogSchema` |
| `components/blocks/registry.tsx` | `resolver`, `trayItems`, `schemaFor`, `emptyLayoutJson`, `KNOWN_TYPES`, `ZONE_TYPES`, `GROW_FIELD` |
| `lib/responsive.ts` | `Breakpoint`, `Responsive<T>`, `resolve`, `breakpointForWidth`, `otherBreakpoint` |
| `lib/stage.ts` | `STAGE_PRESETS`, `clampWidth`, `presetForWidth`, `computeZoom`, limits |
| `lib/classes.ts` | Layout prop types, class tables, `layoutBoxClasses`, `blockClasses`, `LAYOUT_BOX_DEFAULTS` |
| `lib/persistence.ts` | `saveLayout`, `loadLayout`, `saveStageWidth`, `loadStageWidth`, `debounce` |
| `test/craft-harness.tsx` | `renderInEditor`, `EditorProbe` |

---

### Task 1: Scaffold Next.js and install shadcn

Spec: sections 3, 4.1 (component list), 8 (shadcn CLI drift).

**Files:**
- Create (by CLI): `package.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `lib/utils.ts`, `components/ui/*.tsx`, `.gitignore`
- Create: `.claude/launch.json`

**Interfaces:**
- Produces: `cn()` from `@/lib/utils`; shadcn components `Button`, `Input`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Label`, `ToggleGroup`, `ToggleGroupItem`, `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `Switch`, `Separator`, `Tooltip`, `TooltipTrigger`, `TooltipContent`, `AlertDialog` family, `Breadcrumb` family, `Badge`.

- [ ] **Step 1: Scaffold into the existing repo**

The directory already holds `.git` and `docs/`; both are on create-next-app's allow-list for a non-empty folder.

Run:
```bash
cd /Users/m3dteammember/Documents/shadcn-assembly-workbench && npx --yes create-next-app@latest . --yes --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```
Expected: "Success! Created shadcn-assembly-workbench" (or similar), `package.json` and `app/` exist. If the CLI rejects a flag it no longer knows, drop that flag and rerun. If it prompts anyway, answer: TypeScript yes, ESLint yes, Tailwind yes, `src/` no, App Router yes, Turbopack yes, React Compiler no, import alias `@/*`.

- [ ] **Step 2: Initialize shadcn**

Run:
```bash
npx --yes shadcn@latest init -y -d
```
Expected: `components.json` and `lib/utils.ts` created, `app/globals.css` rewritten with `:root` and `.dark` blocks and an `@theme inline` block. If it asks for a style, choose the default Radix-based one (not a Base UI style); the plan's inspector relies on Radix `data-state` attributes.

- [ ] **Step 3: Add the components**

Run:
```bash
npx --yes shadcn@latest add -y button input card dialog label toggle-group select switch separator tooltip alert-dialog breadcrumb badge
```
Expected: the 13 files under `components/ui/`, plus `radix-ui` (or `@radix-ui/*`) and `lucide-react` in `package.json`.

- [ ] **Step 4: Confirm the variant and size names**

Open `components/ui/button.tsx` and confirm `buttonVariants` has variants `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` and sizes `default`, `sm`, `lg`, `icon`. If any name differs, write the installed names down; Task 9's `buttonSchema` uses the installed names.

- [ ] **Step 5: Add a launch config for the preview tool**

Create `.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 6: Verify the scaffold builds and serves**

Run:
```bash
npx tsc --noEmit && npm run lint
```
Expected: both exit 0 with no output beyond ESLint's summary.

Start the dev server (preview tool, config `dev`) and open `http://localhost:3000`. Expected: the create-next-app placeholder page renders; the server log shows no warnings.

- [ ] **Step 7: Commit**

```bash
git add -A && git status --short
```
Check the list: only scaffold files, `components/ui/`, `.claude/launch.json`, lockfile. No `.env`, nothing from outside the project. Then:
```bash
git commit -m "$(cat <<'EOF'
Scaffold Next.js app with shadcn components

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Vitest and Testing Library

Spec: section 6.

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `test/smoke.test.tsx`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `npm test` (runs `vitest run`), `npm run test:watch`; jsdom environment with `ResizeObserver` and pointer-capture stubs that Radix and the stage need.

- [ ] **Step 1: Install**

```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom vite-tsconfig-paths
```
Expected: exit 0, packages in `devDependencies`.

- [ ] **Step 2: Write the failing smoke test**

Create `test/smoke.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('test harness', () => {
  it('renders a shadcn button with jsdom and the @/ alias', () => {
    render(<Button>Hello</Button>);
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run test/smoke.test.tsx`
Expected: FAIL (no config yet: either "No test files found", a jsdom/document error, or `toBeInTheDocument` is not a function).

- [ ] **Step 4: Add the config, setup and scripts**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    css: false,
  },
});
```

Create `vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const g = globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub };
g.ResizeObserver ??= ResizeObserverStub;

const proto = Element.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};
```

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Run it to see it pass**

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 6: Check lint and types still pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0. If ESLint flags the test file for an unknown global or the setup file for `{}` bodies, add the rule exception to `eslint.config.mjs` scoped to `**/*.test.tsx` and `vitest.setup.ts` rather than disabling the rule globally.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.setup.ts test/smoke.test.tsx package.json package-lock.json eslint.config.mjs
git commit -m "$(cat <<'EOF'
Add Vitest with React Testing Library and jsdom

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SF2 theme on the chrome, basic theme on the artboard, fonts, chrome class constants

Spec: sections 4.1, 4.2 (values), 9.

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Create: `components/workbench/chrome.ts`

**Interfaces:**
- Produces: CSS variables listed below on `:root`; class `theme-basic`; Tailwind color utilities `bg-canvas`, `text-t2`, `text-t4`, `border-line-soft`, `border-line-strong`, `bg-acc`, `text-acc`, `outline-acc`, `text-acc2`, `text-ok`, `text-warn`, `text-bad`, `bg-bad`; shadows `shadow-panel`, `shadow-panel-lg`; the constants exported from `chrome.ts`: `PANEL`, `PANEL_HEADER`, `PANEL_TITLE`, `LABEL`, `CHIP`, `CHIP_INPUT`, `SEG_GROUP`, `SEG_ITEM`, `SECTION`, `SECTION_TITLE`, `EMPTY`, `EMPTY_TITLE`, `DANGER_GHOST`.

- [ ] **Step 1: Rewrite globals.css**

Open `app/globals.css` as the shadcn CLI left it. Keep the first lines (`@import "tailwindcss";`, the `tw-animate-css` import if present, `@custom-variant dark ...`) and the whole `@theme inline { ... }` block. Then:

1. Rename the CLI's `:root { ... }` block to `.theme-basic { ... }` and add `color-scheme: light; --ui-font-sans: var(--font-geist-sans); --ui-font-mono: var(--font-geist-mono);` inside it. This block is the artboard's basic theme.
2. Delete the CLI's `.dark { ... }` block.
3. Insert this new `:root` block above `.theme-basic`:

```css
:root {
  color-scheme: dark;
  --ui-font-sans: var(--font-archivo);
  --ui-font-mono: var(--font-plex-mono);

  --background: #1B1922;
  --foreground: #EAE8F0;
  --card: #23212C;
  --card-foreground: #EAE8F0;
  --popover: #23212C;
  --popover-foreground: #EAE8F0;
  --primary: #5568C4;
  --primary-foreground: #ffffff;
  --secondary: #2A2836;
  --secondary-foreground: #EAE8F0;
  --muted: #2A2836;
  --muted-foreground: #918CA3;
  --accent: #373444;
  --accent-foreground: #EAE8F0;
  --destructive: #E05D5D;
  --border: rgba(255, 255, 255, 0.09);
  --input: rgba(255, 255, 255, 0.09);
  --ring: #8C97DB;
  --radius: 0.625rem;
  --sidebar: #23212C;
  --sidebar-foreground: #EAE8F0;
  --sidebar-primary: #5568C4;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #373444;
  --sidebar-accent-foreground: #EAE8F0;
  --sidebar-border: rgba(255, 255, 255, 0.09);
  --sidebar-ring: #8C97DB;

  --t2: #C6C2D4;
  --t4: #5C5870;
  --line-soft: rgba(255, 255, 255, 0.06);
  --line-strong: rgba(255, 255, 255, 0.14);
  --acc: #8C97DB;
  --acc2: #9BA6EC;
  --grad: linear-gradient(135deg, #8C97DB, #5568C4);
  --ok: #4CAF7D;
  --warn: #E8B34B;
  --bad: #E05D5D;
  --shadow: 0 14px 36px rgba(16, 14, 22, 0.55);
  --shadow-lg: 0 18px 44px rgba(16, 14, 22, 0.55);
  --canvas: #14121B;
  --chip: rgba(255, 255, 255, 0.055);
  --bevel-line: rgba(255, 255, 255, 0.09);
  --bevel-hi: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --bevel-drop: 0 1px 2px rgba(0, 0, 0, 0.35);
}
```

4. Inside the CLI's `@theme inline { ... }` block, replace its `--font-sans` and `--font-mono` lines (if present) and append:

```css
  --font-sans: var(--ui-font-sans);
  --font-mono: var(--ui-font-mono);
  --color-t2: var(--t2);
  --color-t4: var(--t4);
  --color-line-soft: var(--line-soft);
  --color-line-strong: var(--line-strong);
  --color-acc: var(--acc);
  --color-acc2: var(--acc2);
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-bad: var(--bad);
  --color-canvas: var(--canvas);
  --shadow-panel: var(--shadow);
  --shadow-panel-lg: var(--shadow-lg);
```

5. Replace the CLI's `@layer base { ... }` block with:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-size: 14px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  ::placeholder {
    color: var(--t4);
  }
  .theme-basic ::placeholder {
    color: var(--muted-foreground);
  }
}
```

- [ ] **Step 2: Load the fonts**

Replace `app/layout.tsx` with:
```tsx
import type { Metadata } from 'next';
import { Archivo, Geist, Geist_Mono, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
});
const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Assembly Workbench',
  description: 'Drag shadcn components onto a responsive stage.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

Replace `app/page.tsx` with a placeholder that Task 8 replaces:
```tsx
export default function Page() {
  return <main className="p-6 text-sm">Assembly Workbench</main>;
}
```

- [ ] **Step 3: Write the chrome class constants**

Create `components/workbench/chrome.ts`. Every value is the SF2 spec's, expressed as Tailwind utilities:
```ts
// SF2 §7 card + §10.1 bevel, used for the tray, inspector and topbar surfaces.
export const PANEL =
  'bg-card border border-(color:--bevel-line) rounded-xl shadow-[var(--bevel-hi),var(--shadow-lg)]';

// SF2 §10.2 grip header of a vertical panel.
export const PANEL_HEADER =
  'flex items-center gap-2 px-3 pt-[9px] pb-[7px] border-b border-line-soft';

// SF2 §10.2 panel title and §2 mono field label.
export const PANEL_TITLE =
  'font-mono text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground';
export const LABEL =
  'font-mono text-[10.5px] font-semibold uppercase tracking-[.1em] text-muted-foreground';

// SF2 §10.4 icon-prefixed chip. CHIP wraps; CHIP_INPUT is for the shadcn Input or SelectTrigger inside it.
export const CHIP =
  'flex items-center gap-1.5 min-h-[30px] px-2 rounded-lg bg-(--chip) border border-(color:--bevel-line) shadow-[var(--bevel-hi),var(--bevel-drop)] focus-within:border-acc';
export const CHIP_INPUT =
  'h-auto min-w-0 w-full border-0 bg-transparent px-0 py-1.5 font-mono text-[12.5px] font-medium text-foreground shadow-none rounded-none focus-visible:ring-0 focus-visible:border-0 dark:bg-transparent';

// SF2 §10.4 segmented control: recessed track, raised active item.
export const SEG_GROUP =
  'flex w-full gap-0.5 rounded-lg p-0.5 bg-black/25 border border-white/5 shadow-[inset_0_1px_2px_rgba(0,0,0,.4)]';
export const SEG_ITEM =
  'flex-1 h-auto min-w-0 rounded-md border-0 bg-transparent px-2 py-[5px] text-[11.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground data-[state=on]:bg-white/[.13] data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_1px_2px_rgba(0,0,0,.35)]';

// SF2 §10.4 grouped section: hairline runs the full panel width.
export const SECTION = 'border-t border-line-soft -mx-4 px-4 pt-3 mb-3.5';
export const SECTION_TITLE = 'text-[12.5px] font-semibold text-foreground mb-2.5';

// SF2 §4 empty state.
export const EMPTY =
  'border border-dashed border-line-strong rounded-xl px-5 py-11 text-center text-[13.5px] text-muted-foreground';
export const EMPTY_TITLE = 'block text-[15px] font-semibold text-t2 mb-1.5';

// SF2 §5 .btn.danger: red text at rest, 12% wash on hover.
export const DANGER_GHOST = 'text-bad hover:text-bad hover:bg-bad/12';
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exit 0.

- [ ] **Step 5: Verify the theme in the browser**

Start the dev server (preview tool, config `dev`), open `http://localhost:3000`. Then with the preview's JavaScript tool evaluate:
```js
[getComputedStyle(document.body).backgroundColor, getComputedStyle(document.body).fontFamily]
```
Expected: `["rgb(27, 25, 34)", "..."]` where the font family string contains `Archivo`. Check the server log and browser console: no warnings, no failed font requests.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx app/page.tsx components/workbench/chrome.ts
git commit -m "$(cat <<'EOF'
Theme the chrome with the SF2 tokens and scope the basic shadcn theme to the artboard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Responsive values (`lib/responsive.ts`)

Spec: section 4.7.

**Files:**
- Create: `lib/responsive.ts`, `lib/responsive.test.ts`

**Interfaces:**
- Produces:
  - `type Breakpoint = 'mobile' | 'desktop'`
  - `type Responsive<T> = { mobile: T; desktop?: T }`
  - `BREAKPOINTS: readonly Breakpoint[]`, `BREAKPOINT_MD = 768`
  - `breakpointForWidth(width: number): Breakpoint`
  - `isResponsive<T>(value: unknown): value is Responsive<T>`
  - `resolve<T>(value: Responsive<T> | T, breakpoint: Breakpoint): T`
  - `otherBreakpoint(b: Breakpoint): Breakpoint`

- [ ] **Step 1: Write the failing tests**

Create `lib/responsive.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BREAKPOINT_MD,
  breakpointForWidth,
  isResponsive,
  otherBreakpoint,
  resolve,
} from './responsive';

describe('breakpointForWidth', () => {
  it('is mobile below 768 and desktop from 768 up', () => {
    expect(BREAKPOINT_MD).toBe(768);
    expect(breakpointForWidth(320)).toBe('mobile');
    expect(breakpointForWidth(375)).toBe('mobile');
    expect(breakpointForWidth(767)).toBe('mobile');
    expect(breakpointForWidth(768)).toBe('desktop');
    expect(breakpointForWidth(1440)).toBe('desktop');
  });
});

describe('resolve', () => {
  it('returns the value for the requested breakpoint', () => {
    const v = { mobile: 'column', desktop: 'row' };
    expect(resolve(v, 'mobile')).toBe('column');
    expect(resolve(v, 'desktop')).toBe('row');
  });

  it('falls back to mobile when desktop is missing', () => {
    expect(resolve({ mobile: 2 }, 'desktop')).toBe(2);
  });

  it('passes plain values through', () => {
    expect(resolve('row', 'mobile')).toBe('row');
    expect(resolve(4, 'desktop')).toBe(4);
    expect(resolve(true, 'desktop')).toBe(true);
  });
});

describe('isResponsive', () => {
  it('detects only the { mobile } shape', () => {
    expect(isResponsive({ mobile: 1 })).toBe(true);
    expect(isResponsive({ mobile: 1, desktop: 2 })).toBe(true);
    expect(isResponsive(1)).toBe(false);
    expect(isResponsive('row')).toBe(false);
    expect(isResponsive(null)).toBe(false);
    expect(isResponsive({ desktop: 1 })).toBe(false);
  });
});

describe('otherBreakpoint', () => {
  it('flips between the two', () => {
    expect(otherBreakpoint('mobile')).toBe('desktop');
    expect(otherBreakpoint('desktop')).toBe('mobile');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/responsive.test.ts`
Expected: FAIL, "Failed to resolve import './responsive'".

- [ ] **Step 3: Implement**

Create `lib/responsive.ts`:
```ts
export type Breakpoint = 'mobile' | 'desktop';

export type Responsive<T> = { mobile: T; desktop?: T };

export const BREAKPOINTS: readonly Breakpoint[] = ['mobile', 'desktop'];

export const BREAKPOINT_MD = 768;

export function breakpointForWidth(width: number): Breakpoint {
  return width < BREAKPOINT_MD ? 'mobile' : 'desktop';
}

export function isResponsive<T>(value: unknown): value is Responsive<T> {
  return typeof value === 'object' && value !== null && 'mobile' in value;
}

export function resolve<T>(value: Responsive<T> | T, breakpoint: Breakpoint): T {
  if (isResponsive<T>(value)) {
    return value[breakpoint] ?? value.mobile;
  }
  return value;
}

export function otherBreakpoint(breakpoint: Breakpoint): Breakpoint {
  return breakpoint === 'mobile' ? 'desktop' : 'mobile';
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run lib/responsive.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/responsive.ts lib/responsive.test.ts
git commit -m "$(cat <<'EOF'
Add responsive value type and breakpoint resolution

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Stage math (`lib/stage.ts`)

Spec: section 4.3 (presets, clamp, zoom).

**Files:**
- Create: `lib/stage.ts`, `lib/stage.test.ts`

**Interfaces:**
- Produces:
  - `STAGE_PRESETS = { mobile: 375, tablet: 768, desktop: 1440 } as const`, `type StagePreset = 'mobile' | 'tablet' | 'desktop'`, `STAGE_PRESET_ORDER: readonly StagePreset[]`
  - `MIN_STAGE_WIDTH = 320`, `MAX_STAGE_WIDTH = 1920`, `STAGE_PADDING = 24`, `ARTBOARD_MIN_HEIGHT = 640`
  - `clampWidth(width: number): number`
  - `presetForWidth(width: number): StagePreset | null`
  - `computeZoom(available: number, width: number): number`

- [ ] **Step 1: Write the failing tests**

Create `lib/stage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_STAGE_WIDTH,
  MIN_STAGE_WIDTH,
  STAGE_PRESETS,
  clampWidth,
  computeZoom,
  presetForWidth,
} from './stage';

describe('presets', () => {
  it('are the PRD widths', () => {
    expect(STAGE_PRESETS).toEqual({ mobile: 375, tablet: 768, desktop: 1440 });
  });
});

describe('clampWidth', () => {
  it('keeps widths inside 320 to 1920 and rounds', () => {
    expect(MIN_STAGE_WIDTH).toBe(320);
    expect(MAX_STAGE_WIDTH).toBe(1920);
    expect(clampWidth(100)).toBe(320);
    expect(clampWidth(5000)).toBe(1920);
    expect(clampWidth(700.4)).toBe(700);
    expect(clampWidth(700.6)).toBe(701);
    expect(clampWidth(Number.NaN)).toBe(320);
  });
});

describe('presetForWidth', () => {
  it('matches exact preset widths only', () => {
    expect(presetForWidth(375)).toBe('mobile');
    expect(presetForWidth(768)).toBe('tablet');
    expect(presetForWidth(1440)).toBe('desktop');
    expect(presetForWidth(1439)).toBeNull();
    expect(presetForWidth(900)).toBeNull();
  });
});

describe('computeZoom', () => {
  it('is 1 when the artboard fits', () => {
    expect(computeZoom(1000, 375)).toBe(1);
    expect(computeZoom(1440, 1440)).toBe(1);
  });

  it('scales down to fit, never below 0.1', () => {
    expect(computeZoom(720, 1440)).toBe(0.5);
    expect(computeZoom(10, 1920)).toBe(0.1);
  });

  it('is 1 when measurements are not usable yet', () => {
    expect(computeZoom(0, 1440)).toBe(1);
    expect(computeZoom(500, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/stage.test.ts`
Expected: FAIL, "Failed to resolve import './stage'".

- [ ] **Step 3: Implement**

Create `lib/stage.ts`:
```ts
export const STAGE_PRESETS = { mobile: 375, tablet: 768, desktop: 1440 } as const;

export type StagePreset = keyof typeof STAGE_PRESETS;

export const STAGE_PRESET_ORDER: readonly StagePreset[] = ['mobile', 'tablet', 'desktop'];

export const MIN_STAGE_WIDTH = 320;
export const MAX_STAGE_WIDTH = 1920;
export const STAGE_PADDING = 24;
export const ARTBOARD_MIN_HEIGHT = 640;

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_STAGE_WIDTH;
  return Math.min(MAX_STAGE_WIDTH, Math.max(MIN_STAGE_WIDTH, Math.round(width)));
}

export function presetForWidth(width: number): StagePreset | null {
  for (const preset of STAGE_PRESET_ORDER) {
    if (STAGE_PRESETS[preset] === width) return preset;
  }
  return null;
}

export function computeZoom(available: number, width: number): number {
  if (available <= 0 || width <= 0) return 1;
  if (available >= width) return 1;
  return Math.max(0.1, available / width);
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run lib/stage.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/stage.ts lib/stage.test.ts
git commit -m "$(cat <<'EOF'
Add stage presets, width clamping and zoom-to-fit math

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Layout class tables (`lib/classes.ts`)

Spec: sections 4.5 (LayoutBox props), 4.7 (literal class tables), 8 (Tailwind 4 class detection).

**Files:**
- Create: `lib/classes.ts`, `lib/classes.test.ts`

**Interfaces:**
- Consumes: `Breakpoint`, `Responsive`, `resolve` from `lib/responsive.ts`.
- Produces:
  - Types `LayoutMode`, `Direction`, `Columns`, `Align`, `Justify`, `Gap`, `Padding`, `Background`, `LayoutBoxProps`, `GrowProps`
  - Tables `DIRECTION_CLASSES`, `COLUMNS_CLASSES`, `ALIGN_CLASSES`, `JUSTIFY_CLASSES`, `GAP_CLASSES`, `PADDING_CLASSES`, `BACKGROUND_CLASSES`, `CLASS_TABLES`
  - Option lists `GAP_OPTIONS`, `PADDING_OPTIONS`, `COLUMN_OPTIONS`
  - `LAYOUT_BOX_DEFAULTS: LayoutBoxProps`, `ROOT_LAYOUT_PROPS: LayoutBoxProps`
  - `layoutBoxClasses(props: LayoutBoxProps, breakpoint: Breakpoint): string`
  - `blockClasses(props: GrowProps): string`

- [ ] **Step 1: Write the failing tests**

Create `lib/classes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_CLASSES,
  CLASS_TABLES,
  COLUMN_OPTIONS,
  GAP_CLASSES,
  GAP_OPTIONS,
  LAYOUT_BOX_DEFAULTS,
  PADDING_CLASSES,
  PADDING_OPTIONS,
  ROOT_LAYOUT_PROPS,
  blockClasses,
  layoutBoxClasses,
} from './classes';

describe('layoutBoxClasses', () => {
  it('renders the default box as a column on mobile and a row on desktop', () => {
    expect(layoutBoxClasses(LAYOUT_BOX_DEFAULTS, 'mobile')).toBe(
      'w-full min-w-0 flex flex-col justify-start items-stretch gap-4 p-4',
    );
    expect(layoutBoxClasses(LAYOUT_BOX_DEFAULTS, 'desktop')).toBe(
      'w-full min-w-0 flex flex-row justify-start items-stretch gap-4 p-4',
    );
  });

  it('renders grid mode with the resolved column count', () => {
    const grid = { ...LAYOUT_BOX_DEFAULTS, mode: 'grid' as const };
    expect(layoutBoxClasses(grid, 'mobile')).toBe(
      'w-full min-w-0 grid grid-cols-1 items-stretch gap-4 p-4',
    );
    expect(layoutBoxClasses(grid, 'desktop')).toBe(
      'w-full min-w-0 grid grid-cols-3 items-stretch gap-4 p-4',
    );
    for (const columns of COLUMN_OPTIONS) {
      const out = layoutBoxClasses(
        { ...grid, columns: { mobile: columns } },
        'mobile',
      );
      expect(out).toContain(`grid-cols-${columns}`);
    }
  });

  it('applies align, justify, gap, padding and background', () => {
    const props = {
      ...LAYOUT_BOX_DEFAULTS,
      align: { mobile: 'center' as const, desktop: 'end' as const },
      justify: { mobile: 'between' as const, desktop: 'center' as const },
      gap: 8 as const,
      padding: 0 as const,
      background: 'card' as const,
    };
    expect(layoutBoxClasses(props, 'mobile')).toBe(
      'w-full min-w-0 flex flex-col justify-between items-center gap-8 p-0 bg-card border rounded-lg',
    );
    expect(layoutBoxClasses(props, 'desktop')).toBe(
      'w-full min-w-0 flex flex-row justify-center items-end gap-8 p-0 bg-card border rounded-lg',
    );
    expect(layoutBoxClasses({ ...props, background: 'muted' }, 'mobile')).toContain(
      'bg-muted rounded-lg',
    );
  });

  it('has a class for every gap and padding option', () => {
    for (const gap of GAP_OPTIONS) expect(GAP_CLASSES[gap]).toBe(`gap-${gap}`);
    for (const padding of PADDING_OPTIONS) expect(PADDING_CLASSES[padding]).toBe(`p-${padding}`);
    expect(BACKGROUND_CLASSES.none).toBe('');
  });

  it('keeps the root as a column at both breakpoints with padding 6', () => {
    expect(layoutBoxClasses(ROOT_LAYOUT_PROPS, 'desktop')).toBe(
      'w-full min-w-0 flex flex-col justify-start items-stretch gap-4 p-6',
    );
  });
});

describe('blockClasses', () => {
  it('adds flex-1 min-w-0 only when grow is on', () => {
    expect(blockClasses({ grow: true })).toBe('flex-1 min-w-0');
    expect(blockClasses({ grow: false })).toBe('');
    expect(blockClasses({})).toBe('');
  });
});

describe('class tables', () => {
  it('contain only literal strings, so Tailwind can see every class', () => {
    for (const table of Object.values(CLASS_TABLES)) {
      for (const value of Object.values(table)) {
        expect(typeof value).toBe('string');
        expect(value).not.toContain('$');
      }
    }
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/classes.test.ts`
Expected: FAIL, "Failed to resolve import './classes'".

- [ ] **Step 3: Implement**

Create `lib/classes.ts`:
```ts
import { type Breakpoint, type Responsive, resolve } from './responsive';

export type LayoutMode = 'flex' | 'grid';
export type Direction = 'row' | 'column';
export type Columns = 1 | 2 | 3 | 4;
export type Align = 'start' | 'center' | 'end' | 'stretch';
export type Justify = 'start' | 'center' | 'end' | 'between';
export type Gap = 0 | 1 | 2 | 3 | 4 | 6 | 8;
export type Padding = 0 | 2 | 4 | 6 | 8;
export type Background = 'none' | 'muted' | 'card';

export interface GrowProps {
  grow?: boolean;
}

export interface LayoutBoxProps extends GrowProps {
  mode: LayoutMode;
  direction: Responsive<Direction>;
  columns: Responsive<Columns>;
  align: Responsive<Align>;
  justify: Responsive<Justify>;
  gap: Gap;
  padding: Padding;
  background: Background;
}

export const DIRECTION_CLASSES: Record<Direction, string> = {
  row: 'flex-row',
  column: 'flex-col',
};

export const COLUMNS_CLASSES: Record<Columns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

export const ALIGN_CLASSES: Record<Align, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

export const JUSTIFY_CLASSES: Record<Justify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
};

export const GAP_CLASSES: Record<Gap, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
};

export const PADDING_CLASSES: Record<Padding, string> = {
  0: 'p-0',
  2: 'p-2',
  4: 'p-4',
  6: 'p-6',
  8: 'p-8',
};

export const BACKGROUND_CLASSES: Record<Background, string> = {
  none: '',
  muted: 'bg-muted rounded-lg',
  card: 'bg-card border rounded-lg',
};

export const CLASS_TABLES = {
  DIRECTION_CLASSES,
  COLUMNS_CLASSES,
  ALIGN_CLASSES,
  JUSTIFY_CLASSES,
  GAP_CLASSES,
  PADDING_CLASSES,
  BACKGROUND_CLASSES,
} as const;

export const GAP_OPTIONS: readonly Gap[] = [0, 1, 2, 3, 4, 6, 8];
export const PADDING_OPTIONS: readonly Padding[] = [0, 2, 4, 6, 8];
export const COLUMN_OPTIONS: readonly Columns[] = [1, 2, 3, 4];

export const LAYOUT_BOX_DEFAULTS: LayoutBoxProps = {
  mode: 'flex',
  direction: { mobile: 'column', desktop: 'row' },
  columns: { mobile: 1, desktop: 3 },
  align: { mobile: 'stretch', desktop: 'stretch' },
  justify: { mobile: 'start', desktop: 'start' },
  gap: 4,
  padding: 4,
  background: 'none',
  grow: false,
};

export const ROOT_LAYOUT_PROPS: LayoutBoxProps = {
  ...LAYOUT_BOX_DEFAULTS,
  direction: { mobile: 'column', desktop: 'column' },
  padding: 6,
};

export function layoutBoxClasses(props: LayoutBoxProps, breakpoint: Breakpoint): string {
  const parts: string[] = ['w-full', 'min-w-0'];
  if (props.mode === 'grid') {
    parts.push('grid', COLUMNS_CLASSES[resolve(props.columns, breakpoint)]);
  } else {
    parts.push(
      'flex',
      DIRECTION_CLASSES[resolve(props.direction, breakpoint)],
      JUSTIFY_CLASSES[resolve(props.justify, breakpoint)],
    );
  }
  parts.push(
    ALIGN_CLASSES[resolve(props.align, breakpoint)],
    GAP_CLASSES[props.gap],
    PADDING_CLASSES[props.padding],
  );
  const background = BACKGROUND_CLASSES[props.background];
  if (background) parts.push(background);
  return parts.join(' ');
}

export function blockClasses(props: GrowProps): string {
  return props.grow ? 'flex-1 min-w-0' : '';
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run lib/classes.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/classes.ts lib/classes.test.ts
git commit -m "$(cat <<'EOF'
Add literal Tailwind class tables for layout boxes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Stage context (`components/workbench/stage-context.tsx`)

Spec: section 4.3 (breakpoint derivation, presets).

**Files:**
- Create: `components/workbench/stage-context.tsx`, `components/workbench/stage-context.test.tsx`

**Interfaces:**
- Consumes: `breakpointForWidth`, `Breakpoint` (Task 4); `STAGE_PRESETS`, `StagePreset`, `clampWidth`, `presetForWidth` (Task 5).
- Produces:
  - `StageProvider({ initialWidth?, onWidthChange?, children })`
  - `useStage(): { width: number; breakpoint: Breakpoint; preset: StagePreset | null; zoom: number; setWidth(w: number): void; setPreset(p: StagePreset): void; setZoom(z: number): void }`

- [ ] **Step 1: Write the failing tests**

Create `components/workbench/stage-context.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageProvider, useStage } from './stage-context';

function Probe() {
  const stage = useStage();
  return (
    <div>
      <output data-testid="width">{stage.width}</output>
      <output data-testid="breakpoint">{stage.breakpoint}</output>
      <output data-testid="preset">{stage.preset ?? 'none'}</output>
      <output data-testid="zoom">{stage.zoom}</output>
      <button onClick={() => stage.setWidth(700)}>seven hundred</button>
      <button onClick={() => stage.setWidth(50)}>too small</button>
      <button onClick={() => stage.setPreset('mobile')}>mobile</button>
      <button onClick={() => stage.setZoom(0.5)}>half</button>
    </div>
  );
}

describe('StageProvider', () => {
  it('starts at the desktop preset and derives breakpoint and preset', () => {
    render(
      <StageProvider>
        <Probe />
      </StageProvider>,
    );
    expect(screen.getByTestId('width')).toHaveTextContent('1440');
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('desktop');
    expect(screen.getByTestId('preset')).toHaveTextContent('desktop');
    expect(screen.getByTestId('zoom')).toHaveTextContent('1');
  });

  it('updates width, clamps it, and reports the change', async () => {
    const onWidthChange = vi.fn();
    render(
      <StageProvider initialWidth={375} onWidthChange={onWidthChange}>
        <Probe />
      </StageProvider>,
    );
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('mobile');
    expect(screen.getByTestId('preset')).toHaveTextContent('mobile');

    await userEvent.click(screen.getByText('seven hundred'));
    expect(screen.getByTestId('width')).toHaveTextContent('700');
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('mobile');
    expect(screen.getByTestId('preset')).toHaveTextContent('none');
    expect(onWidthChange).toHaveBeenLastCalledWith(700);

    await userEvent.click(screen.getByText('too small'));
    expect(screen.getByTestId('width')).toHaveTextContent('320');
    expect(onWidthChange).toHaveBeenLastCalledWith(320);

    await userEvent.click(screen.getByText('mobile'));
    expect(screen.getByTestId('width')).toHaveTextContent('375');

    await userEvent.click(screen.getByText('half'));
    expect(screen.getByTestId('zoom')).toHaveTextContent('0.5');
  });

  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useStage must be used inside StageProvider');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/workbench/stage-context.test.tsx`
Expected: FAIL, "Failed to resolve import './stage-context'".

- [ ] **Step 3: Implement**

Create `components/workbench/stage-context.tsx`:
```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type Breakpoint, breakpointForWidth } from '@/lib/responsive';
import { STAGE_PRESETS, type StagePreset, clampWidth, presetForWidth } from '@/lib/stage';

export interface StageContextValue {
  width: number;
  breakpoint: Breakpoint;
  preset: StagePreset | null;
  zoom: number;
  setWidth: (width: number) => void;
  setPreset: (preset: StagePreset) => void;
  setZoom: (zoom: number) => void;
}

const StageContext = createContext<StageContextValue | null>(null);

export function StageProvider({
  initialWidth = STAGE_PRESETS.desktop,
  onWidthChange,
  children,
}: {
  initialWidth?: number;
  onWidthChange?: (width: number) => void;
  children: ReactNode;
}) {
  const [width, setWidthState] = useState(() => clampWidth(initialWidth));
  const [zoom, setZoom] = useState(1);

  const setWidth = useCallback(
    (next: number) => {
      const clamped = clampWidth(next);
      setWidthState(clamped);
      onWidthChange?.(clamped);
    },
    [onWidthChange],
  );

  const setPreset = useCallback(
    (preset: StagePreset) => setWidth(STAGE_PRESETS[preset]),
    [setWidth],
  );

  const value = useMemo<StageContextValue>(
    () => ({
      width,
      breakpoint: breakpointForWidth(width),
      preset: presetForWidth(width),
      zoom,
      setWidth,
      setPreset,
      setZoom,
    }),
    [width, zoom, setWidth, setPreset],
  );

  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStage(): StageContextValue {
  const context = useContext(StageContext);
  if (!context) throw new Error('useStage must be used inside StageProvider');
  return context;
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run components/workbench/stage-context.test.tsx`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add components/workbench/stage-context.tsx components/workbench/stage-context.test.tsx
git commit -m "$(cat <<'EOF'
Add stage context with width, derived breakpoint and presets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Craft.js, the LayoutBox block, registry skeleton and test harness

Spec: sections 4.3 (empty states), 4.5 (LayoutBox), 4.6 (root rules), 4.11 (serialized shape).

**Files:**
- Create: `components/blocks/schema.ts`, `components/blocks/drop-zone.tsx`, `components/blocks/layout-box.tsx`, `components/blocks/registry.tsx`, `test/craft-harness.tsx`, `components/blocks/layout-box.test.tsx`, `components/blocks/registry.test.tsx`
- Modify: `package.json` (dependency)

**Interfaces:**
- Consumes: `useStage` (Task 7); `layoutBoxClasses`, `blockClasses`, `LAYOUT_BOX_DEFAULTS`, `ROOT_LAYOUT_PROPS`, option lists (Task 6); `ARTBOARD_MIN_HEIGHT` (Task 5).
- Produces:
  - `schema.ts`: `BlockType`, `ZoneType`, `FieldKind`, `SectionName`, `FieldOption`, `FieldSchema`, `BlockSchema`, `GROW_FIELD: FieldSchema`
  - `drop-zone.tsx`: `DropZone()`, `StageEmptyState()`
  - `layout-box.tsx`: `LayoutBox` (Craft `UserComponent`, resolver key `LayoutBox`), `layoutBoxSchema: BlockSchema`
  - `registry.tsx`: `resolver`, `KNOWN_TYPES: ReadonlySet<string>`, `ZONE_TYPES: ReadonlySet<string>`, `TrayItem`, `trayItems: TrayItem[]`, `schemaFor(type: string): BlockSchema | null`, `emptyLayoutJson(): string`
  - `test/craft-harness.tsx`: `renderInEditor(ui, { width? })`, `renderTree(rootElement, { width?, data? })`, both returning RTL's result plus `editor(): { actions, query }`
- Every block root element carries `data-block="<Type>"`; tests select on it.

- [ ] **Step 1: Install Craft.js**

```bash
npm i @craftjs/core
```
Expected: `@craftjs/core` `^0.2.x` in `dependencies`.

- [ ] **Step 2: Write the schema types and the placeholders (no tests of their own; they are exercised by the block tests)**

Create `components/blocks/schema.ts`:
```ts
export type BlockType = 'LayoutBox' | 'Button' | 'Input' | 'Card' | 'Dialog';

export type ZoneType = 'CardContent' | 'DialogContent';

export type FieldKind = 'select' | 'text' | 'boolean';

export type SectionName = 'Layout' | 'Content' | 'Style' | 'Editor';

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface FieldSchema {
  prop: string;
  label: string;
  kind: FieldKind;
  section: SectionName;
  options?: readonly FieldOption[];
  responsive?: boolean;
  editorOnly?: boolean;
  showWhen?: (props: Record<string, unknown>) => boolean;
}

export interface BlockSchema {
  type: BlockType;
  fields: readonly FieldSchema[];
}

export const GROW_FIELD: FieldSchema = {
  prop: 'grow',
  label: 'Grow to fill',
  kind: 'boolean',
  section: 'Layout',
};
```

Create `components/blocks/drop-zone.tsx`:
```tsx
export function DropZone() {
  return (
    <div className="flex min-h-20 w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
      Drop here
    </div>
  );
}

export function StageEmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">Nothing on the stage yet</p>
      <p className="text-sm text-muted-foreground">
        Drag a component from the Components panel on the left and drop it here.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Write the test harness**

Create `test/craft-harness.tsx`:
```tsx
import { Editor, Frame, useEditor } from '@craftjs/core';
import { render } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { resolver } from '@/components/blocks/registry';
import { StageProvider } from '@/components/workbench/stage-context';

type EditorHandle = Pick<ReturnType<typeof useEditor>, 'actions' | 'query'>;

function EditorProbe({ onRender }: { onRender: (handle: EditorHandle) => void }) {
  const { actions, query } = useEditor();
  useEffect(() => {
    onRender({ actions, query });
  });
  return null;
}

export function renderInEditor(ui: ReactElement, { width = 1440 }: { width?: number } = {}) {
  let latest: EditorHandle | null = null;
  const result = render(
    <Editor resolver={resolver} enabled>
      <StageProvider initialWidth={width}>
        <EditorProbe onRender={(handle) => (latest = handle)} />
        {ui}
      </StageProvider>
    </Editor>,
  );
  const editor = (): EditorHandle => {
    if (!latest) throw new Error('editor not mounted');
    return latest;
  };
  return { ...result, editor };
}

export function renderTree(
  rootElement: ReactElement,
  { width = 1440, data }: { width?: number; data?: string } = {},
) {
  return renderInEditor(<Frame data={data}>{rootElement}</Frame>, { width });
}
```

- [ ] **Step 4: Write the failing block and registry tests**

Create `components/blocks/layout-box.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { renderTree } from '@/test/craft-harness';
import { LayoutBox } from './layout-box';

async function findBoxes(container: HTMLElement, count: number) {
  return waitFor(() => {
    const boxes = Array.from(container.querySelectorAll<HTMLElement>('[data-block="LayoutBox"]'));
    expect(boxes).toHaveLength(count);
    return boxes;
  });
}

describe('LayoutBox', () => {
  it('shows the stage empty state when the root has no children', async () => {
    renderTree(<Element is={LayoutBox} canvas />);
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
    expect(
      screen.getByText('Drag a component from the Components panel on the left and drop it here.'),
    ).toBeInTheDocument();
  });

  it('shows the drop placeholder in an empty nested box', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
    );
    expect(await screen.findByText('Drop here')).toBeInTheDocument();
    expect(screen.queryByText('Nothing on the stage yet')).not.toBeInTheDocument();
  });

  it('resolves direction from the stage width', async () => {
    const mobile = renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
      { width: 375 },
    );
    const [root, inner] = await findBoxes(mobile.container, 2);
    expect(root).toHaveClass('flex-col', 'p-6');
    expect(inner).toHaveClass('flex-col', 'gap-4', 'p-4');
    mobile.unmount();

    const desktop = renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas />
      </Element>,
      { width: 1440 },
    );
    const [, innerDesktop] = await findBoxes(desktop.container, 2);
    expect(innerDesktop).toHaveClass('flex-row');
  });

  it('applies grow to nested boxes only', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Element is={LayoutBox} canvas grow />
      </Element>,
    );
    const [root, inner] = await findBoxes(container, 2);
    expect(inner).toHaveClass('flex-1');
    expect(root).not.toHaveClass('flex-1');
  });
});
```

Create `components/blocks/registry.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { emptyLayoutJson, schemaFor } from './registry';

describe('emptyLayoutJson', () => {
  it('is a single root LayoutBox with the root defaults', () => {
    const tree = JSON.parse(emptyLayoutJson());
    expect(Object.keys(tree)).toEqual(['ROOT']);
    expect(tree.ROOT.type).toEqual({ resolvedName: 'LayoutBox' });
    expect(tree.ROOT.isCanvas).toBe(true);
    expect(tree.ROOT.nodes).toEqual([]);
    expect(tree.ROOT.parent).toBeNull();
    expect(tree.ROOT.props).toEqual(ROOT_LAYOUT_PROPS);
  });
});

describe('schemaFor', () => {
  it('returns the LayoutBox schema and null for unknown types', () => {
    expect(schemaFor('LayoutBox')?.type).toBe('LayoutBox');
    expect(schemaFor('Nope')).toBeNull();
  });
});
```

- [ ] **Step 5: Run to see them fail**

Run: `npx vitest run components/blocks`
Expected: FAIL, unresolved imports for `./layout-box` and `./registry`.

- [ ] **Step 6: Implement the LayoutBox block**

Create `components/blocks/layout-box.tsx`:
```tsx
import { ROOT_NODE, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode } from 'react';
import {
  COLUMN_OPTIONS,
  GAP_OPTIONS,
  LAYOUT_BOX_DEFAULTS,
  PADDING_OPTIONS,
  type LayoutBoxProps,
  blockClasses,
  layoutBoxClasses,
} from '@/lib/classes';
import { ARTBOARD_MIN_HEIGHT } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { useStage } from '@/components/workbench/stage-context';
import { DropZone, StageEmptyState } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export type LayoutBoxBlockProps = Partial<LayoutBoxProps> & { children?: ReactNode };

export const LayoutBox: UserComponent<LayoutBoxBlockProps> = ({ children, ...props }) => {
  const merged: LayoutBoxProps = { ...LAYOUT_BOX_DEFAULTS, ...props };
  const { breakpoint } = useStage();
  const {
    connectors: { connect, drag },
    id,
    childCount,
  } = useNode((node) => ({ childCount: node.data.nodes.length }));
  const isRoot = id === ROOT_NODE;

  return (
    <div
      ref={(element) => {
        if (!element) return;
        if (isRoot) connect(element);
        else connect(drag(element));
      }}
      data-block="LayoutBox"
      className={cn(layoutBoxClasses(merged, breakpoint), !isRoot && blockClasses(merged))}
      style={isRoot ? { minHeight: ARTBOARD_MIN_HEIGHT } : undefined}
    >
      {childCount === 0 ? (isRoot ? <StageEmptyState /> : <DropZone />) : children}
    </div>
  );
};

LayoutBox.craft = {
  displayName: 'LayoutBox',
  props: LAYOUT_BOX_DEFAULTS,
  rules: {
    canDrag: (node) => node.id !== ROOT_NODE,
  },
};

const isFlex = (props: Record<string, unknown>) => props.mode !== 'grid';
const isGrid = (props: Record<string, unknown>) => props.mode === 'grid';

export const layoutBoxSchema: BlockSchema = {
  type: 'LayoutBox',
  fields: [
    {
      prop: 'mode',
      label: 'Mode',
      kind: 'select',
      section: 'Layout',
      options: [
        { value: 'flex', label: 'Flex' },
        { value: 'grid', label: 'Grid' },
      ],
    },
    {
      prop: 'direction',
      label: 'Direction',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      showWhen: isFlex,
      options: [
        { value: 'row', label: 'Row' },
        { value: 'column', label: 'Column' },
      ],
    },
    {
      prop: 'columns',
      label: 'Columns',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      showWhen: isGrid,
      options: COLUMN_OPTIONS.map((value) => ({ value, label: String(value) })),
    },
    {
      prop: 'align',
      label: 'Align',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' },
        { value: 'stretch', label: 'Stretch' },
      ],
    },
    {
      prop: 'justify',
      label: 'Justify',
      kind: 'select',
      section: 'Layout',
      responsive: true,
      showWhen: isFlex,
      options: [
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' },
        { value: 'between', label: 'Between' },
      ],
    },
    {
      prop: 'gap',
      label: 'Gap',
      kind: 'select',
      section: 'Layout',
      options: GAP_OPTIONS.map((value) => ({ value, label: String(value) })),
    },
    {
      prop: 'padding',
      label: 'Padding',
      kind: 'select',
      section: 'Layout',
      options: PADDING_OPTIONS.map((value) => ({ value, label: String(value) })),
    },
    {
      prop: 'background',
      label: 'Background',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'none', label: 'None' },
        { value: 'muted', label: 'Muted' },
        { value: 'card', label: 'Card' },
      ],
    },
    GROW_FIELD,
  ],
};
```

- [ ] **Step 7: Implement the registry (LayoutBox only for now; Tasks 12 and 13 add the rest)**

Create `components/blocks/registry.tsx`:
```tsx
import { Element } from '@craftjs/core';
import { LayoutGrid, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { LayoutBox, layoutBoxSchema } from './layout-box';
import type { BlockSchema, BlockType } from './schema';

export const resolver = { LayoutBox };

export const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.keys(resolver));

export const ZONE_TYPES: ReadonlySet<string> = new Set(['CardContent', 'DialogContent']);

export interface TrayItem {
  type: BlockType;
  label: string;
  hint: string;
  icon: LucideIcon;
  create: () => ReactElement;
}

export const trayItems: TrayItem[] = [
  {
    type: 'LayoutBox',
    label: 'Layout box',
    hint: 'Flex or grid container',
    icon: LayoutGrid,
    create: () => <Element is={LayoutBox} canvas />,
  },
];

const schemas: Partial<Record<string, BlockSchema>> = {
  LayoutBox: layoutBoxSchema,
};

export function schemaFor(type: string): BlockSchema | null {
  return schemas[type] ?? null;
}

export function emptyLayoutJson(): string {
  return JSON.stringify({
    ROOT: {
      type: { resolvedName: 'LayoutBox' },
      isCanvas: true,
      props: ROOT_LAYOUT_PROPS,
      displayName: 'LayoutBox',
      custom: {},
      hidden: false,
      nodes: [],
      linkedNodes: {},
      parent: null,
    },
  });
}
```

- [ ] **Step 8: Run to see them pass**

Run: `npx vitest run components/blocks`
Expected: `6 passed`. If `findBoxes` times out, Craft mounted the tree but the collector did not update; check that `useNode`'s collector reads `node.data.nodes.length` (not `node.data.nodes` itself).

- [ ] **Step 9: Types, lint, commit**

Run: `npx tsc --noEmit && npm run lint` and expect exit 0. Then:
```bash
git add package.json package-lock.json components/blocks test/craft-harness.tsx
git commit -m "$(cat <<'EOF'
Add Craft.js with the LayoutBox block, block schema types and a test harness

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Workbench shell, stage and tray, then the Craft.js spike in the browser

Spec: sections 4.2 (grid), 4.3 (artboard), 4.4 (deselect outside the artboard), 8 (the spike).

**Files:**
- Create: `components/workbench/workbench-loader.tsx`, `components/workbench/workbench.tsx`, `components/workbench/stage.tsx`, `components/workbench/component-tray.tsx`, `components/workbench/stage.test.tsx`, `components/workbench/component-tray.test.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `resolver`, `trayItems`, `emptyLayoutJson` (Task 8); `useStage`, `StageProvider` (Task 7); `PANEL`, `PANEL_HEADER`, `PANEL_TITLE` (Task 3); `STAGE_PADDING`, `ARTBOARD_MIN_HEIGHT` (Task 5).
- Produces: `Workbench()`, `WorkbenchLoader()`, `Stage({ data: string })`, `ComponentTray()`. The artboard element carries `data-artboard`; the stage column carries `data-testid="stage-column"`; tray items carry `data-tray-item="<Type>"`.

- [ ] **Step 1: Write the failing tests**

Create `components/workbench/stage.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { Stage } from './stage';

describe('Stage', () => {
  it('renders the artboard at the stage width in the basic theme', async () => {
    renderInEditor(<Stage data={emptyLayoutJson()} />, { width: 768 });
    const artboard = await screen.findByTestId('artboard');
    expect(artboard).toHaveClass('theme-basic');
    expect(artboard).toHaveStyle({ width: '768px', minHeight: '640px' });
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
  });

  it('deselects when the canvas outside the artboard is pressed', async () => {
    const { editor } = renderInEditor(<Stage data={emptyLayoutJson()} />);
    await screen.findByText('Nothing on the stage yet');
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('stage-column'));
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(false));
  });

  it('keeps the selection when the artboard itself is pressed', async () => {
    const { editor } = renderInEditor(<Stage data={emptyLayoutJson()} />);
    await screen.findByText('Nothing on the stage yet');
    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));

    fireEvent.pointerDown(screen.getByTestId('artboard'));
    expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true);
  });
});
```

Create `components/workbench/component-tray.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { trayItems } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { ComponentTray } from './component-tray';

describe('ComponentTray', () => {
  it('lists every tray item with its label and hint', () => {
    renderInEditor(<ComponentTray />);
    expect(screen.getByText('Components')).toBeInTheDocument();
    for (const item of trayItems) {
      const row = screen.getByText(item.label).closest('[data-tray-item]');
      expect(row).toHaveAttribute('data-tray-item', item.type);
      expect(row).toHaveTextContent(item.hint);
    }
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/workbench/stage.test.tsx components/workbench/component-tray.test.tsx`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement the stage (no grip or zoom yet; Task 11 adds them)**

Create `components/workbench/stage.tsx`:
```tsx
'use client';

import { Frame, useEditor } from '@craftjs/core';
import { ARTBOARD_MIN_HEIGHT, STAGE_PADDING } from '@/lib/stage';
import { useStage } from './stage-context';

export function Stage({ data }: { data: string }) {
  const { width } = useStage();
  const { actions } = useEditor();

  return (
    <div
      data-testid="stage-column"
      className="min-w-0 overflow-auto rounded-xl bg-canvas"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-artboard]')) actions.selectNode();
      }}
    >
      <div className="flex justify-center" style={{ padding: STAGE_PADDING }}>
        <div
          data-artboard
          data-testid="artboard"
          className="theme-basic shrink-0 border border-line-strong bg-background font-sans text-foreground shadow-panel-lg"
          style={{ width, minHeight: ARTBOARD_MIN_HEIGHT }}
        >
          <Frame data={data} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the tray**

Create `components/workbench/component-tray.tsx`:
```tsx
'use client';

import { useEditor } from '@craftjs/core';
import { trayItems } from '@/components/blocks/registry';
import { cn } from '@/lib/utils';
import { PANEL, PANEL_HEADER, PANEL_TITLE } from './chrome';

export function ComponentTray() {
  const { connectors } = useEditor();

  return (
    <aside className={cn(PANEL, 'flex min-h-0 flex-col')}>
      <div className={PANEL_HEADER}>
        <span className={PANEL_TITLE}>Components</span>
      </div>
      <ul className="flex flex-col gap-1 overflow-y-auto p-2">
        {trayItems.map((item) => (
          <li
            key={item.type}
            data-tray-item={item.type}
            ref={(element) => {
              if (element) connectors.create(element, item.create());
            }}
            className="flex cursor-grab items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-[border-color] duration-150 hover:border-line-strong hover:bg-accent active:cursor-grabbing"
          >
            <item.icon className="size-4 text-acc2" aria-hidden />
            <span className="text-[13px] font-medium text-foreground">{item.label}</span>
            <span className="ml-auto font-mono text-[10.5px] text-t4">{item.hint}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 5: Implement the shell and the loader, and mount it on the page**

Create `components/workbench/workbench.tsx`:
```tsx
'use client';

import { Editor } from '@craftjs/core';
import { useState } from 'react';
import { emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { PANEL } from './chrome';
import { ComponentTray } from './component-tray';
import { Stage } from './stage';
import { StageProvider } from './stage-context';

export function Workbench() {
  const [initialLayout] = useState(() => emptyLayoutJson());

  return (
    <Editor resolver={resolver} indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}>
      <StageProvider>
        <div className="grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3">
          <div className="col-span-3 h-[54px]" />
          <ComponentTray />
          <Stage data={initialLayout} />
          <aside className={PANEL} />
        </div>
      </StageProvider>
    </Editor>
  );
}
```

Create `components/workbench/workbench-loader.tsx`:
```tsx
'use client';

import dynamic from 'next/dynamic';

const Workbench = dynamic(() => import('./workbench').then((m) => m.Workbench), {
  ssr: false,
});

export function WorkbenchLoader() {
  return <Workbench />;
}
```

Replace `app/page.tsx`:
```tsx
import { WorkbenchLoader } from '@/components/workbench/workbench-loader';

export default function Page() {
  return <WorkbenchLoader />;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run components/workbench`
Expected: `7 passed` (3 stage, 1 tray, 3 context). If the deselect test fails because `getEvent('selected').contains` is not a function in the installed version, use `editor().query.getEvent('selected').first() === ROOT_NODE` in both assertions instead.

- [ ] **Step 7: The spike: drag and drop in the real browser**

Run `npx tsc --noEmit && npm run lint` (exit 0), start the dev server (preview tool, config `dev`), open `http://localhost:3000`.

Check, in this order, and stop at the first failure (it is the spec's Craft.js risk):

1. The page shows the dark chrome grid with the Components panel on the left, a dark canvas column with a white 1440 px artboard showing "Nothing on the stage yet", and an empty right panel. Browser console has no errors, dev server log has no warnings.
2. Drag "Layout box" from the tray onto the artboard (preview `computer` tool: `left_click_drag` from the tray row to the middle of the artboard). Expected: the empty state disappears and a nested box with "Drop here" appears. If the automation tool's drag does not fire HTML5 drag events, drive them from the JavaScript tool instead:
   ```js
   const src = document.querySelector('[data-tray-item="LayoutBox"]');
   const dst = document.querySelector('[data-block="LayoutBox"]');
   const r = dst.getBoundingClientRect();
   const init = { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
   src.dispatchEvent(new DragEvent('dragstart', init));
   dst.dispatchEvent(new DragEvent('dragenter', init));
   dst.dispatchEvent(new DragEvent('dragover', init));
   dst.dispatchEvent(new DragEvent('drop', init));
   src.dispatchEvent(new DragEvent('dragend', init));
   document.querySelectorAll('[data-block="LayoutBox"]').length
   ```
   Expected result: `2`.
3. Drop a second Layout box inside the first one (target the inner box). Expected: three boxes in the DOM, the inner one showing "Drop here".
4. Pressing on the dark canvas outside the artboard throws no error (selection has no visual yet; Task 14 adds it).
5. Resize the browser window narrower than the artboard: the artboard overflows with a horizontal scrollbar (zoom comes in Task 11); no errors.

If step 2 or 3 fails with React errors mentioning refs, effects or "Cannot read properties of undefined" inside `@craftjs/core`, first set `reactStrictMode: false` in `next.config.ts` and retry. If it still fails, stop and report: the spec names dnd-kit plus a hand-rolled tree as the alternative, and that is a different spec.

Take a screenshot for the record.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx components/workbench next.config.ts
git commit -m "$(cat <<'EOF'
Add the workbench shell with a live stage and component tray

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Topbar with viewport presets, readout, Undo and Redo

Spec: section 4.2 (topbar), 4.3 (presets, readout).

**Files:**
- Create: `components/workbench/topbar.tsx`, `components/workbench/topbar.test.tsx`
- Modify: `components/workbench/workbench.tsx`

**Interfaces:**
- Consumes: `useStage` (Task 7); `STAGE_PRESETS`, `STAGE_PRESET_ORDER`, `StagePreset` (Task 5); `PANEL`, `SEG_GROUP`, `SEG_ITEM` (Task 3); shadcn `Button`, `Separator`, `ToggleGroup`, `ToggleGroupItem`, `Tooltip`, `TooltipTrigger`, `TooltipContent`.
- Produces: `Topbar({ onNew: () => void })`, `stageReadout(width: number, breakpoint: Breakpoint, zoom: number): string`. The readout element has `data-testid="stage-readout"`.

- [ ] **Step 1: Write the failing tests**

Create `components/workbench/topbar.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Frame, ROOT_NODE } from '@craftjs/core';
import { emptyLayoutJson } from '@/components/blocks/registry';
import { renderInEditor } from '@/test/craft-harness';
import { Topbar, stageReadout } from './topbar';

function presetButton(label: string) {
  const button = screen.getByText(label).closest('button');
  if (!button) throw new Error(`no button for ${label}`);
  return button;
}

describe('stageReadout', () => {
  it('shows width, breakpoint and zoom only when scaled', () => {
    expect(stageReadout(1440, 'desktop', 1)).toBe('1440 px · desktop');
    expect(stageReadout(375, 'mobile', 1)).toBe('375 px · mobile');
    expect(stageReadout(1440, 'desktop', 0.72)).toBe('1440 px · desktop · 72%');
  });
});

describe('Topbar', () => {
  it('marks the active preset and switches width on click', async () => {
    renderInEditor(<Topbar onNew={() => {}} />, { width: 1440 });
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('1440 px · desktop');
    expect(presetButton('Desktop')).toHaveAttribute('data-state', 'on');
    expect(presetButton('Mobile')).toHaveAttribute('data-state', 'off');

    await userEvent.click(presetButton('Tablet'));
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('768 px · desktop');
    expect(presetButton('Tablet')).toHaveAttribute('data-state', 'on');

    await userEvent.click(presetButton('Mobile'));
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('375 px · mobile');
  });

  it('shows no active preset at a custom width', () => {
    renderInEditor(<Topbar onNew={() => {}} />, { width: 900 });
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('900 px · desktop');
    for (const label of ['Mobile', 'Tablet', 'Desktop']) {
      expect(presetButton(label)).toHaveAttribute('data-state', 'off');
    }
  });

  it('enables Undo and Redo as the history changes', async () => {
    const { editor } = renderInEditor(
      <>
        <Frame data={emptyLayoutJson()} />
        <Topbar onNew={() => {}} />
      </>,
    );
    await screen.findByText('Nothing on the stage yet');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    editor().actions.setProp(ROOT_NODE, (props: { gap: number }) => {
      props.gap = 8;
    });
    await waitFor(() => expect(undo).toBeEnabled());

    await userEvent.click(undo);
    await waitFor(() => expect(redo).toBeEnabled());
    expect(undo).toBeDisabled();
  });

  it('calls onNew', async () => {
    const onNew = vi.fn();
    renderInEditor(<Topbar onNew={onNew} />);
    await userEvent.click(screen.getByRole('button', { name: 'New layout' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/workbench/topbar.test.tsx`
Expected: FAIL, "Failed to resolve import './topbar'".

- [ ] **Step 3: Implement**

Create `components/workbench/topbar.tsx`:
```tsx
'use client';

import { useEditor } from '@craftjs/core';
import {
  FilePlus2,
  Monitor,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Breakpoint } from '@/lib/responsive';
import { STAGE_PRESETS, STAGE_PRESET_ORDER, type StagePreset } from '@/lib/stage';
import { cn } from '@/lib/utils';
import { PANEL, SEG_GROUP, SEG_ITEM } from './chrome';
import { useStage } from './stage-context';

const PRESET_META: Record<StagePreset, { label: string; icon: LucideIcon }> = {
  mobile: { label: 'Mobile', icon: Smartphone },
  tablet: { label: 'Tablet', icon: Tablet },
  desktop: { label: 'Desktop', icon: Monitor },
};

export function stageReadout(width: number, breakpoint: Breakpoint, zoom: number): string {
  const parts = [`${width} px`, breakpoint];
  if (zoom < 1) parts.push(`${Math.round(zoom * 100)}%`);
  return parts.join(' · ');
}

function IconAction({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
          <Icon className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Topbar({ onNew }: { onNew: () => void }) {
  const { width, breakpoint, preset, zoom, setPreset } = useStage();
  const { actions, canUndo, canRedo } = useEditor((_, query) => ({
    canUndo: query.history.canUndo(),
    canRedo: query.history.canRedo(),
  }));

  return (
    <header className={cn(PANEL, 'col-span-3 flex h-[54px] items-center gap-2 px-3.5')}>
      <span className="text-[13px] font-semibold">Assembly Workbench</span>
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-[22px]" />
      <ToggleGroup
        type="single"
        aria-label="Stage width"
        value={preset ?? ''}
        onValueChange={(value) => {
          if (value) setPreset(value as StagePreset);
        }}
        className={cn(SEG_GROUP, 'w-auto')}
      >
        {STAGE_PRESET_ORDER.map((key) => {
          const { label, icon: Icon } = PRESET_META[key];
          return (
            <ToggleGroupItem
              key={key}
              value={key}
              title={`${STAGE_PRESETS[key]} px`}
              className={cn(SEG_ITEM, 'gap-1.5 px-3')}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <span
        data-testid="stage-readout"
        className="font-mono text-[11px] text-muted-foreground tabular-nums"
      >
        {stageReadout(width, breakpoint, zoom)}
      </span>
      <div className="flex-1" />
      <IconAction label="Undo" icon={Undo2} disabled={!canUndo} onClick={() => actions.history.undo()} />
      <IconAction label="Redo" icon={Redo2} disabled={!canRedo} onClick={() => actions.history.redo()} />
      <IconAction label="New layout" icon={FilePlus2} onClick={onNew} />
    </header>
  );
}
```

If the installed `components/ui/tooltip.tsx` does not wrap `Tooltip` in a `TooltipProvider` itself, wrap the `<header>` contents in `<TooltipProvider delayDuration={0}>` imported from the same file.

In `components/workbench/workbench.tsx`, replace the line
```tsx
          <div className="col-span-3 h-[54px]" />
```
with
```tsx
          <Topbar onNew={() => {}} />
```
and add `import { Topbar } from './topbar';` to the imports. Task 17 wires `onNew`.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run components/workbench/topbar.test.tsx`
Expected: `5 passed`. If the preset items render with `data-state` missing, the installed ToggleGroup is not Radix-based; confirm Task 1 Step 2 chose the Radix style.

- [ ] **Step 5: Check in the browser, then commit**

Run `npx tsc --noEmit && npm run lint` (exit 0). With the dev server running, reload: the topbar shows the name, the segmented control with Desktop active, the readout `1440 px · desktop`, and the three icon buttons on the right with Undo and Redo dimmed. Click Mobile: the artboard narrows to 375 and the readout follows. Then:
```bash
git add components/workbench/topbar.tsx components/workbench/topbar.test.tsx components/workbench/workbench.tsx
git commit -m "$(cat <<'EOF'
Add the topbar with viewport presets, readout and history actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Resize grip and zoom-to-fit

Spec: section 4.3 (resize, scale to fit).

**Files:**
- Modify: `components/workbench/stage.tsx`, `components/workbench/stage.test.tsx`

**Interfaces:**
- Consumes: `computeZoom`, `STAGE_PADDING`, `MIN_STAGE_WIDTH`, `MAX_STAGE_WIDTH` (Task 5); `useStage().setZoom`, `zoom`, `setWidth` (Task 7).
- Produces: a `role="separator"` element labelled "Resize the stage"; the zoom wrapper carries `data-artboard` (so pressing the grip does not deselect) and `data-testid="artboard-zoom"`.

- [ ] **Step 1: Add the failing tests**

Append to `components/workbench/stage.test.tsx` (inside the same `describe('Stage')` block; add `vi` and `afterEach` to the vitest import and `useStage` to the imports):
```tsx
  it('resizes with the grip, dividing the pointer delta by the zoom', async () => {
    renderInEditor(<Stage data={emptyLayoutJson()} />, { width: 1000 });
    const grip = await screen.findByRole('separator', { name: 'Resize the stage' });
    expect(grip).toHaveAttribute('aria-valuenow', '1000');

    fireEvent.pointerDown(grip, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 300, pointerId: 1 });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1200px' });
    fireEvent.pointerUp(grip, { clientX: 300, pointerId: 1 });

    fireEvent.pointerDown(grip, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: -5000, pointerId: 1 });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '320px' });
    fireEvent.pointerUp(grip, { clientX: -5000, pointerId: 1 });
  });

  it('resizes with the arrow keys, ten times faster with Shift', async () => {
    renderInEditor(<Stage data={emptyLayoutJson()} />, { width: 1000 });
    const grip = await screen.findByRole('separator', { name: 'Resize the stage' });
    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1010px' });
    fireEvent.keyDown(grip, { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1110px' });
    fireEvent.keyDown(grip, { key: 'ArrowLeft' });
    expect(screen.getByTestId('artboard')).toHaveStyle({ width: '1100px' });
  });

  it('scales the artboard down when the column is narrower than it', async () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(768);
    function ZoomProbe() {
      return <output data-testid="zoom">{useStage().zoom}</output>;
    }
    renderInEditor(
      <>
        <Stage data={emptyLayoutJson()} />
        <ZoomProbe />
      </>,
      { width: 1440 },
    );
    await waitFor(() => expect(screen.getByTestId('zoom')).toHaveTextContent('0.5'));
    spy.mockRestore();
  });
```
(768 minus 2 × 24 of padding is 720; 720 / 1440 is 0.5.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/workbench/stage.test.tsx`
Expected: the three new tests FAIL (no separator role; zoom stays 1).

- [ ] **Step 3: Implement**

Replace `components/workbench/stage.tsx` with:
```tsx
'use client';

import { Frame, useEditor } from '@craftjs/core';
import { useEffect, useRef, useState } from 'react';
import {
  ARTBOARD_MIN_HEIGHT,
  MAX_STAGE_WIDTH,
  MIN_STAGE_WIDTH,
  STAGE_PADDING,
  computeZoom,
} from '@/lib/stage';
import { cn } from '@/lib/utils';
import { useStage } from './stage-context';

function ResizeGrip({
  width,
  zoom,
  onResize,
}: {
  width: number;
  zoom: number;
  onResize: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the stage"
      aria-valuenow={width}
      aria-valuemin={MIN_STAGE_WIDTH}
      aria-valuemax={MAX_STAGE_WIDTH}
      tabIndex={0}
      className="absolute top-0 -right-4 flex h-full w-4 cursor-col-resize touch-none items-center justify-center select-none"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        onResize(start.current.width + (event.clientX - start.current.x) / zoom);
      }}
      onPointerUp={(event) => {
        start.current = null;
        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 100 : 10;
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onResize(width + step);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onResize(width - step);
        }
      }}
    >
      <div className={cn('h-10 w-1 rounded-full', dragging ? 'bg-acc' : 'bg-border')} />
    </div>
  );
}

export function Stage({ data }: { data: string }) {
  const { width, zoom, setWidth, setZoom } = useStage();
  const { actions } = useEditor();
  const columnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;
    const update = () => setZoom(computeZoom(column.clientWidth - STAGE_PADDING * 2, width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(column);
    return () => observer.disconnect();
  }, [width, setZoom]);

  return (
    <div
      ref={columnRef}
      data-testid="stage-column"
      className="min-w-0 overflow-auto rounded-xl bg-canvas"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-artboard]')) actions.selectNode();
      }}
    >
      <div className="flex justify-center" style={{ padding: STAGE_PADDING }}>
        <div data-artboard data-testid="artboard-zoom" className="relative shrink-0" style={{ zoom }}>
          <div
            data-testid="artboard"
            className="theme-basic border border-line-strong bg-background font-sans text-foreground shadow-panel-lg"
            style={{ width, minHeight: ARTBOARD_MIN_HEIGHT }}
          >
            <Frame data={data} />
          </div>
          <ResizeGrip width={width} zoom={zoom} onResize={setWidth} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run components/workbench/stage.test.tsx`
Expected: `6 passed`. If `toHaveStyle({ zoom })` is ever needed, jsdom does not parse `zoom`; keep asserting through `useStage().zoom` as the test does.

- [ ] **Step 5: Check in the browser, then commit**

With the dev server running: at Desktop (1440) in a window narrower than about 2100 px, the artboard scales down and the readout shows the percentage (for example `1440 px · desktop · 61%`). Drag the grip on the right edge: the width follows the cursor at any zoom, the readout updates live, presets deselect at custom widths. Drag to 700: readout says `mobile`; drag to 800: `desktop`. Then drag a Layout box onto the artboard while zoomed to confirm the drop indicator lands where the cursor is (the spec's `zoom` risk); if it is offset, switch the wrapper to `transform: scale(zoom)` with `transformOrigin: 'top center'` and a sized outer wrapper, and note it in the commit message.

```bash
git add components/workbench/stage.tsx components/workbench/stage.test.tsx
git commit -m "$(cat <<'EOF'
Add the stage resize grip and zoom-to-fit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Button and Input blocks

Spec: section 4.5 (Button, Input).

**Files:**
- Create: `components/blocks/button.tsx`, `components/blocks/input.tsx`, `components/blocks/button.test.tsx`, `components/blocks/input.test.tsx`
- Modify: `components/blocks/registry.tsx`

**Interfaces:**
- Consumes: `GROW_FIELD`, `BlockSchema` (Task 8); `blockClasses`, `GrowProps` (Task 6); shadcn `Button`, `Input`, `Label`.
- Produces:
  - `button.tsx`: `Button` (resolver key `Button`), `ButtonBlockProps`, `BUTTON_DEFAULTS`, `buttonSchema`
  - `input.tsx`: `Input` (resolver key `Input`), `InputBlockProps`, `INPUT_DEFAULTS`, `inputSchema`
  - Tray entries "Button" and "Input" in `trayItems`.

- [ ] **Step 1: Write the failing tests**

Create `components/blocks/button.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Button } from './button';
import { renderTree } from '@/test/craft-harness';

describe('Button block', () => {
  it('renders the shadcn button with label, variant and size', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Save changes" variant="destructive" size="sm" />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Save changes' });
    expect(button).toHaveAttribute('data-block', 'Button');
    expect(button).toHaveClass('bg-destructive');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('uses the defaults when no props are given', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Button' });
    expect(button).toHaveClass('bg-primary');
  });

  it('shows disabled as aria-disabled so it stays selectable', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Off" disabled />
      </Element>,
    );
    const button = await screen.findByRole('button', { name: 'Off' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveClass('opacity-50');
  });

  it('applies grow', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Button label="Wide" grow />
      </Element>,
    );
    expect(await screen.findByRole('button', { name: 'Wide' })).toHaveClass('flex-1');
  });
});
```

Create `components/blocks/input.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Input } from './input';
import { renderTree } from '@/test/craft-harness';

describe('Input block', () => {
  it('renders a read-only input with its label and placeholder', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Input label="Email" placeholder="you@example.com" type="email" />
      </Element>,
    );
    const input = await screen.findByPlaceholderText('you@example.com');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(input.closest('[data-block="Input"]')).not.toBeNull();
  });

  it('hides the label when it is empty', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Input />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Input"]')).not.toBeNull());
    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByPlaceholderText('Placeholder')).toBeInTheDocument();
  });

  it('shows disabled as aria-disabled', async () => {
    renderTree(
      <Element is={LayoutBox} canvas>
        <Input placeholder="Off" disabled />
      </Element>,
    );
    const input = await screen.findByPlaceholderText('Off');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(input).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/blocks/button.test.tsx components/blocks/input.test.tsx`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement the Button block**

Create `components/blocks/button.tsx`:
```tsx
import { useNode, type UserComponent } from '@craftjs/core';
import { Button as UiButton } from '@/components/ui/button';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg';

export interface ButtonBlockProps extends GrowProps {
  label: string;
  variant: ButtonVariant;
  size: ButtonSize;
  disabled: boolean;
}

export const BUTTON_DEFAULTS: ButtonBlockProps = {
  label: 'Button',
  variant: 'default',
  size: 'default',
  disabled: false,
  grow: false,
};

export const Button: UserComponent<Partial<ButtonBlockProps>> = (props) => {
  const merged: ButtonBlockProps = { ...BUTTON_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <UiButton
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      type="button"
      data-block="Button"
      variant={merged.variant}
      size={merged.size}
      aria-disabled={merged.disabled || undefined}
      className={cn(blockClasses(merged), merged.disabled && 'opacity-50')}
    >
      {merged.label}
    </UiButton>
  );
};

Button.craft = {
  displayName: 'Button',
  props: BUTTON_DEFAULTS,
};

export const buttonSchema: BlockSchema = {
  type: 'Button',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    {
      prop: 'variant',
      label: 'Variant',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'destructive', label: 'Destructive' },
        { value: 'outline', label: 'Outline' },
        { value: 'secondary', label: 'Secondary' },
        { value: 'ghost', label: 'Ghost' },
        { value: 'link', label: 'Link' },
      ],
    },
    {
      prop: 'size',
      label: 'Size',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'sm', label: 'Small' },
        { value: 'lg', label: 'Large' },
      ],
    },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
```
If Task 1 Step 4 found different variant or size names in the installed `button.tsx`, use those names in `ButtonVariant`, `ButtonSize` and the option lists.

- [ ] **Step 4: Implement the Input block**

Create `components/blocks/input.tsx`:
```tsx
import { useNode, type UserComponent } from '@craftjs/core';
import { Input as UiInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { GROW_FIELD, type BlockSchema } from './schema';

export type InputType = 'text' | 'email' | 'password' | 'number';

export interface InputBlockProps extends GrowProps {
  label: string;
  placeholder: string;
  type: InputType;
  disabled: boolean;
}

export const INPUT_DEFAULTS: InputBlockProps = {
  label: '',
  placeholder: 'Placeholder',
  type: 'text',
  disabled: false,
  grow: false,
};

export const Input: UserComponent<Partial<InputBlockProps>> = (props) => {
  const merged: InputBlockProps = { ...INPUT_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Input"
      className={cn('flex w-full flex-col gap-2', blockClasses(merged))}
    >
      {merged.label !== '' && <Label>{merged.label}</Label>}
      <UiInput
        type={merged.type}
        placeholder={merged.placeholder}
        readOnly
        tabIndex={-1}
        aria-disabled={merged.disabled || undefined}
        className={cn(merged.disabled && 'opacity-50')}
      />
    </div>
  );
};

Input.craft = {
  displayName: 'Input',
  props: INPUT_DEFAULTS,
};

export const inputSchema: BlockSchema = {
  type: 'Input',
  fields: [
    { prop: 'label', label: 'Label', kind: 'text', section: 'Content' },
    { prop: 'placeholder', label: 'Placeholder', kind: 'text', section: 'Content' },
    {
      prop: 'type',
      label: 'Type',
      kind: 'select',
      section: 'Style',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'email', label: 'Email' },
        { value: 'password', label: 'Password' },
        { value: 'number', label: 'Number' },
      ],
    },
    { prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' },
    GROW_FIELD,
  ],
};
```

- [ ] **Step 5: Register both blocks**

In `components/blocks/registry.tsx`:
- Add imports: `import { Button, buttonSchema } from './button';`, `import { Input, inputSchema } from './input';`, and change the lucide import to `import { LayoutGrid, MousePointerClick, TextCursorInput, type LucideIcon } from 'lucide-react';`.
- Change `export const resolver = { LayoutBox };` to `export const resolver = { LayoutBox, Button, Input };`.
- Append to `trayItems` after the LayoutBox entry:
```tsx
  {
    type: 'Button',
    label: 'Button',
    hint: 'shadcn Button',
    icon: MousePointerClick,
    create: () => <Button />,
  },
  {
    type: 'Input',
    label: 'Input',
    hint: 'shadcn Input with label',
    icon: TextCursorInput,
    create: () => <Input />,
  },
```
- Add to `schemas`: `Button: buttonSchema,` and `Input: inputSchema,`.

- [ ] **Step 6: Run to see them pass**

Run: `npx vitest run components/blocks components/workbench`
Expected: all pass (the tray test picks up the two new rows on its own).

- [ ] **Step 7: Check in the browser, then commit**

`npx tsc --noEmit && npm run lint` (exit 0). In the browser: drag a Button and an Input into a Layout box; both render in the basic light theme inside the artboard; clicking the Input does not place a caret.
```bash
git add components/blocks
git commit -m "$(cat <<'EOF'
Add the Button and Input blocks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Card and Dialog blocks, complete registry

Spec: sections 4.5 (Card, Dialog), 4.6 (zone rules).

**Files:**
- Create: `components/blocks/card.tsx`, `components/blocks/dialog.tsx`, `components/blocks/card.test.tsx`, `components/blocks/dialog.test.tsx`
- Modify: `components/blocks/registry.tsx`, `components/blocks/registry.test.tsx`

**Interfaces:**
- Consumes: `DropZone` (Task 8); shadcn `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Button`.
- Produces:
  - `card.tsx`: `Card` (resolver key `Card`), `CardContent` zone (resolver key `CardContent`), `CardBlockProps`, `CARD_DEFAULTS`, `cardSchema`
  - `dialog.tsx`: `Dialog` (resolver key `Dialog`), `DialogContent` zone (resolver key `DialogContent`), `DialogBlockProps`, `DIALOG_DEFAULTS`, `dialogSchema`
  - Zones carry `data-zone="<ZoneType>"`; the dialog's inline panel carries `data-testid="dialog-preview"`.
  - `registry.tsx` now exports the full `resolver` (7 entries), 5 tray items, 5 schemas.

- [ ] **Step 1: Write the failing tests**

Create `components/blocks/card.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Card } from './card';
import { renderTree } from '@/test/craft-harness';

describe('Card block', () => {
  it('renders title, description and an empty content zone', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Card title="Billing" description="Update your plan." />
      </Element>,
    );
    expect(await screen.findByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Update your plan.')).toBeInTheDocument();
    expect(screen.getByText('Drop here')).toBeInTheDocument();
    expect(container.querySelector('[data-block="Card"] [data-zone="CardContent"]')).not.toBeNull();
  });

  it('drops the header when title and description are both empty', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Card title="" description="" />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-block="Card"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="card-header"]')).toBeNull();
  });

  it('cannot drag its content zone', async () => {
    const { container, editor } = renderTree(
      <Element is={LayoutBox} canvas>
        <Card />
      </Element>,
    );
    await waitFor(() => expect(container.querySelector('[data-zone="CardContent"]')).not.toBeNull());
    const cardId = editor().query.node('ROOT').get().data.nodes[0];
    const zoneId = editor().query.node(cardId).get().data.linkedNodes.content;
    expect(editor().query.node(zoneId).isDraggable()).toBe(false);
    expect(editor().query.node(cardId).isDraggable()).toBe(true);
  });
});
```

Create `components/blocks/dialog.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { Element } from '@craftjs/core';
import { LayoutBox } from './layout-box';
import { Dialog } from './dialog';
import { Button } from './button';
import { renderTree } from '@/test/craft-harness';

describe('Dialog block', () => {
  it('renders the trigger and the inline preview with a content zone', async () => {
    const { container } = renderTree(
      <Element is={LayoutBox} canvas>
        <Dialog triggerLabel="Invite" title="Invite a teammate" description="They get an email." />
      </Element>,
    );
    expect(await screen.findByRole('button', { name: 'Invite' })).toBeInTheDocument();
    expect(screen.getByText('Invite a teammate')).toBeInTheDocument();
    expect(screen.getByText('They get an email.')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-preview')).toBeInTheDocument();
    expect(container.querySelector('[data-zone="DialogContent"]')).not.toBeNull();
  });

  it('hides the preview when previewOpen is off and keeps its children for later', async () => {
    const { container, editor } = renderTree(
      <Element is={LayoutBox} canvas>
        <Dialog />
      </Element>,
    );
    await screen.findByTestId('dialog-preview');
    const dialogId = editor().query.node('ROOT').get().data.nodes[0];
    const zoneId = editor().query.node(dialogId).get().data.linkedNodes.content;

    act(() => {
      const tree = editor().query.parseReactElement(<Button label="Inside" />).toNodeTree();
      editor().actions.addNodeTree(tree, zoneId);
    });
    expect(await screen.findByRole('button', { name: 'Inside' })).toBeInTheDocument();

    act(() => {
      editor().actions.setProp(dialogId, (props: { previewOpen: boolean }) => {
        props.previewOpen = false;
      });
    });
    await waitFor(() => expect(screen.queryByTestId('dialog-preview')).toBeNull());
    expect(container.querySelector('[data-zone="DialogContent"]')).toBeNull();

    act(() => {
      editor().actions.setProp(dialogId, (props: { previewOpen: boolean }) => {
        props.previewOpen = true;
      });
    });
    expect(await screen.findByRole('button', { name: 'Inside' })).toBeInTheDocument();
  });

  it('refuses a Dialog inside its content zone', async () => {
    const { editor } = renderTree(
      <Element is={LayoutBox} canvas>
        <Dialog />
      </Element>,
    );
    await screen.findByTestId('dialog-preview');
    const dialogId = editor().query.node('ROOT').get().data.nodes[0];
    const zoneId = editor().query.node(dialogId).get().data.linkedNodes.content;

    const incomingDialog = editor().query.parseReactElement(<Dialog />).toNodeTree();
    const incomingButton = editor().query.parseReactElement(<Button />).toNodeTree();
    const zone = editor().query.node(zoneId);
    expect(zone.get().rules.canMoveIn([incomingDialog.nodes[incomingDialog.rootNodeId]], zone.get(), editor().query.node)).toBe(false);
    expect(zone.get().rules.canMoveIn([incomingButton.nodes[incomingButton.rootNodeId]], zone.get(), editor().query.node)).toBe(true);
  });
});
```

Replace `components/blocks/registry.test.tsx` with:
```tsx
import { describe, expect, it } from 'vitest';
import { LAYOUT_BOX_DEFAULTS, ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { isResponsive } from '@/lib/responsive';
import { KNOWN_TYPES, ZONE_TYPES, emptyLayoutJson, resolver, schemaFor, trayItems } from './registry';
import type { BlockType } from './schema';

const BLOCK_TYPES: BlockType[] = ['LayoutBox', 'Button', 'Input', 'Card', 'Dialog'];

describe('registry', () => {
  it('resolves every block and both zones', () => {
    expect([...KNOWN_TYPES].sort()).toEqual(
      ['Button', 'Card', 'CardContent', 'Dialog', 'DialogContent', 'Input', 'LayoutBox'],
    );
    expect([...ZONE_TYPES].sort()).toEqual(['CardContent', 'DialogContent']);
  });

  it('has one tray item per block type, in the spec order', () => {
    expect(trayItems.map((item) => item.type)).toEqual(['LayoutBox', 'Card', 'Button', 'Input', 'Dialog']);
  });

  it('has a schema for every block whose props exist in the block defaults', () => {
    for (const type of BLOCK_TYPES) {
      const schema = schemaFor(type);
      expect(schema?.type).toBe(type);
      const defaults = (resolver[type] as { craft?: { props?: Record<string, unknown> } }).craft?.props ?? {};
      for (const field of schema!.fields) {
        expect(defaults).toHaveProperty(field.prop);
        if (field.responsive) expect(isResponsive(defaults[field.prop])).toBe(true);
        if (field.kind === 'select') expect(field.options?.length).toBeGreaterThan(1);
      }
    }
    expect(schemaFor('CardContent')).toBeNull();
    expect(schemaFor('Nope')).toBeNull();
  });

  it('hides columns unless the box is a grid, and direction unless it is flex', () => {
    const fields = schemaFor('LayoutBox')!.fields;
    const columns = fields.find((f) => f.prop === 'columns')!;
    const direction = fields.find((f) => f.prop === 'direction')!;
    expect(columns.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'grid' })).toBe(true);
    expect(columns.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'flex' })).toBe(false);
    expect(direction.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'grid' })).toBe(false);
    expect(direction.showWhen?.({ ...LAYOUT_BOX_DEFAULTS, mode: 'flex' })).toBe(true);
  });

  it('marks previewOpen as editor-only', () => {
    const previewOpen = schemaFor('Dialog')!.fields.find((f) => f.prop === 'previewOpen');
    expect(previewOpen?.editorOnly).toBe(true);
    expect(previewOpen?.section).toBe('Editor');
  });
});

describe('emptyLayoutJson', () => {
  it('is a single root LayoutBox with the root defaults', () => {
    const tree = JSON.parse(emptyLayoutJson());
    expect(Object.keys(tree)).toEqual(['ROOT']);
    expect(tree.ROOT.type).toEqual({ resolvedName: 'LayoutBox' });
    expect(tree.ROOT.isCanvas).toBe(true);
    expect(tree.ROOT.nodes).toEqual([]);
    expect(tree.ROOT.parent).toBeNull();
    expect(tree.ROOT.props).toEqual(ROOT_LAYOUT_PROPS);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/blocks`
Expected: card and dialog tests FAIL on unresolved imports; registry tests FAIL on the tray order and the missing types.

- [ ] **Step 3: Implement the Card block and its zone**

Create `components/blocks/card.tsx`:
```tsx
import { Element, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode } from 'react';
import {
  Card as UiCard,
  CardContent as UiCardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { DropZone } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface CardBlockProps extends GrowProps {
  title: string;
  description: string;
}

export const CARD_DEFAULTS: CardBlockProps = {
  title: 'Card title',
  description: '',
  grow: false,
};

export const CardContent: UserComponent<{ children?: ReactNode }> = ({ children }) => {
  const {
    connectors: { connect },
    childCount,
  } = useNode((node) => ({ childCount: node.data.nodes.length }));

  return (
    <UiCardContent
      ref={(element) => {
        if (element) connect(element);
      }}
      data-zone="CardContent"
      className="flex flex-col gap-4"
    >
      {childCount === 0 ? <DropZone /> : children}
    </UiCardContent>
  );
};

CardContent.craft = {
  displayName: 'CardContent',
  rules: {
    canDrag: () => false,
  },
};

export const Card: UserComponent<Partial<CardBlockProps>> = (props) => {
  const merged: CardBlockProps = { ...CARD_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();
  const showHeader = merged.title !== '' || merged.description !== '';

  return (
    <UiCard
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Card"
      className={cn('w-full', blockClasses(merged))}
    >
      {showHeader && (
        <CardHeader>
          {merged.title !== '' && <CardTitle>{merged.title}</CardTitle>}
          {merged.description !== '' && <CardDescription>{merged.description}</CardDescription>}
        </CardHeader>
      )}
      <Element id="content" is={CardContent} canvas />
    </UiCard>
  );
};

Card.craft = {
  displayName: 'Card',
  props: CARD_DEFAULTS,
};

export const cardSchema: BlockSchema = {
  type: 'Card',
  fields: [
    { prop: 'title', label: 'Title', kind: 'text', section: 'Content' },
    { prop: 'description', label: 'Description', kind: 'text', section: 'Content' },
    GROW_FIELD,
  ],
};
```
If the installed `card.tsx` does not set `data-slot="card-header"` on `CardHeader`, change the second card test to look for the title text being absent instead: `expect(screen.queryByText('Card title')).toBeNull()`.

- [ ] **Step 4: Implement the Dialog block and its zone**

Create `components/blocks/dialog.tsx`:
```tsx
import { Element, useNode, type UserComponent } from '@craftjs/core';
import type { ReactNode } from 'react';
import { Button as UiButton } from '@/components/ui/button';
import { type GrowProps, blockClasses } from '@/lib/classes';
import { cn } from '@/lib/utils';
import { DropZone } from './drop-zone';
import { GROW_FIELD, type BlockSchema } from './schema';

export interface DialogBlockProps extends GrowProps {
  triggerLabel: string;
  title: string;
  description: string;
  previewOpen: boolean;
}

export const DIALOG_DEFAULTS: DialogBlockProps = {
  triggerLabel: 'Open dialog',
  title: 'Dialog title',
  description: '',
  previewOpen: true,
  grow: false,
};

export const DialogContent: UserComponent<{ children?: ReactNode }> = ({ children }) => {
  const {
    connectors: { connect },
    childCount,
  } = useNode((node) => ({ childCount: node.data.nodes.length }));

  return (
    <div
      ref={(element) => {
        if (element) connect(element);
      }}
      data-zone="DialogContent"
      className="flex flex-col gap-4"
    >
      {childCount === 0 ? <DropZone /> : children}
    </div>
  );
};

DialogContent.craft = {
  displayName: 'DialogContent',
  rules: {
    canDrag: () => false,
    canMoveIn: (incoming) => incoming.every((node) => node.data.name !== 'Dialog'),
  },
};

export const Dialog: UserComponent<Partial<DialogBlockProps>> = (props) => {
  const merged: DialogBlockProps = { ...DIALOG_DEFAULTS, ...props };
  const {
    connectors: { connect, drag },
  } = useNode();

  return (
    <div
      ref={(element) => {
        if (element) connect(drag(element));
      }}
      data-block="Dialog"
      className={cn('flex w-full flex-col items-start gap-4', blockClasses(merged))}
    >
      <UiButton type="button" variant="outline">
        {merged.triggerLabel}
      </UiButton>
      {merged.previewOpen && (
        <div
          data-testid="dialog-preview"
          className="flex w-full max-w-lg flex-col gap-4 rounded-lg border bg-background p-6 shadow-lg"
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg leading-none font-semibold">{merged.title}</h2>
            {merged.description !== '' && (
              <p className="text-sm text-muted-foreground">{merged.description}</p>
            )}
          </div>
          <Element id="content" is={DialogContent} canvas />
        </div>
      )}
    </div>
  );
};

Dialog.craft = {
  displayName: 'Dialog',
  props: DIALOG_DEFAULTS,
};

export const dialogSchema: BlockSchema = {
  type: 'Dialog',
  fields: [
    { prop: 'triggerLabel', label: 'Trigger label', kind: 'text', section: 'Content' },
    { prop: 'title', label: 'Title', kind: 'text', section: 'Content' },
    { prop: 'description', label: 'Description', kind: 'text', section: 'Content' },
    {
      prop: 'previewOpen',
      label: 'Show content on stage',
      kind: 'boolean',
      section: 'Editor',
      editorOnly: true,
    },
    GROW_FIELD,
  ],
};
```

- [ ] **Step 5: Complete the registry**

Replace `components/blocks/registry.tsx` with:
```tsx
import { Element } from '@craftjs/core';
import {
  AppWindow,
  LayoutGrid,
  MousePointerClick,
  RectangleHorizontal,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { ROOT_LAYOUT_PROPS } from '@/lib/classes';
import { Button, buttonSchema } from './button';
import { Card, CardContent, cardSchema } from './card';
import { Dialog, DialogContent, dialogSchema } from './dialog';
import { Input, inputSchema } from './input';
import { LayoutBox, layoutBoxSchema } from './layout-box';
import type { BlockSchema, BlockType } from './schema';

export const resolver = { LayoutBox, Button, Input, Card, Dialog, CardContent, DialogContent };

export const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.keys(resolver));

export const ZONE_TYPES: ReadonlySet<string> = new Set(['CardContent', 'DialogContent']);

export interface TrayItem {
  type: BlockType;
  label: string;
  hint: string;
  icon: LucideIcon;
  create: () => ReactElement;
}

export const trayItems: TrayItem[] = [
  {
    type: 'LayoutBox',
    label: 'Layout box',
    hint: 'Flex or grid container',
    icon: LayoutGrid,
    create: () => <Element is={LayoutBox} canvas />,
  },
  {
    type: 'Card',
    label: 'Card',
    hint: 'Header and content area',
    icon: RectangleHorizontal,
    create: () => <Card />,
  },
  {
    type: 'Button',
    label: 'Button',
    hint: 'shadcn Button',
    icon: MousePointerClick,
    create: () => <Button />,
  },
  {
    type: 'Input',
    label: 'Input',
    hint: 'shadcn Input with label',
    icon: TextCursorInput,
    create: () => <Input />,
  },
  {
    type: 'Dialog',
    label: 'Dialog',
    hint: 'Trigger and content',
    icon: AppWindow,
    create: () => <Dialog />,
  },
];

const schemas: Partial<Record<string, BlockSchema>> = {
  LayoutBox: layoutBoxSchema,
  Button: buttonSchema,
  Input: inputSchema,
  Card: cardSchema,
  Dialog: dialogSchema,
};

export function schemaFor(type: string): BlockSchema | null {
  return schemas[type] ?? null;
}

export function emptyLayoutJson(): string {
  return JSON.stringify({
    ROOT: {
      type: { resolvedName: 'LayoutBox' },
      isCanvas: true,
      props: ROOT_LAYOUT_PROPS,
      displayName: 'LayoutBox',
      custom: {},
      hidden: false,
      nodes: [],
      linkedNodes: {},
      parent: null,
    },
  });
}
```

- [ ] **Step 6: Run to see them pass**

Run: `npm test`
Expected: all pass. If the `canMoveIn` assertion fails on the third argument's type, call it as `zone.get().rules.canMoveIn([node], zone.get(), editor().query.node as never)`; the rule ignores the helpers.

- [ ] **Step 7: Check in the browser, then commit**

`npx tsc --noEmit && npm run lint` (exit 0). In the browser: drag a Card into a Layout box, then a Button into the Card's "Drop here"; drag a Dialog in, then an Input into its content; try dragging a second Dialog into the first Dialog's content: the indicator turns red and nothing lands.
```bash
git add components/blocks
git commit -m "$(cat <<'EOF'
Add the Card and Dialog blocks with their content zones

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Selection helpers, zone redirect and the hover/selection overlay

Spec: section 4.4.

**Files:**
- Create: `components/workbench/selection.tsx`, `components/workbench/selection.test.tsx`, `components/workbench/node-indicator.tsx`, `components/workbench/node-indicator.test.tsx`
- Modify: `components/workbench/workbench.tsx`

**Interfaces:**
- Consumes: `ZONE_TYPES` (Task 13).
- Produces:
  - `selection.tsx`: `useSelectedNode(): { id: string | null; type: string | null; parentId: string | null; isRoot: boolean; isZone: boolean }`, `useZoneRedirect(): void`, `selectedIdFrom(state): string | null` (pure, reads Craft's `state.events.selected`)
  - `node-indicator.tsx`: `NodeIndicator({ render })` for Craft's `onRender`; `SelectionOutline({ rect, color, label, weight })` where `weight` is `'hover' | 'selected'`. The overlay carries `data-testid="selection-outline"` and `data-weight`.

- [ ] **Step 1: Write the failing tests**

Create `components/workbench/selection.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Card } from '@/components/blocks/card';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { useSelectedNode, useZoneRedirect } from './selection';

function Probe() {
  useZoneRedirect();
  const selected = useSelectedNode();
  return (
    <output data-testid="selected">
      {[
        selected.id ?? 'none',
        selected.type ?? 'none',
        selected.isRoot ? 'root' : 'child',
        selected.isZone ? 'zone' : 'block',
      ].join('|')}
    </output>
  );
}

describe('useSelectedNode and useZoneRedirect', () => {
  it('reports nothing selected, then the root, then a child', async () => {
    const { editor } = renderInEditor(
      <>
        <Frame>
          <Element is={LayoutBox} canvas>
            <Card />
          </Element>
        </Frame>
        <Probe />
      </>,
    );
    await screen.findByText('Card title');
    expect(screen.getByTestId('selected')).toHaveTextContent('none|none|child|block');

    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(`${ROOT_NODE}|LayoutBox|root|block`),
    );

    const cardId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(cardId);
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(`${cardId}|Card|child|block`),
    );
  });

  it('redirects a selected content zone to its parent block', async () => {
    const { editor } = renderInEditor(
      <>
        <Frame>
          <Element is={LayoutBox} canvas>
            <Card />
          </Element>
        </Frame>
        <Probe />
      </>,
    );
    await screen.findByText('Card title');
    const cardId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    const zoneId = editor().query.node(cardId).get().data.linkedNodes.content;

    editor().actions.selectNode(zoneId);
    await waitFor(() =>
      expect(screen.getByTestId('selected')).toHaveTextContent(`${cardId}|Card|child|block`),
    );
  });
});
```

Create `components/workbench/node-indicator.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Editor, Element, Frame, ROOT_NODE, useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { resolver } from '@/components/blocks/registry';
import { StageProvider } from './stage-context';
import { NodeIndicator, SelectionOutline } from './node-indicator';

describe('SelectionOutline', () => {
  it('positions itself from the rect and shows the label only when selected', () => {
    const rect = { top: 10, left: 20, width: 100, height: 40 } as DOMRect;
    const { rerender } = render(
      <SelectionOutline rect={rect} color="var(--acc)" label="Button" weight="selected" />,
    );
    const outline = screen.getByTestId('selection-outline');
    expect(outline).toHaveStyle({ top: '10px', left: '20px', width: '100px', height: '40px' });
    expect(outline).toHaveAttribute('data-weight', 'selected');
    expect(screen.getByText('Button')).toBeInTheDocument();

    rerender(<SelectionOutline rect={rect} color="var(--acc)" label="Button" weight="hover" />);
    expect(screen.queryByText('Button')).toBeNull();
  });
});

describe('NodeIndicator', () => {
  function Selector({ pick }: { pick: 'first-child' | 'root' }) {
    const { actions, query } = useEditor();
    useEffect(() => {
      const id = pick === 'root' ? ROOT_NODE : query.node(ROOT_NODE).get().data.nodes[0];
      if (id) actions.selectNode(id);
    }, [actions, query, pick]);
    return null;
  }

  it('draws a selected outline for a block but never for the root', async () => {
    render(
      <Editor resolver={resolver} onRender={NodeIndicator}>
        <StageProvider>
          <Frame>
            <Element is={LayoutBox} canvas>
              <Button label="Pick me" />
            </Element>
          </Frame>
          <Selector pick="first-child" />
        </StageProvider>
      </Editor>,
    );
    await screen.findByRole('button', { name: 'Pick me' });
    const outline = await screen.findByTestId('selection-outline');
    expect(outline).toHaveAttribute('data-weight', 'selected');
    expect(outline).toHaveTextContent('Button');
  });

  it('draws nothing when only the root is selected', async () => {
    render(
      <Editor resolver={resolver} onRender={NodeIndicator}>
        <StageProvider>
          <Frame>
            <Element is={LayoutBox} canvas>
              <Button label="Alone" />
            </Element>
          </Frame>
          <Selector pick="root" />
        </StageProvider>
      </Editor>,
    );
    await screen.findByRole('button', { name: 'Alone' });
    await waitFor(() => expect(screen.queryByTestId('selection-outline')).toBeNull());
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/workbench/selection.test.tsx components/workbench/node-indicator.test.tsx`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement the selection helpers**

Create `components/workbench/selection.tsx`:
```tsx
'use client';

import { ROOT_NODE, useEditor, type EditorState } from '@craftjs/core';
import { useEffect } from 'react';
import { ZONE_TYPES } from '@/components/blocks/registry';

export function selectedIdFrom(state: EditorState): string | null {
  const [first] = state.events.selected;
  return first ?? null;
}

export interface SelectedNode {
  id: string | null;
  type: string | null;
  parentId: string | null;
  isRoot: boolean;
  isZone: boolean;
}

export function useSelectedNode(): SelectedNode {
  const { id, type, parentId } = useEditor((state) => {
    const selectedId = selectedIdFrom(state);
    const node = selectedId ? state.nodes[selectedId] : null;
    return {
      id: node ? selectedId : null,
      type: node ? node.data.name : null,
      parentId: node ? (node.data.parent ?? null) : null,
    };
  });
  return {
    id,
    type,
    parentId,
    isRoot: id === ROOT_NODE,
    isZone: type !== null && ZONE_TYPES.has(type),
  };
}

export function useZoneRedirect(): void {
  const { actions } = useEditor();
  const { isZone, parentId } = useSelectedNode();
  useEffect(() => {
    if (isZone && parentId) actions.selectNode(parentId);
  }, [actions, isZone, parentId]);
}
```

- [ ] **Step 4: Implement the overlay**

Create `components/workbench/node-indicator.tsx`:
```tsx
'use client';

import { ROOT_NODE, useEditor, useNode } from '@craftjs/core';
import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { ZONE_TYPES } from '@/components/blocks/registry';
import { cn } from '@/lib/utils';

export type OutlineWeight = 'hover' | 'selected';

export function SelectionOutline({
  rect,
  color,
  label,
  weight,
}: {
  rect: Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;
  color: string;
  label: string;
  weight: OutlineWeight;
}) {
  return (
    <div
      data-testid="selection-outline"
      data-weight={weight}
      aria-hidden
      className={cn(
        'pointer-events-none fixed z-50',
        weight === 'selected' ? 'outline-2' : 'outline-1 opacity-60',
      )}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        outlineStyle: 'solid',
        outlineColor: color,
        outlineOffset: weight === 'selected' ? -2 : -1,
      }}
    >
      {weight === 'selected' && (
        <span
          className="absolute top-0 left-0 -translate-y-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white uppercase"
          style={{ backgroundColor: color === 'var(--acc)' ? 'var(--primary)' : color }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function NodeIndicator({ render }: { render: ReactElement }) {
  const { id, dom, name, isHovered } = useNode((node) => ({
    dom: node.dom,
    name: node.data.name,
    isHovered: node.events.hovered,
  }));
  const { isSelected } = useEditor((state) => ({
    isSelected: state.events.selected.has(id),
  }));
  const [rect, setRect] = useState<DOMRect | null>(null);

  const isRoot = id === ROOT_NODE;
  const isZone = ZONE_TYPES.has(name);
  const active = !isRoot && !isZone && (isSelected || isHovered);

  useEffect(() => {
    if (!dom || !active) {
      setRect(null);
      return;
    }
    const update = () => setRect(dom.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dom);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [dom, active]);

  return (
    <>
      {render}
      {rect &&
        active &&
        createPortal(
          <SelectionOutline
            rect={rect}
            color="var(--acc)"
            label={name}
            weight={isSelected ? 'selected' : 'hover'}
          />,
          document.body,
        )}
    </>
  );
}
```

In `components/workbench/workbench.tsx`:
- add `import { NodeIndicator } from './node-indicator';` and `import { useZoneRedirect } from './selection';`
- change the `<Editor ...>` opening tag to `<Editor resolver={resolver} onRender={NodeIndicator} indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}>`
- split the shell into an inner component so hooks can use the editor context. Replace the body of `Workbench` with:
```tsx
export function Workbench() {
  const [initialLayout] = useState(() => emptyLayoutJson());

  return (
    <Editor
      resolver={resolver}
      onRender={NodeIndicator}
      indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}
    >
      <StageProvider>
        <WorkbenchShell initialLayout={initialLayout} />
      </StageProvider>
    </Editor>
  );
}

function WorkbenchShell({ initialLayout }: { initialLayout: string }) {
  useZoneRedirect();

  return (
    <div className="grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3">
      <Topbar onNew={() => {}} />
      <ComponentTray />
      <Stage data={initialLayout} />
      <aside className={PANEL} />
    </div>
  );
}
```

- [ ] **Step 5: Run to see them pass**

Run: `npx vitest run components/workbench`
Expected: all pass. The overlay test relies on jsdom's `getBoundingClientRect` returning zeros, which is fine: the outline exists, its numbers are not asserted there.

- [ ] **Step 6: Check in the browser, then commit**

`npx tsc --noEmit && npm run lint` (exit 0). In the browser: hovering a block draws the thin indigo outline; clicking draws the 2 px outline with the uppercase name tag; the root and the Card's content area never get one; clicking inside a Card's empty content area selects the Card; clicking the dark canvas clears it. The outline stays put while scrolling the stage column and after resizing the artboard.
```bash
git add components/workbench
git commit -m "$(cat <<'EOF'
Add hover and selection outlines and redirect zone clicks to their block

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Keyboard shortcuts

Spec: section 4.9.

**Files:**
- Create: `components/workbench/keyboard.tsx`, `components/workbench/keyboard.test.tsx`
- Modify: `components/workbench/workbench.tsx`

**Interfaces:**
- Consumes: `useSelectedNode` (Task 14).
- Produces: `useWorkbenchKeyboard(): void`, `isEditableTarget(target: EventTarget | null): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `components/workbench/keyboard.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { isEditableTarget, useWorkbenchKeyboard } from './keyboard';

function Keys() {
  useWorkbenchKeyboard();
  return <input aria-label="typing" />;
}

function mount() {
  const utils = renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          <Button label="Doomed" />
        </Element>
      </Frame>
      <Keys />
    </>,
  );
  return utils;
}

describe('isEditableTarget', () => {
  it('is true for inputs, textareas, selects and contenteditable', () => {
    render(
      <div>
        <input aria-label="i" />
        <textarea aria-label="t" />
        <select aria-label="s" />
        <div contentEditable data-testid="c" />
        <p data-testid="p">text</p>
      </div>,
    );
    expect(isEditableTarget(screen.getByLabelText('i'))).toBe(true);
    expect(isEditableTarget(screen.getByLabelText('t'))).toBe(true);
    expect(isEditableTarget(screen.getByLabelText('s'))).toBe(true);
    expect(isEditableTarget(screen.getByTestId('c'))).toBe(true);
    expect(isEditableTarget(screen.getByTestId('p'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('useWorkbenchKeyboard', () => {
  it('deletes the selected block with Delete and Backspace, never the root', async () => {
    const { editor } = mount();
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];

    editor().actions.selectNode(ROOT_NODE);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(ROOT_NODE)).toBe(true));
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Doomed' })).toBeInTheDocument();

    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));
    fireEvent.keyDown(window, { key: 'Backspace' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Doomed' })).toBeNull());
  });

  it('ignores Delete while typing in a field', async () => {
    const { editor } = mount();
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(screen.getByLabelText('typing'), { key: 'Delete' });
    expect(screen.getByRole('button', { name: 'Doomed' })).toBeInTheDocument();
  });

  it('deselects with Escape and undoes with Cmd+Z', async () => {
    const { editor } = mount();
    await screen.findByRole('button', { name: 'Doomed' });
    const buttonId = editor().query.node(ROOT_NODE).get().data.nodes[0];
    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(false));

    editor().actions.selectNode(buttonId);
    await waitFor(() => expect(editor().query.getEvent('selected').contains(buttonId)).toBe(true));
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Doomed' })).toBeNull());

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(await screen.findByRole('button', { name: 'Doomed' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Doomed' })).toBeNull());
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/workbench/keyboard.test.tsx`
Expected: FAIL, "Failed to resolve import './keyboard'".

- [ ] **Step 3: Implement**

Create `components/workbench/keyboard.tsx`:
```tsx
'use client';

import { useEditor } from '@craftjs/core';
import { useEffect } from 'react';
import { useSelectedNode } from './selection';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  return target.isContentEditable || target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

export function useWorkbenchKeyboard(): void {
  const { actions, query } = useEditor();
  const { id, isRoot, isZone } = useSelectedNode();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          if (query.history.canRedo()) actions.history.redo();
        } else if (query.history.canUndo()) {
          actions.history.undo();
        }
        return;
      }

      if (event.key === 'Escape') {
        actions.selectNode();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && id && !isRoot && !isZone) {
        event.preventDefault();
        actions.delete(id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, query, id, isRoot, isZone]);
}
```

In `components/workbench/workbench.tsx`, add `import { useWorkbenchKeyboard } from './keyboard';` and call `useWorkbenchKeyboard();` right after `useZoneRedirect();` inside `WorkbenchShell`.

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run components/workbench/keyboard.test.tsx`
Expected: `4 passed`. `contentEditable` in jsdom: if the `isContentEditable` assertion fails, jsdom does not compute it; the `closest(...)` fallback in the implementation covers it, so check the test renders `contentEditable` as the literal attribute (`contentEditable="true"`).

- [ ] **Step 5: Check in the browser, then commit**

`npx tsc --noEmit && npm run lint` (exit 0). In the browser: select a block, press Delete, it is gone; Cmd+Z brings it back; Shift+Cmd+Z removes it again; Escape clears the outline; with the root selected Delete does nothing.
```bash
git add components/workbench/keyboard.tsx components/workbench/keyboard.test.tsx components/workbench/workbench.tsx
git commit -m "$(cat <<'EOF'
Add Delete, Escape and undo/redo keyboard shortcuts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Inspector

Spec: section 4.8.

**Files:**
- Create: `components/workbench/inspector/field.tsx`, `components/workbench/inspector/breadcrumb.tsx`, `components/workbench/inspector/inspector.tsx`, `components/workbench/inspector/field.test.tsx`, `components/workbench/inspector/inspector.test.tsx`
- Modify: `components/workbench/workbench.tsx`

**Interfaces:**
- Consumes: `FieldSchema`, `FieldOption`, `SectionName` (Task 8); `schemaFor`, `ZONE_TYPES` (Task 13); `useSelectedNode` (Task 14); `useStage` (Task 7); `resolve`, `isResponsive`, `otherBreakpoint`, `Breakpoint`, `Responsive` (Task 4); chrome constants (Task 3); shadcn `Badge`, `Button`, `Input`, `Label`, `Select*`, `Switch`, `ToggleGroup*`, `Breadcrumb*`.
- Produces:
  - `Field({ field, value, breakpoint, onChange, onJumpToBreakpoint? })` where `onChange` receives the complete new prop value (for responsive props, the rebuilt `{ mobile, desktop }` object). Each field's wrapper carries `data-field="<prop>"`; the responsive caption is a button with `data-testid="breakpoint-caption"`.
  - `NodeBreadcrumb({ nodeId })`
  - `Inspector()`; the aside has `aria-label="Inspector"`.

- [ ] **Step 1: Write the failing tests**

Create `components/workbench/inspector/field.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FieldSchema } from '@/components/blocks/schema';
import { Field } from './field';

const direction: FieldSchema = {
  prop: 'direction',
  label: 'Direction',
  kind: 'select',
  section: 'Layout',
  responsive: true,
  options: [
    { value: 'row', label: 'Row' },
    { value: 'column', label: 'Column' },
  ],
};

describe('Field', () => {
  it('renders a text field and reports every keystroke', async () => {
    const onChange = vi.fn();
    render(
      <Field
        field={{ prop: 'label', label: 'Label', kind: 'text', section: 'Content' }}
        value="Hi"
        breakpoint="desktop"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Label');
    expect(input).toHaveValue('Hi');
    await userEvent.type(input, '!');
    expect(onChange).toHaveBeenLastCalledWith('Hi!');
  });

  it('renders a switch for booleans', async () => {
    const onChange = vi.fn();
    render(
      <Field
        field={{ prop: 'disabled', label: 'Disabled', kind: 'boolean', section: 'Style' }}
        value={false}
        breakpoint="desktop"
        onChange={onChange}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Disabled' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('renders up to three options as a segmented control and keeps numeric values numeric', async () => {
    const onChange = vi.fn();
    render(
      <Field
        field={{
          prop: 'columns',
          label: 'Columns',
          kind: 'select',
          section: 'Layout',
          options: [
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3' },
          ],
        }}
        value={1}
        breakpoint="desktop"
        onChange={onChange}
      />,
    );
    expect(screen.getByText('1').closest('button')).toHaveAttribute('data-state', 'on');
    await userEvent.click(screen.getByText('3'));
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('renders four or more options as a select showing the current label', () => {
    render(
      <Field
        field={{
          prop: 'variant',
          label: 'Variant',
          kind: 'select',
          section: 'Style',
          options: [
            { value: 'default', label: 'Default' },
            { value: 'destructive', label: 'Destructive' },
            { value: 'outline', label: 'Outline' },
            { value: 'secondary', label: 'Secondary' },
          ],
        }}
        value="outline"
        breakpoint="desktop"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Variant' })).toHaveTextContent('Outline');
  });

  it('edits the current breakpoint of a responsive value and shows the other one', async () => {
    const onChange = vi.fn();
    const jump = vi.fn();
    render(
      <Field
        field={direction}
        value={{ mobile: 'column', desktop: 'row' }}
        breakpoint="mobile"
        onChange={onChange}
        onJumpToBreakpoint={jump}
      />,
    );
    expect(screen.getByText('mobile')).toBeInTheDocument();
    expect(screen.getByText('Column').closest('button')).toHaveAttribute('data-state', 'on');
    const caption = screen.getByTestId('breakpoint-caption');
    expect(caption).toHaveTextContent('desktop: row');

    await userEvent.click(screen.getByText('Row'));
    expect(onChange).toHaveBeenLastCalledWith({ mobile: 'row', desktop: 'row' });

    await userEvent.click(caption);
    expect(jump).toHaveBeenCalledWith('desktop');
  });

  it('falls back to the mobile value when desktop is unset', () => {
    render(
      <Field field={direction} value={{ mobile: 'column' }} breakpoint="desktop" onChange={() => {}} />,
    );
    expect(screen.getByText('Column').closest('button')).toHaveAttribute('data-state', 'on');
    expect(screen.getByTestId('breakpoint-caption')).toHaveTextContent('mobile: column');
  });
});
```

Create `components/workbench/inspector/inspector.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Element, Frame, ROOT_NODE } from '@craftjs/core';
import { Button } from '@/components/blocks/button';
import { Card } from '@/components/blocks/card';
import { LayoutBox } from '@/components/blocks/layout-box';
import { renderInEditor } from '@/test/craft-harness';
import { useStage } from '../stage-context';
import { Inspector } from './inspector';

function WidthProbe() {
  return <output data-testid="width">{useStage().width}</output>;
}

function mount(width = 1440) {
  return renderInEditor(
    <>
      <Frame>
        <Element is={LayoutBox} canvas>
          <Card title="Billing" />
          <Button label="Pay" />
        </Element>
      </Frame>
      <Inspector />
      <WidthProbe />
    </>,
    { width },
  );
}

async function select(editor: ReturnType<typeof mount>['editor'], pick: 'root' | 'card' | 'button') {
  const nodes = editor().query.node(ROOT_NODE).get().data.nodes;
  const id = pick === 'root' ? ROOT_NODE : pick === 'card' ? nodes[0] : nodes[1];
  act(() => editor().actions.selectNode(id));
  await waitFor(() => expect(editor().query.getEvent('selected').contains(id)).toBe(true));
  return id;
}

describe('Inspector', () => {
  it('shows the empty state when nothing is selected', async () => {
    mount();
    await screen.findByText('Billing');
    const panel = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(panel).getByText('Nothing selected')).toBeInTheDocument();
    expect(within(panel).getByText('Click a component on the stage to edit it.')).toBeInTheDocument();
  });

  it('builds the fields for a selected Button from its schema and edits them', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    const buttonId = await select(editor, 'button');
    const panel = screen.getByRole('complementary', { name: 'Inspector' });

    expect(within(panel).getByTestId('inspector-type')).toHaveTextContent('Button');
    expect(within(panel).getByText('Stage')).toBeInTheDocument();
    for (const section of ['Layout', 'Content', 'Style']) {
      expect(within(panel).getByRole('heading', { name: section })).toBeInTheDocument();
    }
    expect(within(panel).queryByRole('heading', { name: 'Editor' })).toBeNull();

    const label = within(panel).getByLabelText('Label');
    expect(label).toHaveValue('Pay');
    await userEvent.clear(label);
    await userEvent.type(label, 'Checkout');
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.label).toBe('Checkout'));

    await userEvent.click(within(panel).getByText('Small'));
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.size).toBe('sm'));

    await userEvent.click(within(panel).getByRole('switch', { name: 'Grow to fill' }));
    await waitFor(() => expect(editor().query.node(buttonId).get().data.props.grow).toBe(true));

    expect(within(panel).getByRole('combobox', { name: 'Variant' })).toHaveTextContent('Default');
  });

  it('edits the current breakpoint of a LayoutBox and jumps to the other one', async () => {
    const { editor } = mount(375);
    await screen.findByText('Billing');
    await select(editor, 'root');
    const panel = screen.getByRole('complementary', { name: 'Inspector' });

    const direction = within(panel).getByText('Direction').closest('[data-field]') as HTMLElement;
    expect(within(direction).getByText('mobile')).toBeInTheDocument();
    expect(within(direction).getByTestId('breakpoint-caption')).toHaveTextContent('desktop: column');

    await userEvent.click(within(direction).getByText('Row'));
    await waitFor(() =>
      expect(editor().query.node(ROOT_NODE).get().data.props.direction).toEqual({
        mobile: 'row',
        desktop: 'column',
      }),
    );

    await userEvent.click(within(direction).getByTestId('breakpoint-caption'));
    await waitFor(() => expect(screen.getByTestId('width')).toHaveTextContent('1440'));
  });

  it('hides Grow and Delete for the root and counts a container\'s children', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    await select(editor, 'root');
    const panel = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(panel).queryByRole('switch', { name: 'Grow to fill' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(panel).getByText('2 items')).toBeInTheDocument();

    await select(editor, 'card');
    expect(within(panel).getByText('0 items')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('deletes the selected block', async () => {
    const { editor } = mount();
    await screen.findByText('Billing');
    await select(editor, 'button');
    const panel = screen.getByRole('complementary', { name: 'Inspector' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pay' })).toBeNull());
    expect(within(panel).getByText('Nothing selected')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run components/workbench/inspector`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement the field control**

Create `components/workbench/inspector/field.tsx`:
```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FieldOption, FieldSchema } from '@/components/blocks/schema';
import {
  type Breakpoint,
  type Responsive,
  isResponsive,
  otherBreakpoint,
  resolve,
} from '@/lib/responsive';
import { cn } from '@/lib/utils';
import { CHIP, CHIP_INPUT, LABEL, SEG_GROUP, SEG_ITEM } from '../chrome';

export interface FieldProps {
  field: FieldSchema;
  value: unknown;
  breakpoint: Breakpoint;
  onChange: (next: unknown) => void;
  onJumpToBreakpoint?: (breakpoint: Breakpoint) => void;
}

function optionFor(options: readonly FieldOption[], raw: string): FieldOption | undefined {
  return options.find((option) => String(option.value) === raw);
}

export function Field({ field, value, breakpoint, onChange, onJumpToBreakpoint }: FieldProps) {
  const responsive = field.responsive === true;
  const current = responsive ? resolve(value as Responsive<unknown>, breakpoint) : value;
  const other =
    responsive && isResponsive<unknown>(value)
      ? (value[otherBreakpoint(breakpoint)] ?? value.mobile)
      : undefined;

  const commit = (next: unknown) => {
    if (!responsive) {
      onChange(next);
      return;
    }
    const base = isResponsive<unknown>(value) ? value : { mobile: current };
    onChange({ ...base, [breakpoint]: next });
  };

  const id = `field-${field.prop}`;
  const labelRow = (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className={LABEL}>
        {field.label}
      </Label>
      {responsive && (
        <Badge variant="outline" className="h-4 px-1 font-mono text-[9px] uppercase">
          {breakpoint}
        </Badge>
      )}
    </div>
  );
  const caption =
    responsive && other !== undefined ? (
      <button
        type="button"
        data-testid="breakpoint-caption"
        className="self-start font-mono text-[10.5px] text-muted-foreground hover:text-foreground"
        onClick={() => onJumpToBreakpoint?.(otherBreakpoint(breakpoint))}
      >
        {otherBreakpoint(breakpoint)}: {String(other)}
      </button>
    ) : null;

  if (field.kind === 'boolean') {
    return (
      <div data-field={field.prop} className="flex items-center justify-between gap-3">
        {labelRow}
        <Switch id={id} checked={Boolean(current)} onCheckedChange={(checked) => commit(checked)} />
      </div>
    );
  }

  if (field.kind === 'text') {
    return (
      <div data-field={field.prop} className="flex flex-col gap-1.5">
        {labelRow}
        <div className={CHIP}>
          <Input
            id={id}
            value={String(current ?? '')}
            onChange={(event) => commit(event.target.value)}
            className={CHIP_INPUT}
          />
        </div>
        {caption}
      </div>
    );
  }

  const options = field.options ?? [];
  const selected = String(current);

  if (options.length <= 3) {
    return (
      <div data-field={field.prop} className="flex flex-col gap-1.5">
        {labelRow}
        <ToggleGroup
          type="single"
          id={id}
          aria-label={field.label}
          value={selected}
          onValueChange={(raw) => {
            const option = optionFor(options, raw);
            if (option) commit(option.value);
          }}
          className={SEG_GROUP}
        >
          {options.map((option) => (
            <ToggleGroupItem key={String(option.value)} value={String(option.value)} className={SEG_ITEM}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {caption}
      </div>
    );
  }

  return (
    <div data-field={field.prop} className="flex flex-col gap-1.5">
      {labelRow}
      <Select
        value={selected}
        onValueChange={(raw) => {
          const option = optionFor(options, raw);
          if (option) commit(option.value);
        }}
      >
        <SelectTrigger
          id={id}
          size="sm"
          aria-label={field.label}
          className={cn(CHIP, 'w-full font-mono text-[12.5px] font-medium text-foreground')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {caption}
    </div>
  );
}
```

- [ ] **Step 4: Implement the breadcrumb**

Create `components/workbench/inspector/breadcrumb.tsx`:
```tsx
'use client';

import { ROOT_NODE, useEditor } from '@craftjs/core';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ZONE_TYPES } from '@/components/blocks/registry';

function crumbName(id: string, name: string): string {
  return id === ROOT_NODE ? 'Stage' : name;
}

export function NodeBreadcrumb({ nodeId }: { nodeId: string }) {
  const { actions, trail, current } = useEditor((state, query) => {
    const ancestors = query
      .node(nodeId)
      .ancestors(true)
      .filter((id) => !ZONE_TYPES.has(state.nodes[id].data.name))
      .reverse();
    return {
      trail: ancestors.map((id) => ({ id, name: crumbName(id, state.nodes[id].data.name) })),
      current: crumbName(nodeId, state.nodes[nodeId]?.data.name ?? ''),
    };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1 font-mono text-[10.5px] sm:gap-1">
        {trail.map((crumb) => (
          <Fragment key={crumb.id}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <button type="button" onClick={() => actions.selectNode(crumb.id)}>
                  {crumb.name}
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage className="font-mono text-[10.5px]">{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```
Craft's `ancestors(true)` is expected to return the parent first and the root last, hence the `.reverse()`. If the inspector test's breadcrumb assertions show the order root-last, remove the `.reverse()`.

- [ ] **Step 5: Implement the inspector**

Create `components/workbench/inspector/inspector.tsx`:
```tsx
'use client';

import { useEditor } from '@craftjs/core';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { schemaFor } from '@/components/blocks/registry';
import type { SectionName } from '@/components/blocks/schema';
import type { Breakpoint } from '@/lib/responsive';
import { cn } from '@/lib/utils';
import {
  DANGER_GHOST,
  EMPTY,
  EMPTY_TITLE,
  PANEL,
  PANEL_HEADER,
  PANEL_TITLE,
  SECTION,
  SECTION_TITLE,
} from '../chrome';
import { useSelectedNode } from '../selection';
import { useStage } from '../stage-context';
import { NodeBreadcrumb } from './breadcrumb';
import { Field } from './field';

const SECTION_ORDER: SectionName[] = ['Layout', 'Content', 'Style', 'Editor'];
const CONTAINER_TYPES = new Set(['LayoutBox', 'Card', 'Dialog']);

export function Inspector() {
  const { id, type, isRoot } = useSelectedNode();
  const { breakpoint, setPreset } = useStage();
  const { actions, props, childCount } = useEditor((state) => {
    const node = id ? state.nodes[id] : null;
    const zoneId = node?.data.linkedNodes?.content;
    const container = zoneId ? state.nodes[zoneId] : node;
    return {
      props: node ? (node.data.props as Record<string, unknown>) : null,
      childCount: container ? container.data.nodes.length : 0,
    };
  });
  const schema = type ? schemaFor(type) : null;

  const jump = (target: Breakpoint) => setPreset(target === 'mobile' ? 'mobile' : 'desktop');

  return (
    <aside aria-label="Inspector" className={cn(PANEL, 'flex min-h-0 flex-col')}>
      <div className={PANEL_HEADER}>
        <span className={PANEL_TITLE}>Inspector</span>
      </div>
      <div className="flex flex-col gap-3.5 overflow-y-auto p-4">
        {!id || !type || !schema || !props ? (
          <div className={EMPTY}>
            <b className={EMPTY_TITLE}>Nothing selected</b>
            Click a component on the stage to edit it.
          </div>
        ) : (
          <>
            <NodeBreadcrumb nodeId={id} />
            <div className="flex items-center gap-2">
              <span data-testid="inspector-type" className="text-[13px] font-semibold">
                {type}
              </span>
              {CONTAINER_TYPES.has(type) && (
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {childCount} {childCount === 1 ? 'item' : 'items'}
                </Badge>
              )}
            </div>
            {SECTION_ORDER.map((section) => {
              const fields = schema.fields.filter(
                (field) =>
                  field.section === section &&
                  (!field.showWhen || field.showWhen(props)) &&
                  !(isRoot && field.prop === 'grow'),
              );
              if (fields.length === 0) return null;
              return (
                <section key={section} className={SECTION}>
                  <h3 className={SECTION_TITLE}>{section}</h3>
                  <div className="flex flex-col gap-3">
                    {fields.map((field) => (
                      <Field
                        key={field.prop}
                        field={field}
                        value={props[field.prop]}
                        breakpoint={breakpoint}
                        onJumpToBreakpoint={jump}
                        onChange={(next) => {
                          const setter = (draft: Record<string, unknown>) => {
                            draft[field.prop] = next;
                          };
                          if (field.kind === 'text') actions.history.throttle(500).setProp(id, setter);
                          else actions.setProp(id, setter);
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {!isRoot && (
              <Button
                variant="ghost"
                size="sm"
                className={cn('mt-2 self-start', DANGER_GHOST)}
                onClick={() => actions.delete(id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
```

In `components/workbench/workbench.tsx`, add `import { Inspector } from './inspector/inspector';`, replace `<aside className={PANEL} />` with `<Inspector />`, and remove the now-unused `PANEL` import.

- [ ] **Step 6: Run to see them pass**

Run: `npx vitest run components/workbench`
Expected: all pass. Two likely adjustments: if `getByRole('complementary', { name: 'Inspector' })` finds nothing, the installed jsdom maps `aside` differently; query `screen.getByLabelText('Inspector')` instead. If `history.throttle` is typed without an argument in the installed Craft.js, call `actions.history.throttle().setProp(...)`.

- [ ] **Step 7: Check in the browser, then commit**

`npx tsc --noEmit && npm run lint` (exit 0). In the browser: select a Button; the inspector shows the breadcrumb (`Stage › LayoutBox › Button`), the mono labels, the chip-styled text field, the recessed segmented Size control, the Variant select (SF2-styled menu), switches, and the red-text Delete. Edit the label: the button on the artboard updates as you type, and one Cmd+Z removes the whole word. Select a LayoutBox at Mobile: Direction shows the MOBILE badge and `desktop: row`; click the caption: the stage jumps to 1440 and the badge reads DESKTOP.
```bash
git add components/workbench
git commit -m "$(cat <<'EOF'
Add the schema-driven inspector with breakpoint-aware fields

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Persistence, reload, and New

Spec: section 4.10.

**Files:**
- Create: `lib/persistence.ts`, `lib/persistence.test.ts`, `components/workbench/new-layout-dialog.tsx`, `components/workbench/workbench.test.tsx`
- Modify: `components/workbench/workbench.tsx`

**Interfaces:**
- Consumes: `KNOWN_TYPES`, `emptyLayoutJson` (Task 13); `MIN_STAGE_WIDTH`, `MAX_STAGE_WIDTH`, `STAGE_PRESETS` (Task 5); shadcn `AlertDialog*`, `buttonVariants`.
- Produces:
  - `LAYOUT_STORAGE_KEY`, `WIDTH_STORAGE_KEY`
  - `saveLayout(json: string, storage?: Storage): void`
  - `loadLayout(knownTypes: ReadonlySet<string>, storage?: Storage): string | null`
  - `saveStageWidth(width: number, storage?: Storage): void`, `loadStageWidth(storage?: Storage): number | null`
  - `debounce(fn, ms)` returning a function with `flush()` and `cancel()`
  - `NewLayoutDialog({ open, onOpenChange, onConfirm })`

- [ ] **Step 1: Write the failing tests**

Create `lib/persistence.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAYOUT_STORAGE_KEY,
  WIDTH_STORAGE_KEY,
  debounce,
  loadLayout,
  loadStageWidth,
  saveLayout,
  saveStageWidth,
} from './persistence';

const KNOWN = new Set(['LayoutBox', 'Button']);
const GOOD = JSON.stringify({
  ROOT: { type: { resolvedName: 'LayoutBox' }, nodes: ['b1'], parent: null },
  b1: { type: { resolvedName: 'Button' }, nodes: [], parent: 'ROOT' },
});

describe('layout persistence', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    localStorage.clear();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('round-trips a valid layout', () => {
    saveLayout(GOOD);
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe(GOOD);
    expect(loadLayout(KNOWN)).toBe(GOOD);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns null when nothing is saved, without warning', () => {
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects corrupt JSON with a warning', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{not json');
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a layout with no ROOT', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ x: {} }));
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a layout that names an unknown block', () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ ROOT: { type: { resolvedName: 'Carousel' }, nodes: [], parent: null } }),
    );
    expect(loadLayout(KNOWN)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Carousel'));
  });
});

describe('stage width persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips and rounds', () => {
    saveStageWidth(1023.6);
    expect(localStorage.getItem(WIDTH_STORAGE_KEY)).toBe('1023.6');
    expect(loadStageWidth()).toBe(1024);
  });

  it('rejects missing, non-numeric and out-of-range values', () => {
    expect(loadStageWidth()).toBeNull();
    localStorage.setItem(WIDTH_STORAGE_KEY, 'wide');
    expect(loadStageWidth()).toBeNull();
    localStorage.setItem(WIDTH_STORAGE_KEY, '10');
    expect(loadStageWidth()).toBeNull();
    localStorage.setItem(WIDTH_STORAGE_KEY, '5000');
    expect(loadStageWidth()).toBeNull();
  });
});

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls once with the last arguments after the delay, and flush runs it now', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 500);
    debounced('a');
    debounced('b');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');

    debounced('c');
    debounced.flush();
    expect(fn).toHaveBeenLastCalledWith('c');
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(2);

    debounced('d');
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
```

Create `components/workbench/workbench.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LAYOUT_STORAGE_KEY, WIDTH_STORAGE_KEY } from '@/lib/persistence';
import { Workbench } from './workbench';

const SAVED = JSON.stringify({
  ROOT: {
    type: { resolvedName: 'LayoutBox' },
    isCanvas: true,
    props: { mode: 'flex', direction: { mobile: 'column', desktop: 'column' }, columns: { mobile: 1, desktop: 3 }, align: { mobile: 'stretch', desktop: 'stretch' }, justify: { mobile: 'start', desktop: 'start' }, gap: 4, padding: 6, background: 'none', grow: false },
    displayName: 'LayoutBox',
    custom: {},
    hidden: false,
    nodes: ['btn1'],
    linkedNodes: {},
    parent: null,
  },
  btn1: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Restored', variant: 'default', size: 'default', disabled: false, grow: false },
    displayName: 'Button',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
});

describe('Workbench persistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('restores the saved layout and width', async () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, SAVED);
    localStorage.setItem(WIDTH_STORAGE_KEY, '768');
    render(<Workbench />);
    expect(await screen.findByRole('button', { name: 'Restored' })).toBeInTheDocument();
    expect(screen.getByTestId('stage-readout')).toHaveTextContent('768 px · desktop');
  });

  it('starts empty when the saved layout is unusable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{');
    render(<Workbench />);
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
  });

  it('saves after a change and clears the stage through New', async () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, SAVED);
    render(<Workbench />);
    await screen.findByRole('button', { name: 'Restored' });

    await userEvent.click(screen.getByRole('button', { name: 'New layout' }));
    expect(await screen.findByText('Start a new layout?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Start a new layout?')).toBeNull());
    expect(screen.getByRole('button', { name: 'Restored' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New layout' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Clear stage' }));
    expect(await screen.findByText('Nothing on the stage yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await waitFor(
      () => expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).not.toContain('Restored'),
      { timeout: 1500 },
    );
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/persistence.test.ts components/workbench/workbench.test.tsx`
Expected: FAIL, unresolved import for `./persistence`; the workbench tests fail on the missing readout text and dialog.

- [ ] **Step 3: Implement persistence**

Create `lib/persistence.ts`:
```ts
import { MAX_STAGE_WIDTH, MIN_STAGE_WIDTH } from './stage';

export const LAYOUT_STORAGE_KEY = 'assembly-workbench:layout:v1';
export const WIDTH_STORAGE_KEY = 'assembly-workbench:stage-width';

type SerializedNodeLike = { type?: { resolvedName?: string } | string };

export function saveLayout(json: string, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(LAYOUT_STORAGE_KEY, json);
  } catch (error) {
    console.warn('Could not save the layout.', error);
  }
}

export function loadLayout(
  knownTypes: ReadonlySet<string>,
  storage: Storage = window.localStorage,
): string | null {
  let raw: string | null;
  try {
    raw = storage.getItem(LAYOUT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('Saved layout is not valid JSON; starting empty.');
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !('ROOT' in parsed)) {
    console.warn('Saved layout has no ROOT node; starting empty.');
    return null;
  }
  for (const [id, node] of Object.entries(parsed as Record<string, SerializedNodeLike>)) {
    const name = typeof node?.type === 'string' ? node.type : node?.type?.resolvedName;
    if (!name || !knownTypes.has(name)) {
      console.warn(`Saved layout uses an unknown block "${name}" (node ${id}); starting empty.`);
      return null;
    }
  }
  return raw;
}

export function saveStageWidth(width: number, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch (error) {
    console.warn('Could not save the stage width.', error);
  }
}

export function loadStageWidth(storage: Storage = window.localStorage): number | null {
  try {
    const raw = storage.getItem(WIDTH_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < MIN_STAGE_WIDTH || value > MAX_STAGE_WIDTH) return null;
    return Math.round(value);
  } catch {
    return null;
  }
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const run = () => {
    timer = null;
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };

  const debounced = (...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  debounced.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return debounced;
}
```

- [ ] **Step 4: Implement the New dialog**

Create `components/workbench/new-layout-dialog.tsx`:
```tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

export function NewLayoutDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new layout?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears everything on the stage. Undo will not bring it back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={onConfirm}>
            Clear stage
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Wire persistence and New into the workbench**

Replace `components/workbench/workbench.tsx` with:
```tsx
'use client';

import { Editor, useEditor } from '@craftjs/core';
import { useEffect, useMemo, useState } from 'react';
import { KNOWN_TYPES, emptyLayoutJson, resolver } from '@/components/blocks/registry';
import { debounce, loadLayout, loadStageWidth, saveLayout, saveStageWidth } from '@/lib/persistence';
import { STAGE_PRESETS } from '@/lib/stage';
import { ComponentTray } from './component-tray';
import { Inspector } from './inspector/inspector';
import { useWorkbenchKeyboard } from './keyboard';
import { NewLayoutDialog } from './new-layout-dialog';
import { NodeIndicator } from './node-indicator';
import { useZoneRedirect } from './selection';
import { Stage } from './stage';
import { StageProvider } from './stage-context';
import { Topbar } from './topbar';

export function Workbench() {
  const [initialLayout] = useState(() => loadLayout(KNOWN_TYPES) ?? emptyLayoutJson());
  const [initialWidth] = useState(() => loadStageWidth() ?? STAGE_PRESETS.desktop);
  const save = useMemo(() => debounce((json: string) => saveLayout(json), 500), []);

  useEffect(() => () => save.flush(), [save]);

  return (
    <Editor
      resolver={resolver}
      onRender={NodeIndicator}
      indicator={{ success: 'var(--acc)', error: 'var(--bad)' }}
      onNodesChange={(query) => save(query.serialize())}
    >
      <StageProvider initialWidth={initialWidth} onWidthChange={saveStageWidth}>
        <WorkbenchShell initialLayout={initialLayout} />
      </StageProvider>
    </Editor>
  );
}

function WorkbenchShell({ initialLayout }: { initialLayout: string }) {
  useZoneRedirect();
  useWorkbenchKeyboard();
  const { actions } = useEditor();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="grid h-screen grid-cols-[280px_1fr_320px] grid-rows-[auto_1fr] gap-3 bg-background p-3">
      <Topbar onNew={() => setNewOpen(true)} />
      <ComponentTray />
      <Stage data={initialLayout} />
      <Inspector />
      <NewLayoutDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onConfirm={() => {
          actions.selectNode();
          actions.deserialize(emptyLayoutJson());
          actions.history.clear();
        }}
      />
    </div>
  );
}
```
If TypeScript reports that `actions.history.clear` does not exist in the installed Craft.js, replace the two lines `actions.deserialize(...)` and `actions.history.clear()` with `actions.history.ignore().deserialize(emptyLayoutJson());` and change the workbench test's `Undo` assertion to `toBeEnabled()`; then also change the dialog copy in `new-layout-dialog.tsx` to "This clears everything on the stage." and update the spec's 4.10 to match.

- [ ] **Step 6: Run to see them pass**

Run: `npm test`
Expected: all pass. The last workbench test waits up to 1.5 s for the debounced save; do not use fake timers there, Craft's own effects need real ones.

- [ ] **Step 7: Check in the browser, then commit**

`npx tsc --noEmit && npm run lint` (exit 0). In the browser: build a small layout, set the width to 768, reload: everything comes back at 768. Click New: the SF2-styled confirm appears; Escape and clicking the overlay cancel; Clear stage empties the artboard and Undo stays dimmed. Open DevTools Application storage: the two keys exist.
```bash
git add lib/persistence.ts lib/persistence.test.ts components/workbench
git commit -m "$(cat <<'EOF'
Persist the layout and stage width, and add New with a confirm

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Final verification against the spec

Spec: section 7 (the whole checklist), section 9.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-foundation-design.md` (status line only, and any fallbacks that were taken)

- [ ] **Step 1: Full checks**

Run:
```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all four exit 0; the build reports no warnings.

- [ ] **Step 2: Walk the spec's section 7 in the browser**

Start the dev server (preview tool, config `dev`) and do every step of section 7, in order. For each, note pass or fail. Take screenshots at 375, 768 and 1440 with a layout of two Cards (one with a Button and an Input) inside a row/column Layout box, and save them to `docs/superpowers/verification/2026-09-11-foundation-{375,768,1440}.png`.

- [ ] **Step 3: Copy and styling audit**

Run:
```bash
grep -rn "—" app components lib --include=*.tsx --include=*.ts
```
Expected: no output (no em dashes in any UI string or code). Then read `components/workbench/chrome.ts` once more against `SF2-UI-DESIGN-SYSTEM-SPEC.md` sections 2, 4, 5, 7, 10.1, 10.4: every number matches the spec.

- [ ] **Step 4: Record what was done**

In the spec, change the `Status:` line to `Status: implemented 2026-09-11; verified against section 7`. If any fallback from section 8 was taken (Strict Mode off, transform instead of zoom, `history.ignore` instead of `clear`), add one sentence under section 8 saying which and why.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "$(cat <<'EOF'
Record foundation verification results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

Then report to Matt in product terms: what works, what was verified and how, any fallback taken, and the three screenshots.
