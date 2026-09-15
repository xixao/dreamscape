# Prompt composer controls

Containers (Frame/LayoutBox and Card) expose corner radius, border width/color, fill color, shadow, per-side padding, and sizing constraints. Button and Textarea share the sizing controls. These fields come from the same schemas in normal Design and the component builder.

To assemble a composer in CC:
1. Set the component Frame to vertical, Fill container width, a 24px corner radius, 1px border, and 12–16px padding.
2. Add a Textarea, clear its label, set placeholder to “Ask anything”, enable Borderless and Auto-grow, and set minimum/maximum height to 64/200px.
3. Add a horizontal Frame beneath it. Set Distribution to Space between and clear its padding if needed.
4. Add a ghost Button with paperclip or plus icon, Icon only, Circular, and an accessible label such as “Attach a file”.
5. Add a default Button with arrowUp or send icon, Icon only, Circular, and accessible label “Send message”.
6. Compare widths and save the new component with Add to Components. Existing components autosave.

For presentation, Textarea's Preview text represents populated content; clear it to represent an empty composer. Button supports Disabled and Submitting (spinner/busy, non-interactive in Play). These are independently editable visual properties, not named component variants or an automatic shared state machine. Live sending, attachment upload, voice capture, and Enter-to-send are developer integrations. Preview text is demo content and can also seed Play input.

Sizing Default preserves existing styling. Fit content, Fill container and Fixed are explicit overrides. Maximum size 0 means unbounded. Auto-grow takes precedence over a Textarea's fixed height; min/max height constrain growth. CSS colors accept named colors, hex values, or CSS variables. The icon menu is a curated built-in set: arrow up, paperclip, plus, microphone, send, close, search.

Verification includes a composed prompt tree, icon accessible names, textarea growth/shrink limits, existing blocks, registry defaults, and builder insertion. Chrome checks covered Input borderless and border side/visibility changes with undo.

## Compact appearance controls

Padding sides share a two-column grid. Border controls group color variables, opacity, visibility, removal, thickness presets/custom values, side selection, and solid/dashed/dotted styles. Custom sides reveal independent widths. Hidden borders preserve their space; removing a border sets its widths to zero. Existing borderWidth/borderColor values remain readable; new edits store a border settings object. These controls are shared by the main inspector and CC editor.
