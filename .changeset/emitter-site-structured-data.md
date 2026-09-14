---
"@contentrain/emitter-astro": minor
---

A migrated site keeps its site-wide structured data. SEO plugins write WebSite and Organization into the same JSON-LD `@graph` as the page's own WebPage, Article and BreadcrumbList, and the emitter removed any block with a page-scoped node whole — taking the site's identity with it. A mixed block is now split: WebSite and Organization (and the nodes they reference by `@id`, such as the logo) stay in the head chrome, the page nodes go, and the warning names both. A WebSite `SearchAction` is dropped, since it points at WordPress search.

Page-scoped types now include every `…Page` and `…Article` subtype and `BreadcrumbList`. An archive template's CollectionPage, or a breadcrumb naming the template page's trail, used to stay on every page.
