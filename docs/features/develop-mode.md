# Develop mode

Open **Develop** beside Present/Share in the design toolbar. The separate `/f/[id]/develop` route reads the saved file and reuses Player's real component rendering and prototype navigation. No file saves, Craft editing handlers, or history mutations are installed. Interact changes only temporary prototype state.

## Inspect and layout

Hover highlights a component and shows its rendered size, layout and key props. Click pins a movable, resizable detail card; Parent and child buttons move through the hierarchy. Show layout marks the selected box in purple, direct children in cyan, and padding in green. Measurements are browser CSS pixels at the saved screen width. The palette also locates components by type, renamed layer name, label, placeholder or text.

Custom components are inspected at their instance boundary. `/definition` exposes their saved definition; nested internals are not separately selectable in this version. Overlay frames remain interactive via Player but do not yet have independent inspection. Commands and instance results are scoped to the current screen.

## Commands

Press `/` outside editable fields or click Find. Arrow keys choose, Tab completes commands, Enter executes, Escape closes. `/props propertyName` autocompletes configured property names.

- `/props`, `/props all`, `/overrides`
- `/parent`, `/children`, `/instances`
- `/layout`, `/why width`, `/why height`
- `/usage`, `/definition`, `/docs`
- `/copy props`, `/copy usage`, `/copy context`, `/copy link`, `/copy image`

Copy writes the actual payload before announcing success in a bottom toast that dismisses after three seconds. Failure stays visible with Retry and Dismiss. Props on screen abbreviate embedded assets; clipboard exports preserve their full values.

## Data honesty

Configured props are Craft's current serialized props, including defaults materialized by deserialization. `/props all` additionally merges registered defaults; `/overrides` compares against registered defaults, not a historical designer change log. Computed layout is explicitly distinguished from configured values. `/why` shows the configured sizing at the screen breakpoint alongside browser constraints; it does not claim a complete CSS cascade trace.

Usage is a runnable Dreamscape/Craft preview with its runtime imports, not a fabricated `@dream/core` production snippet. Local docs remain placeholder references. Source-file mappings, production imports, live documentation, and design-token provenance are not yet connected.

## Verification

`npx vitest run components/workbench/develop/develop.test.tsx components/play/player.test.tsx components/workbench/topbar.test.tsx`

Coverage: search/path resolution, command ranking, Inspect blocking navigation, Interact navigation, document immutability, slash within text fields, Tab/Enter commands, successful clipboard payloads, three-second dismissal, copy failure/retry, layout and parent navigation. Browser verification also covers the real recovered screen's image, text and custom prompt component.

## Comments and annotations

The Notes control opens a floating read-only viewer for the current screen's threads and its page's canvas notes and annotation-library items. All three types retain their labels/colors, replies, and resolved status; type/status filters and Show/Hide on screen affect the overlays. Inspect element returns to a thread's anchored component. In Inspect, screen pins follow element anchors and library annotations that overlap the screen retain their canvas-relative placement; items outside the screen remain in the list. In Interact, overlays are hidden so they do not interfere with prototype controls.

Comments use the existing browser-local store and refresh on storage events from another Design tab. They are not cross-user/server collaboration. Library annotations are loaded from the saved file snapshot. Inspect/Interact uses the same segmented-control styling as Design.
