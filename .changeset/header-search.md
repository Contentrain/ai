---
"@contentrain/types": minor
---

`PlanSite.chrome.header.search: true`: the source's header holds a search form. The validator accepts only `true`. The Astro starter's BaseLayout passes the kit Header its search field (a GET form to `/search/` under the base, labels from `search.*` ui-strings) when `site.config` sets `chrome.header.search`; before, the starter never drew the header search a migrated site's header had (x06: `part_missing search` on 297 of 299 pages).
