---
'@contentrain/astro-kit': minor
---

Mapping tables take `sections`: rules that classify a whole page section (an Elementor container, a Gutenberg group, a Divi section) by the leaves it holds, grouped into named slots, and fill the component's props from them (`@title attr:title`, with `a || b` fallbacks). `matchSection` and `classifySection` apply them, and `validateMapping` checks them against the catalog: a slot that may hold several leaves cannot feed a `string` or `text` prop.
