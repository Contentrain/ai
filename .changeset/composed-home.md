---
"@contentrain/types": minor
---

A front page composed from sections with no page entry: `site.home` of kind `page` names a `slug` or a `view` (validated: one, never both or neither). With `view`, the starter renders that composed view at `/` with a page synthesized from the site (its title, its home SEO from the `site` singleton's `seo` and `social_image`, no body). One mechanism carries a post list into a composed page: page 1 of the list is passed to the view as `list` (`{ posts, base, current, total }`, sticky posts first), and pages 2…N stay plain lists with the same title and SEO. It applies at `/` when that front keeps the list there (`permalinks.blog` is `/`), and at the posts page's address when that page has a composed view, which now keeps its own sections instead of being replaced by the list. Starter fixtures `composed-home` and `composed-blog` gate both.
