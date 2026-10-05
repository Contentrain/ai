---
"@contentrain/types": minor
---

`site.post.meta` and `site.entryLayouts[route].meta`: the block a source's single template prints after the content (Twenty Twenty-Five's post meta), as columns of rows of tokens — the theme's own words (`{ text }`, in the site's language) and the entry's parts (`{ part: 'date' | 'author' | 'terms' | 'tags', prefix?, suffix? }`, the block's own words printed only with the part) in the source's order. `validateProjectPlan` checks its shape. The astro starter renders it after the body of a post and of a custom type's entry (`components/PostMeta.astro`); without it, the post keeps its tags row.
