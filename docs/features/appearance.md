# File and frame appearance

Click the file name to open File settings, where designers can rename the file and choose Light or Dark. Select a root frame to set Appearance in the Design inspector: File default (with the inherited value), Light, or Dark. New frames inherit the file default. Explicit overrides survive changes to the file default.

The choice affects design-system colors in canvas content and presentation, including overlay frames. Editor chrome retains its own styling. Custom-component previews inherit the file default, and placed components inherit their frame's colors. Explicit custom colors remain explicit.

Persistence uses `files.appearance` (Light by default) and optional `screens[].appearance`; absence means inherit. Migration `0005_file_appearance.sql` adds the file setting. Apply hosted database migrations before deployment. Local in-memory development databases apply new migrations after HMR without discarding existing files.

Tests cover saving and duplicating appearance, inheritance reset, root-only controls, live iframe updates without remounting, and presentation inheritance. Browser visual review is pending.
