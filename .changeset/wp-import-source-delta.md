---
"@contentrain/wp-import": minor
---

`planSourceDelta` places a bridge's `SourceDeltaPlan` in the repository's store.

- Every record gets its model, entry id and locale. Post-type records are placed through the `EntrySourceMap`; terms and media by `wp_id` in their own model, never through the post map. A record that cannot be placed gets `unmapped` with a reason.
- `updated` and `moved` records get `fields_changed` against the incoming export.
- Every changed address adds a 301 to `redirects`.
- `deleted` stays a tombstone, with trashed and purged kept apart.
- A record the repository also edited since the import gets `conflict: true` and the edit's `repo_edit`; it is never overwritten.

The planner is pure and plan-only. `formatSourceDeltaReport` prints the plan for a dry run.
