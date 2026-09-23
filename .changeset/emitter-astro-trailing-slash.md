---
'@contentrain/emitter-astro': minor
---

`options.trailingSlash: false` keeps the addresses of a site whose permalinks end without a slash. The build writes files (`/hello.html`, served at `/hello`) with Astro's `trailingSlash: 'never'`, `vercel.json` gets `cleanUrls`, and the canonical, og:url, hreflang, sitemap, feed and llms.txt all name each page `/hello` — the form the source was indexed under. The default (`/hello/`) is emitted as before.
