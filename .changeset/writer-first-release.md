---
'@contentrain/writer': minor
---

First release. `writeProject` writes an Astro + Contentrain site from a migration's project plan around the imported store:
- It generates the project deterministically: models, content config, site settings, design, fonts, kit components and composed views.
- It copies the source's SEO.
- It calls a model only for site components, unsupported routes and gate repairs. That model works within a fixed tool surface, never writes content, and runs within a per-turn budget.

The package carries its Astro starter (`starter/`).
