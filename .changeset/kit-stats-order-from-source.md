---
'@contentrain/astro-kit': minor
---

Gutenberg figures follow the source's own order. A section rule can now say which of two slots the source writes first (`when.order`). Gutenberg's stats rule now uses it: a row whose figures sit above their labels is `order: value-first`, as before, and a row whose labels come first is a new rule, `stats.columns-label-first`, that keeps the kit's default. Until now every Gutenberg figure row was `value-first`, so a site that writes the label first read out of its source's order (G-text). A row that mixes the two orders is not stats, so it never reads out of order. Mapping versions: gutenberg 7, divi 6 (divi's counter rule changed in 0.12 without a version bump).
