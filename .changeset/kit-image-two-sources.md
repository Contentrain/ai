---
'@contentrain/astro-kit': minor
---

`KitImage` optimizes images from both places a site's media lives: raster files under `public/` (read at build time through a lazy glob, only the ones a page shows) and a media host the site allows in `image.remotePatterns` (the starter allows its Contentrain Studio project's `/api/cdn/v1/<project>/media/**`). Both get a `srcset` of widths up to the image's own. A vector, a host the site does not allow or a remote image of unknown size stays a plain `<img>`: nothing is fetched from a host the site did not name.
