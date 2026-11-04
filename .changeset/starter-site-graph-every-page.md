---
"@contentrain/astro-kit": patch
---

Starter (rides this release): every page's JSON-LD now holds the site's WebSite and Organization nodes, not only the home's, so a post's `publisher` and `isPartOf` references resolve on the page itself. A post also prints its BreadcrumbList (home, its first category, the post), as Yoast prints a post's.
