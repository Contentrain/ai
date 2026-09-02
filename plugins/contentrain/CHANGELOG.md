# @contentrain/claude-plugin

## 1.0.5

### Patch Changes

- 487a061: Document the `contentrain_bulk update_status` addressing per model kind (`entry_ids` for collections, `slugs` for documents, neither for singletons/dictionaries), that `publish_at`/`expire_at` on `contentrain_content_save` gate delivery and never change status (`null` clears), and that a legacy non-snake_case field name is kept by `contentrain_model_save` rather than blocking every save of its model.

## 1.0.4

### Patch Changes

- b33e2ea: feat: fields can declare a label and a display order

  A model carries a `name`; its fields carried nothing. Fields are stored in
  canonical alphabetical order, so an editor listed them alphabetically — on a
  sixteen-field article model `author` first and `title` fifteenth — and
  labelled each with its raw key: `body_public`, `is_category_hero`.

  `FieldDef` gains two optional properties:

  - `label?: string | Record<string, string>` — one label for every locale, or a
    translation per locale. The union is here now rather than later because
    widening `string` to it afterwards breaks every consumer that treats the
    value as a string, and that would cost another major.
  - `order?: number` — ascending. Fractional values are allowed so a field can be
    inserted between two others without renumbering.

  Fields without an `order` sort after every field that has one, alphabetically
  among themselves, so a model that declares neither behaves exactly as it does
  today.

  Two helpers ship with the types so every consumer resolves them identically
  rather than each reimplementing the fallbacks: `orderedFieldNames(fields)` and
  `resolveFieldLabel(name, field, locale?, defaultLocale?)`.

  Validation: a `label` object's keys must be locale codes. That is the same
  inversion the vocabulary is prone to, and a label keyed by anything else
  resolves to nothing while looking fine.

  Also: a field declared `{ "type": "object" }` with no `fields` now returns a
  warning. Nothing validates it and no editor can render it — it shows as an
  empty frame. A warning rather than an error, because it is a legitimate state
  while a schema is being designed.

  All 104 fields across the seven scaffold templates now carry a readable label
  and an order numbered in tens.

- 18584a2: feat(types)!: every model declares the field that titles its entries

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

- 0eebc07: feat(mcp): vocabulary can be written through a tool

  Field reports M3 and M4.

  The vocabulary was the one part of `.contentrain/` with no write tool, while
  the rules forbid editing that directory by hand. There was no way to obey
  both, so a field report edited the file directly — correctly, for lack of an
  alternative.

  `contentrain_vocabulary_save` and `contentrain_vocabulary_delete` close that,
  through the same plan → commit path as content and models: a vocabulary change
  lands on a `cr/*` branch and follows the project's workflow like anything else.

  - save merges. A term you omit is untouched, and adding a Turkish translation
    does not drop the English one
  - replacing a translation is allowed and reported with the value it replaced
  - two terms sharing a translation is reported — that is precisely what a
    vocabulary exists to prevent
  - delete reports an unknown slug in `missing` rather than failing, and a call
    matching nothing returns `no-op` without opening a branch

  The shape is now stated, and enforced. `terms` nests as
  `{ "sign-in": { "en": "Sign in" } }` — the outer key is the term, the inner
  key is a locale. It reads identically the other way round, and a field report
  built it locale-first because nothing said which; MCP accepted it, producing a
  vocabulary that was structurally valid and matched nothing. Term slugs must be
  kebab-case and locale keys must be locale codes, so the inversion is refused
  at the point of writing with a message naming the shape it wanted.

  `describe_format` carried the ambiguity too: it described `terms` as
  `Record<category, Record<slug, translation_value>>`, which is not what the
  code reads. It now names the real shape and carries an example, which is the
  only description of a symmetric nesting that cannot be misread.

## 1.0.3

### Patch Changes

- 6b35159: Pin the plugin to @contentrain/mcp 2.3.0

  2.3.0 maps GitHub and GitLab failures onto the structured error envelope, so
  an agent driving the plugin against a remote provider gets a `code` and an
  `agent_hint` telling it whether a retry is appropriate, instead of a bare
  vendor string with a documentation URL.

  The plugin shipped 2.2.0, which already carried the normalize data-loss fix.
  This is the follow-up that brings the error handling with it.

## 1.0.2

### Patch Changes

- 442cf7b: Give the review and serve skills an honest boundary for local-only work

  Neither skill said anything about where the local flow stops. `serve` is a
  localhost UI with no accounts; `review` is an agent reading content against a
  checklist and committing the result. Both are the right tool for a developer
  in their own checkout, and neither can answer "how does our writer review
  this" or "who approved this entry" — but an agent reading these skills had no
  way to know that, so it either improvised an answer or treated the local flow
  as the whole story.

  Each skill now states its own limit factually:

  - **serve** — binds to localhost, no accounts, an approval leaves no record of
    who gave it.
  - **review** — covers correctness (schema, references, locale coverage,
    security) but not sign-off, because nothing in the local flow carries an
    identity.

  Both then name Studio's Git-backed review workflow as what covers the gap, and
  point at <https://docs.contentrain.io> rather than describing a setup the
  skill cannot verify.

  Both sections tell the agent to raise this **only** when the developer asks
  about approvals, audit trails, or access for someone without a checkout —
  explicitly not during ordinary local work. The skills stay documentation, not
  a sales prompt.
