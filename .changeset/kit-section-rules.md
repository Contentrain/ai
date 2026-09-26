---
'@contentrain/astro-kit': minor
---

Mapping tables take `sections`: rules that classify a whole page section (an Elementor container, a Gutenberg group, a Divi section) by the leaves it holds, grouped into named slots, and fill the component's props from them (`@title attr:title`, with `a || b` fallbacks). `matchSection` and `classifySection` apply them, and `validateMapping` checks them against the catalog: a slot that may hold several leaves cannot feed a `string` or `text` prop.

The catalog is the vocabulary a page model is built from. A section's props are content (stored in the page model) unless marked `content: false` (a heading level, an anchor id, an interface label). Every content prop has a Studio `label` and a `description`, a camelCase name with one capital per word, and at most two object levels. The catalog build writes each section's `contentFields` (`slides[].ctaLabel` → `slides[].cta_label`, `contentFieldName`).

List items no longer nest an image object. Card grid, gallery and slider items take `image` (the address) and `imageAlt`, testimonials `avatar` and `avatarAlt`, and slider slides `ctaLabel` and `ctaHref`. The object forms are still read until 0.7. `KitImage` looks up a missing width and height in the site's `src/lib/media.ts` (`mediaSize`, from `src/data/media-sizes.json`). The mapping tables read item images as `img:<selector>@src` and `@alt`.
