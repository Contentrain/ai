---
"@contentrain/wp-import": patch
---

`rawToContentrain` maps Elementor's `e-landing-page` to `page` itself, as `parseWxr` and `fetchRestRawIR` already did. A RawIR from another producer (a Bridge export) no longer puts landing pages in a separate `content/custom/e-landing-page` model; they join `pages`, sharing its permalink space and SEO. Already-mapped input converts unchanged.
