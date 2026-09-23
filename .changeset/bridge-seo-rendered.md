---
'@contentrain/types': minor
'@contentrain/emitter-astro': minor
---

The Bridge's rendered SEO (BR-16, `contentrain-bridge-seo@1`, additive). `RawSeoEntry` gains `rendered` (title, description, canonical, robots, Open Graph and Twitter text as the exporter rendered the plugin's templates), `rendered_by`, `template_source` and `unresolved`; `SEO_PROVIDERS` gains `seopress` (optional in `RawSeo.providers`, so older exports stay valid). `seoFromRawEntry()` reads a resolved block as it is, else `rendered`, else the stored values with template tokens dropped; robots from `robots_served`, then `rendered.robots`, then the setting; a template token is never printed.
