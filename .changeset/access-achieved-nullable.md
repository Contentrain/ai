---
"@contentrain/types": minor
---

`CapabilityManifest.access.achieved` is nullable: a site can answer nothing a rung describes

The field is documented as "the highest source-access rung actually achieved",
and the union has four rungs with no way to say none of them was reached. A
discovery scan of a site behind an access wall still produces a manifest — the
offer screen has to show that site too — so producers were writing
`achieved: 'rest_public'` beside `rest_status: null`. That is a manifest
contradicting itself, and it makes the access ladder unreadable: the coverage
figures are computed from this field, and every site reporting the same rung
measures nothing.

`achieved: SourceAccessKind | null`. Nullable rather than optional, and rather
than a `'none'` rung:

- **Optional** would let a producer omit the field and call that "not measured"
  — the exact failure the field exists to prevent. Required-and-nullable makes
  "I reached nothing" something the producer has to say out loud.
- **A `'none'` rung** is worse, because `SourceAccessKind` is also
  `RawProvenance.kind`, where it answers "how was this data obtained". A RawIR
  stamped `kind: 'none'` is a document that exists without having been
  obtained: an impossible state made representable in an unrelated contract.
  `SOURCE_ACCESS_LADDER` would also stop being a ladder — it is an ordered
  array and coverage arithmetic indexes into it.

`null` reads with `rest_status: null` beside it as its evidence. Coverage
arithmetic should drop these sites from the numerator rather than score them
zero: a site behind an access wall was not measured, it did not fail.

**This is breaking for readers.** Code that did `manifest.access.achieved` and
compared it to a literal now sees `| null` and needs a guard. Known consumers:
the migration engine (one line, already planned); `@contentrain/query`,
`@contentrain/mcp` and Studio do not read this field.


---

Also: `ExecutionEstimate` gains `bytes_stored` and `bytes_out`.

Cost is metered before it is priced. A run's bill is assembled from tokens,
compute time, bytes at rest and bytes moved, and those are what a runner can
measure when a step finishes; `cost` is the conversion, usually computed later
from them. The shape had `tokens`, `duration_ms` and `items` but nothing for
size, so a migration runner measuring a built artefact had nowhere to put it.

Two fields rather than one `bytes`, because object storage and egress are
billed by different rates against different quantities: a run that stores 40 MB
once and serves it a thousand times has one storage figure and a very different
transfer figure. `items` stays a count — how many entries, files or assets were
written, not how large they were.

Both are covered by `plan_hash`, like every other estimate field: a plan
approved at one cost must not run at another.
