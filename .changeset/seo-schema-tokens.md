---
'@contentrain/types': minor
'@contentrain/emitter-astro': patch
---

`RawSeo.home` holds the home page's SEO, one block per provider, when the home page lists posts. `seoFromRawEntry()` reads a block's top-level JSON-LD graph only when the running plugin rendered it (`resolved`); otherwise it reads the exporter's rendered schema nodes and leaves out any node that still holds a template token, so a `%title%` never reaches the page's structured data.
