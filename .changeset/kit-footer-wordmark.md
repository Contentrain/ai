---
'@contentrain/astro-kit': minor
---

Footer gains `wordmark` and `wordmarkOrder`. `fit` draws the site name once more as a row exactly as wide as the footer, in the heading font and the footer's ink; `crop` lets the footer's bottom edge cut it, so only the letters' top shows. It is an SVG text stretched to the row by letter spacing, so any name fills it at every width, and it is hidden from screen readers (the name is already the footer's brand). `wordmarkOrder: 'first'` puts the row before the rest. The default, `none`, draws the footer exactly as before.
