---
"@contentrain/mcp": major
"@contentrain/types": minor
---

feat(mcp)!: enforce the field constraints the schema already accepted

A project reported that `items`, `accept` and `maxSize` are accepted on a field but
never enforced — `emails: ["not-an-email"]` and `accept: "image/jpeg"` against a
`.webp` both produced zero errors. The report was right, and the surface was larger
than the three properties it named: **4 of 27 field types had any semantic
validation**, three constraints were read by nothing, and none of it blocked a write.

A constraint that isn't a constraint is worse than no constraint — the author stops
looking.

**`content_save` now validates before committing and refuses to write.** It ran
`plan → commit → validate → report`, so an invalid value landed in git, was
auto-merged, and the caller learned about it from a string in `next_steps` while
`status` still said `"committed"`. Validation now runs on the pending changes and
blocks on errors, returning `isError` and no commit. Warnings still pass — they are
heuristics, and a legitimate value can sit outside an approximate pattern. Only the
entries being saved are fatal: a pre-existing bad entry elsewhere in the model does
not hold up an unrelated save.

**Array items share the scalar rule set.** They ran through a parallel type switch
that knew 10 of the 27 types and checked only `typeof`, so `min`/`max`/`pattern`/
`options` never reached an item, and `items` given as a FieldDef with a non-object
type (`{type:'array', items:{type:'string', max:50}}`) matched no branch at all —
silently unvalidated, while the type emitter rendered it as real. Items now recurse
through the same validator, which also closes the `integer` split where `3.7` was
rejected inside an array but accepted as a scalar.

**17 types were pure `typeof` checks.** `slug` now uses the `SLUG_PATTERN` the
codebase already owned — every shipped template declares `slug: { type: 'slug' }`,
so `"Hello World!!"` used to validate clean. `date`/`datetime` are parsed (the same
check `schedule.ts` already did for meta), `percent` is range-checked, and `color`/
`phone` warn. Mechanical rules are errors; heuristics are warnings. `email`/`url`
keep their existing warning severity. `rating` is deliberately untouched — its scale
is never declared, so any range would be invented.

**`unique` works on documents.** It was gated on a context only the collection
validator passed, so it was a no-op exactly where every shipped template declares it.
On singletons it is now rejected at model_save: the model holds one record per
locale, so there is nothing to compare against.

**The dead constraints, handled honestly.** `accept` is enforced by extension-sniff
and says that is what it is. `default` is coherence-checked at model_save (right
type, within its own `options`) but not written into content. `maxSize` **cannot be
enforced by MCP** — it holds a path, never the bytes — so model_save now says so and
points at the provider, which owns the policy at ingest. The docs claimed all three
worked; they no longer do.

**model_save rejects what it will not enforce.** `options` on a non-select, `items`
on a non-array, `accept`/`maxSize` on a non-media field, `min > max`, and an
uncompilable `pattern` are now errors instead of silent no-ops. Nested `fields`/
`items` schemas are validated recursively — they were typed `z.unknown()` and never
checked. The field schema is `.strict()`: a typo'd constraint (`requird: true`) used
to be stripped without a word.

BREAKING CHANGE:

- `content_save` rejects content it previously committed. Run `contentrain_validate`
  before upgrading to see what would now be blocked.
- `model_save` rejects models it previously accepted (unknown keys, `min > max`,
  `options` on a non-select, `unique` on a singleton).
- `validateModelDefinition` returns `{ errors, warnings }` instead of `string[]`.
- Array-item type errors carry `validateFieldValue`'s message ("Type mismatch:
  expected string, got number") instead of "must be a string". The field path is
  unchanged.
- Nested object errors are qualified by their parent (`seo.title`, not `title`) —
  a bare name was ambiguous with a top-level field.

`@contentrain/types` gains `validateSemanticType`, `validateAccept` and
`isMediaType`; `validateFieldValue` now applies semantic and `accept` rules.

Studio picks all of this up automatically — its `content-validation.ts` delegates to
this validator.
