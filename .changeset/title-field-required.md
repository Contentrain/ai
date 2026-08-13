---
"@contentrain/types": major
"@contentrain/mcp": major
"@contentrain/rules": minor
"@contentrain/skills": minor
"contentrain": minor
"@contentrain/claude-plugin": patch
---

feat(types)!: every model declares the field that titles its entries

Consumers had to guess which field to show as an entry's title, and the guess
was wrong in ways that made listings unusable: an integration group titled
`i-lucide-bot` because its description exceeded a length threshold and the
icon was the next short string; an article titled by its slug; a hero slide
titled `f3a81c09d24e`, a relation ID.

Guessing cannot be fixed, only made wrong differently. `title_field` replaces
it with a declaration.

Validation, on write and on read:

- missing, empty or non-string — rejected
- names a field this model does not declare — rejected
- names a field whose type cannot render as text — rejected. The allowed set
  is `string`, `text`, `slug`, `email`, `url`, `code`, `markdown`, `richtext`.
  `icon`, `color`, `phone`, `select`, `date`, `image` and `relation` all store
  strings, which is exactly why the rule is by meaning rather than by `typeof`
- dictionary models have no fields, so their only legal value is the reserved
  `"key"` — the entry key is the title
- pointing at an optional field is a warning, not an error: the title may
  render empty

Migration is one command. `contentrain validate --fix` backfills a missing
`title_field` and reports each choice as a notice naming the rule that made
it, so a wrong pick is visible and correctable. A `title_field` that is
present but names the wrong field is reported and never rewritten — filling a
gap is migration; changing an answer is a decision.

Verified against this repository's own eleven models: ten resolve by name
match, and `faq` resolves to `question` rather than `answer` because the
inference prefers a short scalar over a long-form body.

BREAKING CHANGE:

- `ModelDefinition.title_field` is required. TypeScript consumers that
  construct a model will not compile until they add it.
- `contentrain_model_save` and `contentrain_apply` (extract mode) reject a
  model without a valid `title_field`. Extract infers it from the extracted
  fields when omitted and reports the choice in the dry run; it refuses to
  extract into an existing model that has not been migrated.
- `contentrain_validate` reports a missing `title_field` as an error, so a
  project that has not been migrated validates red until `--fix` runs.
- `contentrain validate` now exits 1 on an invalid project. It previously
  printed the errors and exited 0, so a CI step running it passed regardless
  of what it found. `contentrain doctor` has always exited 1.
- `validate --fix` writes the repaired model on `cr/fix/validate` and
  auto-merges it even under the `review` workflow, as it already did for its
  other structural repairs.
- `validateModelDefinition`'s input widened to accept `title_field`.
- `contentrain_doctor`'s `--usage` analysis no longer reports collection entry
  IDs and document slugs as unused keys — they are fetched by query and were
  never referenceable by name. The check covers dictionaries only and is
  renamed 'Unused dictionary keys'. On a real project this removed ~120 of 134
  warnings.
- Doctor's Models check now validates definitions rather than only parsing
  them, and detects an unparseable model file — which it previously could not,
  because it enumerated models through a helper that silently drops them.

`MODEL_FIELD_ORDER` moves to `@contentrain/types` as the single definition of
canonical key order, replacing two copies that had to be kept in step by hand.
It is exhaustive over `keyof ModelDefinition` by compile-time assertion, so a
future property cannot be added without placing it.
