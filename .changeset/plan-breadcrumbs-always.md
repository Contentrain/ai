---
'@contentrain/types': minor
---

A project plan can say that the source prints a breadcrumb on every page. `site.chrome.breadcrumbs: 'always'` is for a source whose top-level pages show one too, starting from the home page (Yoast, Rank Math or the theme's own). The starter then shows Home › Page on those pages with their BreadcrumbList, and puts Home in front of a nested page's trail. Without the key, only nested pages show a breadcrumb, as before. `validateProjectPlan` accepts `'always'` and nothing else.
