---
'@contentrain/astro-kit': patch
---

The Astro starter keeps measured image sizes in `src/lib/media-sizes.ts` (`MEDIA_SIZES`) instead of `src/data/media-sizes.json`. A migrated site no longer ships a JSON file under `src/` or a JSON import, which the migration's query-only check reports as content living outside `.contentrain`. `mediaSize` and `KitImage` behave as before.
