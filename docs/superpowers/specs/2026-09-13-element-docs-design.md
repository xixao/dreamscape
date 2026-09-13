# Element documentation (stub)

Date: 2026-09-13. Matt: "when the component panel is visible, hovering over any item in the list shows an 'i' icon which when clicked, will show a modal like the keyboard shortcut size to display documentation on the component. for now, just stub it in."

## 1. Behaviour

- In the Elements tab, every item in the list shows an "i" (info) button at its right edge while the item is hovered or focused (keyboard users reach it with Tab; it has `aria-label="About <Element name>"`). It is invisible otherwise and never affects the item's drag behaviour: pressing it does not start a drag or insert the element.
- Clicking it opens the Element documentation dialog, sized like the Keyboard shortcuts dialog (same `DialogContent` width classes: window width minus 24 px each side, capped at 1800 px; shared through one constant in `components/workbench/chrome.ts` so the two dialogs cannot drift). Escape and the close button close it; focus returns to the "i" button.
- The dialog is SF2 chrome (`OVERLAY_TITLE`, `OVERLAY_GROUP_TITLE`, `OVERLAY_ROW_LABEL`, key-cap style for prop names) with Figma vocabulary ("Element", not "component").

## 2. Content (stub)

Left column: the element's name as the title, its group ("Layout", "Forms" ...) as a caption, a one-paragraph description, and a "Usage" paragraph. Right column: a "Properties" table generated from the element's schema (prop name in a key-cap, type or options, default value), and a "Shortcuts" line when the element has one. A muted note at the bottom: "Full documentation is coming soon." reads as the stub.

Descriptions live in a new `components/blocks/docs.ts` map keyed by tray item type (`ElementDoc = { summary: string; usage: string }`), with a test that every tray item has an entry, so a missing doc is caught when an element is added. The two paragraphs are placeholders written in plain product language (what the element is, when a designer reaches for it); nothing external is fetched.

## 3. Out of scope

Real documentation content, images or live examples in the dialog, links to the design-system source, per-variant docs. The dialog component takes the element type only, so richer content can replace the stub without touching the list.
