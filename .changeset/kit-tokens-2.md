---
'@contentrain/types': minor
'@contentrain/astro-kit': minor
---

**Type scale and section rhythm.** `PLAN_TOKEN_ROLES` adds `text-nav`, `text-heading-1`, `text-heading-2`, `text-heading-3` and `spacing-section`. Components do not read them. The site's theme applies them to the kit's markers, and only when the site sets them:
- `data-kit-section` and `data-kit-spacing` on every section;
- `data-kit-text` on the lead and body paragraphs of hero, CTA and card grid.

**Plain FAQ.** Faq gains `style: 'plain'`, the browser's own disclosure triangle with no rules or boxes. Gutenberg's `core/details` now maps to it.
