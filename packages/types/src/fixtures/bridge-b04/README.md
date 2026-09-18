# Bridge B-04 fixtures

Output of `Contentrain/wordpress-bridge` `feat/b04-seo-redirects@e97f2c0`
(`tests/seo.sh`, local Docker fixture). Owned by the Bridge; copied here
unchanged so the types are checked against what the producer actually emits.

- `seo.json`, `routing.json`, `redirects.json`: the Bridge's
  `bridge/{seo,routing,redirects}.json`, byte for byte.
- `seo-entries.json`: five of the 31 entries of `bridge/seo-entries.json`,
  each copied unchanged: a resolved Yoast post (`post:1`), a post with data
  in all three providers (`post:11`), a deliberately noindex post (`post:12`),
  a deliberate cross-domain canonical (`post:13`) and a category archive
  (`term:category:2`).

`RawIR.seo` is `{ ...seo.json, entries: seo-entries.json }`, which is how the
Bridge's `tools/prepare-migrate.mjs` assembles it.
