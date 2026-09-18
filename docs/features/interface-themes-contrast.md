# Dreamscape hidden theme contrast checks

Colors only; no third-party artwork. Each of the twelve palettes is checked against 51 semantic color pairs. Normal text, hints, links and status text require 4.5:1 against canvas, application, panel, surface and hover backgrounds. Primary action boundaries require 3:1 against those backgrounds; action text requires 4.5:1 against the primary action.

Reference: https://www.w3.org/TR/WCAG22/#contrast-minimum and https://www.w3.org/TR/WCAG22/#non-text-contrast. These palette checks are not a full-product accessibility audit. Decorative separators are not evaluated as control boundaries.

Dark retains the existing application colors by request. Light and the twelve hidden palettes use adjusted colors. Custom colors are warned about, not silently changed. All adjustments preserve HSL hue/saturation and use the smallest passing lightness change at 0.01% increments after 8-bit RGB rounding.

| Preset | Mode | Checks | Result | Lowest text ratio | Lowest control ratio |
|---|---|---|---|---|---|
| naruto | dark | 51 | PASS | 4.502:1 | 4.972:1 |
| naruto | light | 51 | PASS | 4.506:1 | 7.613:1 |
| kuromi | dark | 51 | PASS | 4.508:1 | 4.124:1 |
| kuromi | light | 51 | PASS | 4.505:1 | 3.946:1 |
| spartans | dark | 51 | PASS | 4.527:1 | 3.931:1 |
| spartans | light | 51 | PASS | 4.501:1 | 7.550:1 |
| wolverines | dark | 51 | PASS | 4.503:1 | 6.804:1 |
| wolverines | light | 51 | PASS | 4.506:1 | 12.473:1 |
| sonic | dark | 51 | PASS | 4.506:1 | 3.018:1 |
| sonic | light | 51 | PASS | 4.506:1 | 5.359:1 |
| goth | dark | 51 | PASS | 4.500:1 | 3.011:1 |
| goth | light | 51 | PASS | 4.503:1 | 8.091:1 |

University aliases: `msu` → `spartans`; `umich` → `wolverines`. Missing roles in the new palettes were completed with matching neutrals.

## Shade adjustments

| Preset | Mode | Role | Supplied | Adjusted |
|---|---|---|---|---|
| naruto | dark | text-muted | #A3957F | #A99C87 |
| naruto | dark | text-faint | #665C4E | #A79C8C |
| naruto | dark | status-success | #4CAF7D | #4CB07D |
| naruto | dark | status-error | #E0453A | #EA7E77 |
| naruto | light | text-muted | #6B7186 | #5E6376 |
| naruto | light | text-faint | #A9AEBD | #5C6379 |
| naruto | light | accent-secondary | #F28C28 | #995009 |
| naruto | light | status-success | #2E8B57 | #257046 |
| naruto | light | status-warning | #B8860B | #805E08 |
| naruto | light | status-error | #C62828 | #BF2626 |
| kuromi | dark | text-faint | #5B5866 | #9591A0 |
| kuromi | dark | accent-secondary | #9B6BD9 | #A980DE |
| kuromi | light | text-muted | #6E6C78 | #5C5A65 |
| kuromi | light | text-faint | #ABA9B4 | #5D5A68 |
| kuromi | light | accent-focus | #E0338A | #AE1A64 |
| kuromi | light | accent-secondary | #7A4BC2 | #703FBB |
| kuromi | light | status-success | #2E8B57 | #236841 |
| kuromi | light | status-warning | #B8860B | #775607 |
| kuromi | light | status-error | #D32F2F | #AF2525 |
| spartans | dark | text-faint | #657C70 | #96AA9F |
| spartans | dark | accent-secondary | #18453B | #40B89D |
| spartans | dark | status-success | #4CAF7D | #58B787 |
| spartans | dark | status-error | #E05D5D | #E98B8B |
| spartans | light | text-muted | #657B6E | #516358 |
| spartans | light | text-faint | #91A398 | #526259 |
| spartans | light | accent-focus | #0DB14B | #086D2E |
| spartans | light | accent-secondary | #4A7D6A | #3D6757 |
| spartans | light | status-success | #2E8B57 | #246B43 |
| spartans | light | status-warning | #B8860B | #7B5907 |
| spartans | light | status-error | #C62828 | #B52525 |
| wolverines | dark | text-muted | #97AAC7 | #9AADC9 |
| wolverines | dark | text-faint | #647A9A | #9FACC0 |
| wolverines | dark | accent-secondary | #4A7BC7 | #8EADDC |
| wolverines | dark | status-success | #4CAF7D | #64BC8F |
| wolverines | dark | status-error | #E05D5D | #EA9494 |
| wolverines | light | text-muted | #687C96 | #5A6B82 |
| wolverines | light | text-faint | #9BA9BB | #596B83 |
| wolverines | light | accent-secondary | #FFCB05 | #816600 |
| wolverines | light | status-success | #2E8B57 | #28774B |
| wolverines | light | status-warning | #B8860B | #896308 |
| sonic | dark | text-muted | #94A7D1 | #95A8D1 |
| sonic | dark | text-faint | #6075A4 | #9AA8C5 |
| sonic | dark | text-on-accent | #FFFFFF | #212121 |
| sonic | dark | accent-primary | #2A63FF | #5180FF |
| sonic | dark | accent-focus | #5C8CFF | #80A6FF |
| sonic | dark | status-success | #43B54A | #4EBE55 |
| sonic | dark | status-error | #E53935 | #F08C89 |
| sonic | light | text-muted | #667BA1 | #55688B |
| sonic | light | text-faint | #95A5C3 | #526892 |
| sonic | light | accent-focus | #2A63FF | #1654FF |
| sonic | light | accent-secondary | #E8383A | #CD181A |
| sonic | light | status-success | #43B54A | #2C7630 |
| sonic | light | status-warning | #B8860B | #866108 |
| sonic | light | status-error | #E53935 | #CB1E1A |
| goth | dark | text-muted | #7D7885 | #908C97 |
| goth | dark | text-faint | #5F5968 | #918B9B |
| goth | dark | text-on-accent | #F2EDF2 | #F7F4F7 |
| goth | dark | accent-primary | #7A1F2E | #CC3850 |
| goth | dark | accent-focus | #A83A4B | #CE7381 |
| goth | dark | accent-secondary | #4E3B6B | #9984BB |
| goth | dark | status-success | #3F7A5A | #519C73 |
| goth | dark | status-error | #C62828 | #E06868 |
| goth | light | text-muted | #756C79 | #5C545F |
| goth | light | text-faint | #A59BAA | #5D5362 |
| goth | light | status-success | #3F7A5A | #315F46 |
| goth | light | status-warning | #B08D3C | #685424 |
| goth | light | status-error | #C62828 | #A62222 |
