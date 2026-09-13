# Assembly Workbench: Responsive canvas

Date: 2026-09-12
Status: requested by Matt ("i want the user to be able to resize their canvas and have the coded component layout respond responsively"); runs right after the device presets (12c) and before the make-room drag placeholder, which builds on it

## 1. What it delivers

The frame on the canvas behaves like a browser window of that size. Drag any edge or corner to any width (and height), and the coded components inside reflow exactly as their own CSS says they should: grids collapse, flex rows wrap, `md:` and `lg:` styles switch on and off at the real widths, text reflows. Today only the tool's own mobile/desktop props react to the width, and only at one threshold; the components' real breakpoints never fire because they measure the browser viewport, not the frame.

## 2. Why an iframe

CSS media queries only ever measure the document viewport. The one way to make component code respond to the frame's size is to give the frame its own document: the artboard renders inside an `<iframe>` whose viewport is the frame size. Every page builder that previews real code (Webflow, Framer, Builder, Plasmic) does this. Container queries were considered and rejected: they would only work for components written with container variants, and the product's future design systems (Dream v1, Dream 2.0) will use ordinary viewport breakpoints.

The React tree stays single: the artboard content is rendered through a portal into the iframe's body, so Craft.js state, the Design and Prototype panels, selection, hover and undo keep working unchanged. Only the DOM lives in the iframe.

## 3. Behaviour

- Resize: handles on the right edge (width), the bottom edge (height) and the bottom-right corner (both), Figma style, with the current size shown in a mono readout beside the handle while dragging (`1024 × 768`). Width range 120 to 3840 px, height 120 to 8192 px or "auto" (the frame grows with its content) which is the default when no height was set. The Mobile / Tablet / Desktop buttons and the device presets set exact sizes; any manual drag clears the device name.
- Continuous response: every pixel of width is a real viewport width for the components. The tool's own mobile/desktop props keep resolving from the frame width (breakpoint derived as today).
- Zoom: the iframe is scaled with a CSS transform on its element, so fit-to-width keeps working; the readout shows the unscaled size.
- Everything that reads or listens to the artboard DOM moves inside the iframe document: the selection and hover outlines (`NodeIndicator`), the interaction tags, the drop indicator and the coming make-room placeholder, the press-and-hold layer stack menu (its pointer listeners attach to the iframe document), and keyboard shortcuts (the same handler is attached to the iframe window so shortcuts work while focus is inside the frame). Drag and drop from the Components panel into the iframe works with native HTML5 DnD across documents; Craft's connectors are attached to the real elements, which live in the iframe.
- Styles: the iframe head receives a copy of the app's stylesheets (every `link[rel=stylesheet]` and `style` in the parent head, kept in sync with a MutationObserver for HMR), the font-variable classes from the parent `html` element, `.theme-basic` on the body, and `color-scheme: light`. Nothing from the SF2 chrome leaks in: the iframe body has no chrome classes.
- Play mode keeps rendering full-page (it already is a real viewport). Present is unchanged.
- Accessibility: the iframe gets `title="Frame"`; focus moves into it when a layer is selected by pointer and out with Escape; the layers list and panels stay in the parent document.

## 4. Code

- `components/workbench/canvas-frame.tsx`: `CanvasFrame({ width, height, zoom, children })` renders the `<iframe>`, prepares its document once loaded (stylesheet sync, font classes, theme class), and portals `children` into its body. Exposes `useCanvasDocument()` for the overlays and hooks that need the iframe `document`/`window`.
- `components/workbench/stage.tsx`: the artboard becomes `CanvasFrame`; the width grip is replaced by the three resize handles; `stage-context.tsx` gains `height: number | null` and `setSize` (shared with 12c's device presets; 12c lands first, this task adapts to its API).
- `components/workbench/node-indicator.tsx`, `interaction-tag.tsx`, `layer-stack-menu.tsx`, `keyboard.tsx`: take the target document/window from `useCanvasDocument()` instead of the global `document`/`window`. The layer stack popover still renders in the parent document (it is chrome), positioned by converting iframe coordinates to parent coordinates (iframe rect plus zoom).
- `lib/stage/size.ts`: `clampSize`, `MIN_STAGE_WIDTH = 120`, `MAX_STAGE_WIDTH = 3840`, `MIN_STAGE_HEIGHT = 120`, `MAX_STAGE_HEIGHT = 8192`, `readoutFor(width, height, device, zoom)`.
- Persistence: `stageWidth`, `stageHeight` (null = auto) and `deviceName` per screen, already in the screens JSON.

## 5. Tests

- `lib/stage/size.test.ts`: clamping and readouts.
- `canvas-frame.test.tsx` (jsdom): renders an iframe, copies stylesheets and font classes into it, portals children into its body, updates the iframe size when props change, applies the zoom transform.
- `stage.test.tsx`: the three handles exist with `aria-valuemin`/`aria-valuemax`; dragging the width handle changes width and clears the device; dragging the corner changes both; the height handle sets a fixed height and a double-click on it returns to auto.
- Overlay and hook tests updated to pass a target document; keyboard shortcuts fire from a keydown dispatched in the iframe window.
- Existing Craft harness tests keep rendering blocks outside an iframe (blocks are document-agnostic).

## 6. Browser check

Production: open the Dashboard example, drag the right edge from 1440 down to 500 px: the three stat cards collapse to one column at the grid's own breakpoint, the table scrolls horizontally, text reflows; the readout follows. Pick iPhone 16 & 17 Pro from the device presets: the frame becomes 402 × 874 and the content scrolls inside. Drag a Button from the Components panel into the card: it lands where dropped. Press and hold on a nested layer: the layer stack menu opens beside the pointer. Cmd+Z with the frame focused undoes.
