---
'@contentrain/astro-kit': minor
'@contentrain/types': minor
---

The header site name takes the source theme's colour where it is not the header's text colour. `Header` gains `brandColor`: `link` paints the name in the site's link colour (a title that is a link styled like every other, as Hello Elementor's is), or a colour (`#hex`, `rgb()`, `hsl()`) is used as it is; anything else is ignored. `site.chrome.brandColor` carries it in the plan, validated (`link` or a colour; never a `;` or `url()`), and the starter's BaseLayout passes it through the same guard. Without it the header is exactly as before.
