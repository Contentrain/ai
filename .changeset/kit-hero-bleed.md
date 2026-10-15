---
'@contentrain/astro-kit': minor
---

Hero gains `imageBleed`. `edge` runs the image on to the window's edge on its side (both sides when the hero is centered), by Split's rule, now shared as `_shared/bleed.ts`. `overlap` also lets it cross the section's bottom edge by `--hero-overlap` (3rem), drawn over the next section's top padding without moving that section. A cover ignores it. The default, `none`, draws the hero exactly as before.
