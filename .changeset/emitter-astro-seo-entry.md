---
'@contentrain/emitter-astro': minor
---

Per-page SEO the source's plugin set now survives the migration. `EmitPost.seo_title` is the page's `<title>` (the entry's `title` stays the Article headline and last breadcrumb); `open_graph` and `twitter` on `EmitPost` and `QueryPage` override the derived share-card tags; `schema` carries the plugin's JSON-LD graph (FAQ, HowTo, Product) and is printed instead of the generated one, without the WebSite `SearchAction` or a copy of the head's WebSite node. The template head's `twitter:site` is now kept. `seoFromRawEntry()` maps a Bridge `RawSeo` entry to these fields.
