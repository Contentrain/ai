---
"@contentrain/skills": minor
"@contentrain/wp-import": minor
---

`contentrain-migrate-wordpress` skill

The WordPress path existed as packages (`@contentrain/wp-import`, `contentrain import`) but no skill taught an agent to walk it: pick the source, import, **read the report**, validate, then wire the content to Astro's content layer or the generated client — and hand back what the import cannot decide (comments, redirects, media files).

`references/wordpress-mapping.md` documents where each WordPress concept lands, which fields appear only when the source has the data, how status maps, and what is dropped.

`@contentrain/wp-import` now exports `SKIP_TYPES` and `PLUGIN_META`. They are documented behaviour — an agent has to answer "why is my custom post type missing?" — and a parity test holds the reference to them, so an exclusion added to the importer cannot silently outlive its documentation.
