# Figma frame device presets: research notes (2026-09-12)

## What this covers

Figma's Frame tool (press F) shows device presets grouped by category in the Design panel's right sidebar. This covers what could be verified about that list today, and what could not, behind `lib/stage/device-presets.json`.

## Sources checked

- help.figma.com: "Frames in Figma Design" (https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma-Design) and "FD4B: Create a frame using frame presets" (https://help.figma.com/hc/en-us/articles/30974070391191-FD4B-Create-a-frame-using-frame-presets), read as raw HTML.
- help.figma.com: "Set prototype device and background settings" (https://help.figma.com/hc/en-us/articles/21158597546391-Set-prototype-device-and-background-settings)
- Figma's official X account, iPhone 17 family frames: https://x.com/figma/status/2017307352735826030
- Figma's official Threads account, iPhone 16 / Android / Watch Series 10 frames: https://www.threads.com/@figma/post/DAoBKN1uYdI
- ios-resolution.com, a per-device point size reference, for phone and tablet numbers
- Apple's tech specs (support.apple.com) for current iPhone and iPad screens
- Cross-checks only, several conflicting or empty: usevisuals.com, johannesippen.com, websitebuilderinsider.com, printforfigma.com, webdesign.tutsplus.com, docs.merkulov.design
- Figma's help center search: no article found with preset numbers

## Confirmed from Figma's own pages

- Location: the list lives in the Design panel's right sidebar once the Frame tool is active. Click the arrow to expand a category and pick a preset.
- Behavior: choosing a preset sets both width and height to match. To change an existing frame's preset, select it and use the Frame dropdown in the right sidebar.
- Group names and order, verbatim: Phone, Tablet, Desktop, Presentation, Watch, Paper, Social Media, Figma Community, Archive.
- Not mentioned in Figma's docs: a search field, how typed custom sizes work beyond entering your own width and height, or a marker for when a frame already matches a preset. Documentation gaps, not confirmed-absent features.
- Nothing found on landscape variants; likely a manual swap since width and height are plain fields, but unconfirmed.

## What is in device-presets.json, and how sure

- Phone (8) and Tablet (6): lineup confirmed via Figma's own posts (iPhone 16 family and Android category frames announced October 2024; iPhone 17 / 17 Pro / 17 Pro Max / Air via X this year). Pixel values are Apple's published point resolutions, cross-checked against ios-resolution.com. High confidence on numbers; label punctuation is a best guess without a screenshot.
- Desktop (1, Desktop 1440x1024): 1440 width is corroborated everywhere; 1024 height by two independent Figma forum threads describing it as Figma's default; only this entry is confirmed.
- Social Media (2, Instagram Post and Instagram Story): two independent secondary sources describe these exact names and values as Figma's built-ins. Likely incomplete: Facebook, X, LinkedIn, and YouTube entries probably also exist, none with a reliable current value.

## Groups omitted, and why

- Presentation: only generic 16:9 (1920x1080) and 4:3 slide advice turned up, never tied to Figma's own preset list.
- Watch: Figma confirmed "Apple Watch Series 10 (42mm and 46mm)" presets exist, but sources gave conflicting point resolutions for those cases, and whether 41mm/45mm or Ultra 49mm entries remain listed is unclear. Omitted rather than guess.
- Paper: sources conflicted directly. One ties Figma's paper frames to 72dpi points (A4 = 595x842); another states Figma's A4 is 2480x3508 (300dpi); a third says an A4 preset "is currently unavailable" in the size menu. Unresolved, so omitted.
- Figma Community: surfaces community files and plugins, not a fixed size list.
- Archive: presumed older or deprecated presets; no source documents its contents.

## Update, 2026-09-12: confirmed from Matt's Figma

Matt sent screenshots of the live Frame preset panel. `device-presets.json` now holds those lists verbatim for Phone (12 entries, iPhone 17 through Android Medium), Tablet (5), Desktop (6, including Wireframes and TV), Presentation (2), Watch (6) and Paper (5), in Figma's order. Social Media was not captured; its two Instagram entries stay from secondary sources. Watch and Paper sizes go below the stage's former 320 px minimum width, so the device presets task lowers the minimum to 120 px.

## Recommendation

Treat device-presets.json as a solid start for Phone, Tablet, Desktop, and the two Instagram sizes. Fill in Presentation, Watch, Paper, and the rest of Social Media by reading the live panel directly, since Figma does not publish this list as text anywhere.
