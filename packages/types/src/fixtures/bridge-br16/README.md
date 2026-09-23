# Bridge BR-16 fixtures

Output of `Contentrain/wordpress-bridge` #18 (BR-16, `contentrain-bridge-seo@1`)
at `f6c7ca8`, from its acceptance CI (run 35925219694, artifact
`contract-fixtures`). Owned by the Bridge; copied here unchanged so the types
and `seoFromRawEntry` are checked against what the producer actually emits.

- `seo.json`: the Bridge's `bridge/seo.json` — four providers, SEOPress
  settings included.
- `seo-entries.json`: one entry of `bridge/seo-entries.json`, `post:23`, with
  a block from every provider: Yoast resolved (the running plugin), Rank Math,
  AIOSEO and SEOPress rendered by the Bridge (`rendered`, `rendered_by`,
  `template_source`, `unresolved`).
