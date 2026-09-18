# Bridge delta fixtures

Output of `Contentrain/wordpress-bridge` (local Docker fixtures). Owned by the
Bridge; each file is copied here unchanged.

- `bridge-e2e/`: the B-11 end-to-end delivery (`feat/b07-integrations@31a611e`,
  `tests/e2e.sh`). `t1.delta.json` is the delta between the two deliveries:
  post 62 updated, post 63 moved (slug), post 64 trashed. `t0/` is the store as
  delivered at T0, and `t1/` is the export at T1. Only the files the planner
  reads are copied: `config.json`, the `wp-post` model, the content and meta of
  entries 62–64, and `bridge/entry-source-map.json` (stored beside them here).
- `bridge-b06/delta.json`: B-06's twelve-mutation delta
  (`feat/b06-delta-cursor@03b0327`, `tests/delta.sh`). It covers created,
  updated (including a meta-only edit), moved by slug, by parent and by term
  base, trashed and purged. That run writes no store, so the tests plan it
  against an empty one.

The negatives (a repository edit, a record missing from the map) are derived
from these inside the tests. None is a separate fixture.
