---
'@contentrain/emitter-astro': patch
---

Fix the build of every site with an archive route (category, tag, author): the archive page passed its `feed` to the layout's `seo` object, which `SeoInput` did not declare, so `astro check` — which the build runs first — failed with TS2353. `SeoInput` now carries `feed`.
