---
'@contentrain/astro-kit': patch
---

The site title in Header and Footer now carries `data-kit-brand`, and the Footer tagline carries `data-kit-tagline`. A migrated site's theme uses these markers to size them the way the source theme did. Nothing changes until a site sets those sizes.
