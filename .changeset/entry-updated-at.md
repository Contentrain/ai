---
"@contentrain/types": minor
"@contentrain/mcp": minor
---

feat: entry meta records when it was last written

`EntryMeta` gains `updated_at` (ISO 8601, UTC), stamped on every write.

Studio cannot offer "sort by recently edited" because the data does not exist:
entry meta carried `status`, `source` and `updated_by`, and nothing about when.
The doc comment on `mergeEntryMeta` already stated the principle — "`source`/
`updated_by` describe *this* write, so they are stamped every time" — and
`updated_at` is squarely in that category.

Optional, and deliberately not backfilled. It is a fact about the past, and an
entry written before the field existed has no recoverable value. A fabricated
timestamp would be worse than an absent one, because it would sort. Absent
means unknown; the first write mints the real value.

Two functions now mint entry meta, and both stamp:

- `mergeEntryMeta` — a content write. It still refuses to touch `status`,
  because editing a field must not unpublish an entry.
- `applyStatusChange` — new, and the one mint permitted to set `status`,
  because changing it is the operation. A status-only write is a write and
  gets the same stamp; Studio's status picker takes this path.

Six places built entry meta by hand before this — four in `contentrain_bulk`,
one in the validator's orphan-meta repair. A timestamp added to each would
have been forgotten by the fifth, so they now route through the two mints
instead. The validator keeps `source: 'import'`, which is deliberate: that
record is fabricated for content that arrived without one.

Conformance fixtures regenerated — one line per meta file, at the suite's
frozen clock.
