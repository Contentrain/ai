---
"@contentrain/types": minor
"@contentrain/emitter-astro": minor
---

Header and footer chrome as shared Astro components

`ChromeChunk.position` gains `header` and `footer`, which lift a region out of
the body blob into `src/components/*.astro` rendered as siblings of the body
fragment. Families carrying the same region share one component, so the nav
lives at a single address — where a jQuery-free menu replaces the theme's —
instead of being copied into every family's chrome. Identity is by content:
two different headers claiming the same name get separate files and a warning,
never a silent swap. `ChromeChunk.component` names the shared component.

The producer must lift only balanced regions that sit outside the content path;
when either is in doubt one `body` chunk is always correct. The emitter now
checks balance on header, footer and body chrome and names the dangling tags,
because an unbalanced fragment does not fail the build — the browser repairs it
and the page loses its layout (measured: 36 against 100).
