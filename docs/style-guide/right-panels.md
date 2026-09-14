# Right Panel Family

Status: adopted shell and atom ownership; full responsive/keyboard verification is
still part of the screen review.

`components/right-panel.tsx` is the only right-panel shell. It renders an
`aside`, preserves native landmark labeling, and applies one of four variants.
The shell owns surface, minimum dimensions and frame. The panel content owns its
task, not a second copy of the shell.

| Variant | Purpose | Header/content behavior | Scroll ownership |
| --- | --- | --- | --- |
| `review` | Review brief, assistant, feedback, checks, history | Real Tabs with matching panels; one active tab. Designer can collapse the panel; Engineer opens to checks on entry. | Panel scrolls; tab list stays visible. Assistant message area scrolls while composer remains at bottom. |
| `properties` | Manual component settings | Labeled fields, draft status and save/discard commands; no invented tabs | Panel scrolls as needed. |
| `design` | Faux design-tool inspector | Design/Agent is a pressed mode group, not a tab set; selection context is separate from mode | Properties or agent thread scrolls; agent composer stays at bottom. |
| `discussion` | PO version conversation | Discussion identity and close action; no duplicate review navigation | Discussion scrolls independently of presentation. |

## Atom and molecule ownership

The review panel is contextual rather than permanent. Designer starts with the
canvas expanded and opens the panel with one preview-level toggle. Engineer
opens to Checks; Product Owner keeps its separate presentation surface; a
participant never sees the review panel. Closing the panel preserves its tab
and unsent draft, and restores canvas width. Add comment, a placed-comment
thread, an assistant review and a results evidence jump reopen the relevant
panel content. The toggle exposes its pressed state and controls the panel;
it is not a new navigation destination or a duplicate Comments command.

- Commands use `components/ui/button.tsx`, including icon-only and quiet variants.
  No panel-local button primitive is allowed.
- Text entry uses shared Input/Textarea; labeled fields use `LabeledField`.
  Option choices use shared Select. Keep the atom's focus, disabled and error
  behavior instead of restyling it in each panel.
- Review uses the shared Tabs family only where each trigger has a panel. The
  design inspector's mode group uses `aria-pressed` because it changes editing
  mode in place.
- Version/status badges and icons retain their shared atom styling. Panel
  headings use `.right-panel-heading` for icon/title alignment, border and
  spacing. A content heading does not compete with the panel heading.
- The Review Brief is a compact orientation panel, not a second page header.
  Its tab uses a text label; its header identifies the brief and saved version
  without repeating the tab icon. It presents one state-specific review question,
  evidence scoped to that version, and the next decision. The canvas owns state
  selection; the brief reflects that selection instead of adding another selector.
  Evidence rows open results or comments, while checks and suggested changes
  remain distinct actions. An unsaved canvas draft never inherits saved-version
  evidence, and checks never claim to certify accessibility. The brief owns the
  single scenario question; the canvas does not repeat it in a lower caption or
  add a decorative product footer.
- Checks use one `CheckRow` anatomy for local rule results, required human
  verification and unavailable integrations. Each row has one status icon,
  title, explicit type/status line and explanation. Passed, needs-work, manual
  and unavailable are semantic variants, not separate layouts or proof levels.
  Only local rule rows contribute to the pass count. The lead status states
  that verification remains open even when all local rules pass; the same
  verification list contributes to the PO readiness count. Neither view
  implies that the design is production-ready.
- `ReviewComments`, `DocumentUploaderFields` and `StateSelector` remain shared
  content molecules. Their owners do not change when hosted in another variant.
- The Comments tab is the panel identity; its body shows an open-count summary,
  not another competing title. Compose starts with a visible target/state/version
  label, then the shared Textarea and one Post command. Thread, pin preview, and
  placed-comment rows use the same anatomy: comment icon at left; author and
  status at right; comment text below; then placement context and feedback
  actions. A pin preview exposes the same reactions when a review action is
  available. Saved PO decision records are not discussion comments. Replies inherit
  their parent placement and expose Cancel beside Post reply. The shared Button, Select, Textarea, CommentAvatar and
  CommentReactions own their states and minimum sizes; a panel-local CSS rule
  must not shrink those atoms. Assignment and Resolve appear only with permission.
  An anchored comment is a compact view of the same record, not a separate data
  model or reaction behavior.
- The Flow assistant keeps `GuidedPrompt` as its shared suggestion/completion
  molecule. In the review panel, presets, text entry, completion and Send form
  one bounded composer anchored below the independently scrolling response area.
  Presets are optional starting points, not separate calls to action; selecting
  one fills the field without sending. Send stays disabled for empty, busy or
  thinking states. The scripted-response note remains visible outside the field,
  and suggested changes still require explicit approval. Test setup reuses the
  same prompt behavior but may use its own layout.

Every panel needs a discernible label and a stable scroll region. A 320px-width
viewport, 200% zoom, and a short height may stack the panel below main content;
the panel must remain reachable without covering actions. The four variants are
not interchangeable permissions: PO discussion cannot inherit designer editing
controls, and the design Agent remains a scripted prototype until integrated.
