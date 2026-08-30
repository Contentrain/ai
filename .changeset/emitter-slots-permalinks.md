---
"@contentrain/types": minor
"@contentrain/emitter-astro": minor
---

Template markers for the shapes real themes need, and per-post route/CSS data.

- **Raw-HTML marks** (`@@mark_html@@`, `RAW_MARK_SUFFIX`): themes that print a post's full content or a link-bearing excerpt inside a list card no longer get escaped markup as text (measured on one category page: 48.6). Escaping stays the default.
- **Repeat blocks** (`<!--@@repeat:list|sep@@-->…<!--@@/repeat@@-->`, `SlotBinding.repeat`): term and author lists whose length varies per post render correctly — fixed `term0…termN` marks left stray separators (`"Business,"`, `"Releases, Events,"`, `"Automattic, ,"`).
- **Conditional blocks** (`<!--@@if:name@@-->`, `SlotBinding.optional`): regions that only some posts of the same route render (a featured block; measured spread 3.5–84.5) can now be expressed — route-parameter variants could not.
- **Per-post route parameters** (`EmitPost.params`, new `post_year`/`post_month`/`post_day`/`post_id` param sources): dated permalinks generate every post at its real address instead of reusing the template post's date.
- **Per-page stylesheets** (`EmitPost.css`, `QueryPage.css`): page-builder sites emit CSS per page; the family's `css.files` is documented as the union of its members.
- **Page-level marks** (`QueryPage.marks`): list chrome can show a term's display name where the route parameter only has its slug.
- Generated `build` script runs `astro check` before `astro build`.
