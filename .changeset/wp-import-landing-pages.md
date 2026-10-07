---
"@contentrain/wp-import": minor
---

Elementor landing pages (`e-landing-page`) are imported as pages. They are public pages at `/<slug>/`, so they enter the `pages` model with their slug, permalink and meta (WXR and REST both), share the page address space, and are no longer in `SKIP_TYPES` or `report.skipped_types`. Over REST WordPress lists the type only when it is `show_in_rest`; otherwise import from a WXR export. `pageTypeOf` and `LANDING_PAGE_TYPE` are exported for callers that classify a post type.
