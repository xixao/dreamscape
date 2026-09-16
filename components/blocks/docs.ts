// Placeholder documentation for the Components tab's "i" dialog (spec docs/
// superpowers/specs/2026-09-13-element-docs-design.md section 2), keyed by
// tray item type (components/blocks/registry.tsx). Two plain-language
// paragraphs per element: what it is, and when a designer reaches for it.
// docs.test.ts fails when a tray item has no entry here, so adding an
// element without its docs is caught at once. Nothing here is fetched; the
// real documentation replaces these strings without touching the dialog.
import type { DiagramNodeKind } from '@/lib/diagram/store';
import type { BlockType } from './schema';

export type ElementDoc = { summary: string; usage: string };

// The Components tab's Diagram group (spec docs/superpowers/specs/2026-09-13-
// diagrams-design.md section 13) is not made of tray items (no BlockType),
// so its own seven entries below are keyed by diagramToolDocKey's id
// instead: a shape's lowercase DiagramNodeKind, or 'connector'. Lowercase on
// purpose - see diagram-palette.tsx's diagramToolDocKey doc comment for why
// this never collides with a same-labelled BlockType key such as 'Text'.
type DiagramDocKey = DiagramNodeKind | 'connector';

// The fallback for a type with no entry (an unknown type, or a stale key):
// generic on purpose, so the dialog still reads as a whole.
const FALLBACK_DOC: ElementDoc = {
  summary: 'No notes have been written for this item yet.',
  usage: 'Drag it onto a frame and open the Design tab to see the properties it offers.',
};

export const ELEMENT_DOCS: Record<string, ElementDoc> = {
  LayoutBox: {
    summary:
      'A Frame is a container for other layers. It lays out its children with auto layout in a row or a column, or as a grid with a fixed number of columns, and it owns the gap and padding between them.',
    usage:
      'Reach for a Frame whenever a group of layers should move and resize together: a toolbar, a form row, a sidebar, a card body. Nest Frames to build a page section by section, and set Direction, Alignment and Distribution per breakpoint in the Design tab.',
  },
  Card: {
    summary:
      'A Card is a bordered surface with a title, an optional description and a content zone that accepts other layers. It groups related content into one visual unit.',
    usage:
      'Use a Card when a cluster of information needs its own edge on the page: a settings section, a summary tile, a pricing option. Drop layers into its content zone; the title and description are properties in the Design tab.',
  },
  Tabs: {
    summary:
      'Tabs show one of several panels at a time behind a row of labelled triggers. It takes a comma-separated list of tab names and keeps one content zone for the active tab.',
    usage:
      'Use Tabs to split content that belongs to the same screen into views a person switches between, such as Overview, Details and Settings. In Play mode the triggers switch the active tab; on the canvas the Active tab property picks which one shows.',
  },
  Separator: {
    summary:
      'A Separator is a thin horizontal or vertical rule that divides neighbouring content without adding any spacing of its own.',
    usage:
      'Place a Separator between groups in a list, a menu or a form when the gap alone does not read as a boundary. Switch its Orientation to vertical inside a horizontal Frame.',
  },
  Text: {
    summary:
      'Text is a single run of copy with a role that sets its size and weight: three heading levels, a paragraph and a caption. Its alignment can differ per breakpoint.',
    usage:
      'Use Text for every heading, label and paragraph on the frame. Pick the role that matches the job of the copy rather than its look, and turn on Muted for secondary copy.',
  },
  Image: {
    summary:
      'An Image is a placeholder picture area with a fixed aspect ratio and a corner radius. It shows its label in place of a real photo.',
    usage:
      'Use an Image wherever a photo, illustration or thumbnail will sit in the final design. Choose the aspect ratio the real asset will have, so the layout around it is honest about its size.',
  },
  Avatar: {
    summary: 'An Avatar is a circular badge for a person or an account, showing initials in one of three sizes.',
    usage:
      'Use an Avatar next to a name in a header, a comment, a table row or a member list. Keep the initials to two characters so every size stays legible.',
  },
  Badge: {
    summary: 'A Badge is a small inline label with a variant colour, used to mark a status or a category.',
    usage:
      'Use a Badge for short, scannable metadata beside a title: Draft, Beta, New, or a count. Choose the variant that carries the meaning, and keep the text to a word or two.',
  },
  Button: {
    summary:
      'A Button is the standard clickable control. Its variant sets the visual weight, from the filled default to the ghost and link styles, and its size sets the height.',
    usage:
      'Use a Button for any action a person takes on purpose: submit, save, open, cancel. Give the primary action the default variant and secondary actions a lighter one, and wire it up in the Prototype tab to navigate or to open a Dialog.',
  },
  Input: {
    summary:
      'An Input is a single-line text field with an optional label and a placeholder. Its type switches the keyboard and the masking for email, password and number entry.',
    usage:
      'Use an Input for short answers: a name, an email address, a search term. Give it a label whenever the placeholder alone would disappear once someone starts typing.',
  },
  Textarea: {
    summary:
      'A Textarea is a multi-line text field with an optional label, a placeholder and a row count that sets its resting height.',
    usage:
      'Use a Textarea when the answer runs longer than one line: a message, a description, notes. Set the rows to the length you expect, so the form reads at the right size before anyone types.',
  },
  Select: {
    summary:
      'A Select is a dropdown that shows a placeholder until one option from a comma-separated list is chosen.',
    usage:
      'Use a Select when a person picks exactly one value from a known list that is too long for radio buttons. In Play mode the list opens and an option can be chosen; on the canvas only the trigger shows.',
  },
  Checkbox: {
    summary: 'A Checkbox is a single on-or-off choice with a label beside it.',
    usage:
      'Use a Checkbox for an independent yes-or-no setting, or several of them for a pick-any list. When only one choice is allowed, use a Radio group instead.',
  },
  RadioGroup: {
    summary:
      'A Radio group presents a comma-separated list of options where exactly one can be selected. The Selected property picks the initial option.',
    usage:
      'Use a Radio group when a person must choose one option and all the options should be visible at once, such as a shipping method or a plan. Reach for a Select when the list is long.',
  },
  Switch: {
    summary: 'A Switch is an on-or-off toggle with a label, for a setting that takes effect immediately.',
    usage:
      'Use a Switch for preferences that apply as soon as they change, such as notifications or dark mode. Use a Checkbox instead when the choice is part of a form that is submitted later.',
  },
  Slider: {
    summary:
      'A Slider is a horizontal track with a handle for picking a value between 0 and 100, with an optional label.',
    usage:
      'Use a Slider when the value is approximate and the feel of moving it matters, such as volume or opacity. Use an Input when someone needs to type an exact number.',
  },
  Alert: {
    summary:
      'An Alert is a boxed message with a title, a description and a default or destructive variant, calling attention to something on the page.',
    usage:
      'Use an Alert for information that stays on the page: a notice about a change, a warning before an action, an error that needs fixing. Choose the destructive variant only for problems and losses.',
  },
  Progress: {
    summary: 'Progress is a horizontal bar filled to a percentage between 0 and 100, with an optional label.',
    usage:
      'Use Progress to show how far along a task or a quota is: an upload, a setup checklist, storage used. Set the value to the state you want the screen to show.',
  },
  // Dialog removed (spec docs/superpowers/specs/2026-09-13-overlay-frames-
  // design.md section 5, phase 2): no longer a tray item (a modal is an
  // overlay frame now), and docs.test.ts's own "no entry for a type that is
  // not in the tray" check means this key must go too, not just the tray
  // entry - registry.tsx keeps Dialog in its resolver/schemas for existing
  // layouts, which never reach this dialog (its "i" button is per tray row).
  Table: {
    summary: 'A Table lays out rows of placeholder cells under a comma-separated list of column headings.',
    usage:
      'Use a Table for records that people compare across the same fields: orders, members, files. Name the columns after the real data and set the row count to the density you want to show.',
  },
  // Diagram tools (spec docs/superpowers/specs/2026-09-13-diagrams-design.md
  // section 13): the Components tab's "Diagram" group, keyed by
  // diagramToolDocKey's id rather than a tray item type - see DiagramDocKey
  // above.
  rect: {
    summary: 'A Rectangle is a plain rectangular shape on the diagram canvas, with a fill colour and a line of text inside it.',
    usage:
      'Use a Rectangle for a plain step in a flow chart, such as a process or an action that does not need a special outline.',
  },
  rounded: {
    summary: 'Rounded is a rectangle with softened corners: the same shape with a gentler edge.',
    usage:
      'Use Rounded for a step that should read as lighter or less formal than a plain Rectangle, such as an optional or a background step in a flow.',
  },
  decision: {
    summary: 'Decision is a diamond shape that marks a branch point in a flow, where the path forward depends on an answer.',
    usage:
      'Use Decision wherever a flow chart asks a yes-or-no or either-or question, with connectors leading out to each possible answer.',
  },
  terminal: {
    summary: 'Terminal is a pill-shaped capsule that marks the start or the end of a flow.',
    usage:
      'Use Terminal for the very first and very last steps in a flow chart, such as "Start" or "Done", so the boundaries of the flow are obvious at a glance.',
  },
  text: {
    summary: 'Text places a line of text directly on the diagram canvas, with no shape or outline around it.',
    usage:
      'Use Text for a label, a heading or a note beside a flow that does not belong inside any single shape. The T shortcut arms this same tool.',
  },
  note: {
    summary: 'Note is a small sticky-note shape, square with a folded-corner look, meant for a short comment.',
    usage:
      'Use Note to leave a quick annotation next to a flow, such as a caveat or a question for a teammate, without it looking like a real step.',
  },
  table: {
    summary: 'Table organizes diagram information into editable rows and columns.',
    usage: 'Click or drag Table onto the diagram canvas. Double-click a cell to edit it, or edit cells and row/column counts in the inspector. The first row is the header. Resize with the corner handles. Tables are canvas documentation and are not included in application code.',
  },
  connector: {
    summary:
      'Connector draws a line between two shapes, or between a shape and a frame, to show how a flow moves from one to the other.',
    usage:
      'Use Connector to link steps in order, point a decision toward its outcomes, or trace a flow into and out of an actual screen.',
  },
  // `satisfies` makes a missing or misspelt block type (or diagram tool) a
  // compile error too, not only a docs.test.ts failure. Dialog excluded: it
  // stays a real BlockType (registry.tsx's resolver/schemas, for an existing
  // layout that already has one) but left the tray for an overlay frame, and
  // docs.test.ts's own "no entry for a key that is not in either list" check
  // means it must have NO entry here any more, not a required one.
} satisfies Record<Exclude<BlockType, 'Dialog'> | DiagramDocKey, ElementDoc>;

// Own-property lookup, not a plain index: a type such as "constructor" would
// otherwise hand back an Object.prototype member instead of the fallback.
export function getElementDoc(type: string): ElementDoc {
  return Object.hasOwn(ELEMENT_DOCS, type) ? ELEMENT_DOCS[type] : FALLBACK_DOC;
}
