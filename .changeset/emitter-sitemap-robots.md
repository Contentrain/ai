---
"@contentrain/emitter-astro": minor
---

Emitted projects get a sitemap and a `robots.txt`. The sitemap comes from `@astrojs/sitemap` at build time, so it lists exactly the pages the build produced (the 404 page is not among them); `public/robots.txt` allows every crawler and names `sitemap-index.xml` by absolute URL. Without `site.url` the integration is left out, `robots.txt` carries no `Sitemap:` line, and a warning says so. `options.sitemap: false` turns both off, independently of `options.seo`.

A project emitted without `site.url` now builds: `astro.config.mjs` used to carry `site: ""`, which Astro rejects as an invalid URL.
