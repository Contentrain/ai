---
"@contentrain/types": minor
---

`SourceDeltaEntry` gains four optional fields that a planner fills in when it places an origin delta in a store:

- `unmapped`: why a record has no place, one of `not-in-source-map`, `no-model-for-type` or `entry-not-found`.
- `fields_changed`: which stored fields differ from the incoming export.
- `repo_edit`: the repository-side write behind `conflict`, as `{ updated_by, updated_at?, source }`.
- `entry_id_after`: the new entry id when a move changes a slug-derived id.
