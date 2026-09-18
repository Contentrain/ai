---
"@contentrain/emitter-astro": patch
---

Render disjoint collections that share the same catchall route through one Astro page, selecting each entry's original layout and locale. Keep the original data files and dynamic entry discovery. Duplicate URLs still refuse emission or fail the next build after content edits; static and non-collection route collisions remain errors.
