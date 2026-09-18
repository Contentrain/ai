---
"@contentrain/emitter-astro": minor
---

Every page describes itself in structured data. The Seo component prints one JSON-LD `@graph`: a `WebPage` (`CollectionPage` on list pages) whose `@id` is the address Astro built, with `inLanguage` and — when the head chrome kept the site's own WebSite node — `isPartOf` pointing at that node's `@id`; a `BreadcrumbList` when the producer supplies a trail; and on entry pages the `Article`, now linked to the page by `mainEntityOfPage: { "@id" }` instead of repeating an inline WebPage.

`EmitPost.breadcrumbs` and `QueryPage.breadcrumbs` take the trail to the page, the page itself excluded: the emitter appends it at its own address, so the last crumb cannot disagree with the page. Every crumb needs a name and a site-root-relative path; a trail with one that does not is dropped and counted in the warnings. Without a trail there is no BreadcrumbList, and nothing is derived from the URL. The structured data is built by `pageStructuredData` in the emitted runtime.
