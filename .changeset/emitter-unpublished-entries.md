---
'@contentrain/emitter-astro': minor
---

Only published entries are built. `EmitPost.status` and `publish_at` (the entry's `EntryMeta`) hold back drafts, entries in review, rejected or archived ones, and posts scheduled for later (`publish_at` after `options.now`, default the emit time); `EmitPost.visibility` other than `public` (password-protected or private) is never built, whatever its status. None of them gets a page, sitemap line, feed item, llms.txt link, list card or hreflang alternate. A published page's link to a held-back entry is kept as its text, and a redirect to one is returned in `redirects.manual`. `EmitResult.withheld` lists the held-back entries and the unlinked links. Content without a status, `publish_at` or `visibility` is emitted as before; `options.requireStatus: true` holds back every entry that carries no status instead (fail closed), with a warning.
