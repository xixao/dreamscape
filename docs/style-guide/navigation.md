# Navigation and Selection

Status: adopted behavior rules for the current prototype. Visual and keyboard
verification remains part of the screen-by-screen review.

## Choose the right pattern

| Intent | Pattern | Current owner |
| --- | --- | --- |
| Move between major workspace views | One labeled navigation region; one current item; retain project/version context | `FlowReview` workspace navigation |
| Change the audience and permissions | A visibly labeled "View as" selector outside the page destinations | Shared workspace header |
| Operate the preview | A labeled local control group with playback, reset, display and comment commands | Prototype canvas header |
| Switch the content of one bounded panel | Tabs with one associated panel per trigger; arrow-key navigation | Inspector and developer code tabs |
| Change an in-place mode | Labeled button group with `aria-pressed`; no tab roles | Journey planned/recorded modes |
| Limit visible records | Filter controls with a visible active state and scoped reset only when filtered | Results outcome filters |
| Advance through a fixed presentation | One persistent Previous/progress/Next group; move focus to the new heading | PO section footer |
| Open a specific record or evidence item | Contextual action with a precise destination label | Results, comments and findings |
| Show place in a real page hierarchy | Breadcrumb navigation with linked ancestors and a current page | None in this single-project prototype |
| Show place in a linear task | Ordered progress list with completed, current and upcoming steps | Demo upload flow |

Navigation is not inferred from a row of similar-looking buttons. A control must
have one clear job. Do not place a second control for the same destination in a
page header or footer merely because the page has room. Commands such as Set up
test remain visually adjacent to navigation but outside its destination list.

## Three control levels

1. The **experience level** chooses who is viewing: Designer, Product owner,
   Engineer or Participant. Its selector is not a page tab or a playback control.
2. The **workspace level** keeps Review, Journey and Test results visible.
   Edit component, Case study and Code live under More views; when one is
   current, its name is shown on the menu trigger. "Set up test" is a command
   beside the destinations, not another destination. The duplicate header
   Share entry was removed because both opened the same share/test dialog.
   The Test results badge counts sessions on the selected saved version;
   all-version evidence is available from the Results version filter.
   On narrow screens, scroll the navigation row to keep the current item fully
   visible after a view change; do not scroll the page itself.
3. The **preview level** operates only the prototype. Pause/resume and reset
   change playback/state; Display options opens an anchored, bounded popover
   for viewport, focus and zoom. Comment overlays are disclosed within it.
   Opening settings must not add an inline row or resize the canvas. This is a
   labeled control group, not a second navigation
   landmark or an ARIA toolbar with unimplemented arrow-key behavior.

The preview-level Review panel toggle controls the visibility of the right
inspector, not its selected tab. Closing it widens the canvas and preserves
panel state and draft text. Contextual actions such as Add comment and placed
comment pins may open a specific tab directly. The toggle names Show/Hide,
reports pressed state and points at the controlled panel. It does not become
a second row of panel tabs or a pill selector.

"Add comment" is an action: it opens the Comments panel and focuses its
composer. "Comments" is the panel destination for reading and replying.
"Comment targets" shows where a new comment may be attached; "Show placed
comments" reveals existing comments on the canvas. These controls must not
share a vague "Feedback" label, and toggles expose pressed state. A header
shortcut to open the preview appears only outside pages that already contain
the preview; the local playback group is its only playback control.

## Control budget before building

For every new screen or substantial change, inventory visible controls by
level: experience, workspace, page, preview, panel and item. Give each control
one named job and one owner. Keep the most frequent path visible; use a
clearly labeled menu for less-frequent destinations or actions. In the workspace
strip, aim for no more than three persistent destinations plus one contextual
command. This is a review threshold, not an excuse to hide an essential or
time-critical action.

Before adding a control, check whether the same outcome already has an entry
point in the same context. If so, remove one or explain why both are needed.
Menus must have short, direct labels, a meaningful order and a visible active
destination. Do not bury safety, abandonment, unsaved-work recovery or the
primary task action. Verify keyboard access, focus after selection, narrow
viewport behavior and that a new user can still find the secondary view.

Breadcrumbs are not decorative project labels. Use them only when there are real,
addressable ancestors. A static project/component name is context text, not a
breadcrumb, and should be omitted when the adjacent page heading repeats it.
Steppers communicate task progress, not workspace location. Use an ordered list;
identify the current item with `aria-current="step"` and completion in words as
well as color. Do not make future steps clickable unless the task truly permits
skipping and the resulting state is valid. The upload prototype's stepper describes
the fictional Homepath application; it does not navigate Flow Review.
Numbered circles in steppers, state selectors, journeys, version history, and
comment anchors use the shared `NumberMarker` atom; their parent owns interaction
and semantics, while the atom owns circle geometry and numeral alignment.

## Behavior and layout

- Use one active destination in each navigation region. Label separate regions
  when a screen has more than one. Use links for addressable URLs and buttons for
  in-place view changes that have no URL.
- Do not use tabs unless every trigger controls a corresponding tab panel. Tabs
  support arrow-key selection; filters and modes use ordinary buttons/selectors.
- Keep primary actions scoped to the current view. Remove redundant shortcuts;
  keep contextual links only when they explain the relationship between records.
- A guided sequence has one persistent footer with Previous, progress and Next.
  Disable unavailable directions. Do not repeat the same sequence as a top step bar.
- Navigation that would discard unsaved work is blocked with a specific save or
  discard message. Do not change the active destination first and hope the user
  notices a toast.
- After a full-section change, focus its heading or main region. Selected state
  is conveyed through text/semantics as well as color. Keep focus visible.
- On narrow screens, the workspace destinations may scroll horizontally within
  their region; the page itself should not develop horizontal overflow. Persistent
  footers must not cover content at large text or short viewport heights.

The tab contract follows the [WAI-ARIA Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).
Breadcrumb semantics follow the [WAI-ARIA Breadcrumb pattern](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/).
The stepper usage rules follow [Carbon's Progress indicator](https://carbondesignsystem.com/components/progress-indicator/usage/).
Distinct labeled navigation regions follow the [WAI-ARIA navigation landmark example](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/examples/navigation.html).
The distinction between tabs and local content switching is also described by
[Carbon Tabs](https://carbondesignsystem.com/components/tabs/usage/) and
[Carbon Content Switcher](https://carbondesignsystem.com/components/content-switcher/usage/).
The [WAI-ARIA Toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/)
requires arrow-key focus management; the current preview controls intentionally
use a labeled group and normal Tab order instead.
The use of a small labeled menu for less-frequent choices follows
[Carbon's menu-button guidance](https://carbondesignsystem.com/components/menu-buttons/usage/);
its [menu guidance](https://carbondesignsystem.com/components/menu/usage/)
also calls for short labels and meaningful ordering.
