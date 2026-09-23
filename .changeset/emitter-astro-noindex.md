---
'@contentrain/emitter-astro': minor
---

noindex: `EmitPost.noindex` / `nofollow` and `QueryPage.noindex` / `nofollow` print `<meta name="robots">` on the page, and noindex pages are left out of the sitemap through a `sitemap({ filter })` built from their addresses. The template page's `robots` and `googlebot` tags are removed from the head chrome, so one page's noindex no longer spreads to every page.
