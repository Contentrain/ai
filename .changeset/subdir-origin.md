---
"@contentrain/types": patch
"@contentrain/astro-kit": patch
---

A WordPress installed in a directory (`https://example.com/blog`) moves to a site served from that directory.

- `@contentrain/types`: `validateProjectPlan` accepts a sub-directory install as `source.origin` (`https://example.com/blog`): its paths keep the prefix. An origin with a trailing slash, a query or a fragment is still refused.
- `@contentrain/astro-kit`: `KitImage` serves a root image address (`/media/a.svg`) that it does not optimize from the site's directory under Astro's `base`, where `public/` is served. Without `base` nothing changes.

The astro starter serves every address under astro.config `base` (`base: '/blog/'`, which a migration writes for such an install): the route table, links in menus and bodies, redirect pages and `_redirects` (old and new addresses), WordPress's query addresses, the sitemap, the feed (its channel link too), `llms.txt`, canonical and Open Graph URLs, JSON-LD, the favicon, search (Pagefind), body images and the file and link fields of a custom type's page. Plan and store paths stay the install's (`/about/`). `scripts/check-dist.mjs` fails a site served from a directory when a page or a host rule points outside it. Its `wp-query-map.json` check accepts an absolute target (an attachment whose file stays at the old site's address). Without `base` the built site is unchanged, except that an absolute link to the site's own feed (`https://example.com/rss.xml`) is written as `/rss.xml`, like every other link to the site.
