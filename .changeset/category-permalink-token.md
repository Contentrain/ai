---
"@contentrain/types": minor
"@contentrain/wp-import": minor
---

A `:category` permalink token, so WordPress `/%category%/%postname%/` sites keep their post URLs.

- `@contentrain/types`: `PlanPermalink` documents `:category` for `site.permalinks.post`; the plan validator rejects it in any other permalink.
- `@contentrain/wp-import`: posts get a `primary_category` relation to `categories` from Yoast's `_yoast_wpseo_primary_category` or Rank Math's `rank_math_primary_category` (a term id), which is the category WordPress puts in `%category%`. A primary that names no imported category is dropped and counted in `dropped_relations`.

The astro starter fills `:category` with the post's primary category, else its category with the lowest term ID, with its parents (`news/local`); a post with none takes `siteConfig.defaultCategory` (default `uncategorized`), as WordPress does.
