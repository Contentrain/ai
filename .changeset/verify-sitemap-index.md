---
"@contentrain/verify": patch
---

`loadSiteDirectory` follows a sitemap index to the sitemaps it names. It used to keep whichever `sitemap*.xml` sorted last — with `@astrojs/sitemap` output, the index — and read its entries as pages, so every page was reported missing from the sitemap and every child sitemap as stale. A named sitemap the build does not serve is now a stale entry. A bare index passed to `verify` directly skips the membership checks and says so in `report.skipped`.
