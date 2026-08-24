# @contentrain/mcp

## 3.1.1

### Patch Changes

- Updated dependencies [7aa4424]
  - @contentrain/types@1.3.0

## 3.1.0

### Minor Changes

- ea328a5: Divergence becomes a product state, and reconcile becomes its exit.

  **Truth first (types, mcp, cli).** A diverged base branch — commits the
  `contentrain` branch lacks, the state a dual-domain migration PR leaves
  behind — is no longer reported as a failed write. The content lands on
  `contentrain` either way; auto-merge writes and `contentrain_merge` now
  return `base_advance: 'advanced' | 'blocked_diverged'` (shared vocabulary
  with Studio's approve contract — a PR is an attachment, never a third
  state) plus `remote_push: 'pushed' | 'rejected' | 'no-remote'`, where a
  non-fast-forward push rejection used to be swallowed silently.
  `mergeBranch` gains the fetch + base-sync pre-step the write path already
  had, so one clean base commit no longer kills every approve; the merged
  `cr/*` branch is pruned even when the advance is blocked, ending the
  phantom pending-review rows in the serve UI. `contentrain_status` and
  `contentrain status` count BOTH directions (`in_sync / content_ahead /
base_ahead / diverged`) — one-directional counting reported the exact
  state that blocks every advance as "in sync". Serve approve endpoints
  return the new fields and carry structured error data; transaction-layer
  fetch/push is hardened (no credential prompts, block timeout).

  **The reconcile primitive (types, mcp).** `planReconcile`
  (`@contentrain/mcp/core/ops`) is a content-aware three-way merge over
  three ref-bound `RepoReader`s (merge-base / contentrain / base). One side
  changed → mechanical merge at entry-, key-, and term+locale granularity;
  both sides changed the same item → a `ConflictItem` with a CLOSED `code`
  union (consumers key localized editor questions on it) and an id that
  hashes position AND values — a resolution made against a stale dry-run is
  dropped and the conflict re-reported (compare-and-set). Document bodies
  are never text-merged; models carry `suggested: 'theirs'` as advice,
  never auto-applied; context.json is always regenerated. `RepoProvider`
  gains optional `getMergeBase`/`createMergeCommit` members and the
  optional `mergeCommit` capability (GitHub: two-parent Git Data API
  commit; GitLab: absent, MR fallback; both keep external `implements`
  code compiling).

  **Executors and surfaces (mcp, cli).** `reconcileBranches`
  (`@contentrain/mcp/git/reconcile`) runs a real `git merge --no-commit`
  in a temp worktree and writes the entire plan over it — the planner is
  authoritative for content paths, git for everything else — then commits
  with two parents and fast-forwards the base. `contentrain_reconcile`
  (new tool, local-only, dry_run-first like `contentrain_apply`) and
  `contentrain reconcile` (interactive CLI: plan summary, one ours/theirs
  question per conflict, `--yes` never defaults a conflict) are the
  product doors. Every `blocked_diverged` surface names them as the exit.

### Patch Changes

- Updated dependencies [ea328a5]
  - @contentrain/types@1.2.0

## 3.0.3

### Patch Changes

- Updated dependencies [d04947f]
  - @contentrain/types@1.1.0

## 3.0.2

### Patch Changes

- Updated dependencies
  - @contentrain/types@1.0.2

## 3.0.1

### Patch Changes

- Updated dependencies [0430ce2]
  - @contentrain/types@1.0.1

## 3.0.0

### Major Changes

- 809b6b1: fix(mcp)!: a document save no longer replaces what it did not send

  Saving a `document` entry rewrote the whole file from the payload. A save
  carrying one frontmatter field wrote a file containing only that field — and
  an empty body. The response said `valid: true`, because validation runs over
  the plan's own output, which was internally consistent and wrong.

  Reported from a live project: a 495-byte page reduced to its frontmatter by an
  SEO-title edit. It was caught only because that project runs the review
  workflow; under auto-merge it reaches the default branch unannounced.

  Documents were the only kind that behaved this way. Collections and singletons
  have always merged with what is on disk. They now match:

  - frontmatter merges — a key the save does not mention is kept
  - an absent `body` means "not editing the body" and the existing one is kept
  - a `body` that is present, even empty, is honoured. Clearing real content
    that way now returns an advisory naming the character count and how to avoid
    it, because an explicit empty string is indistinguishable from a templating
    mistake and silence is what made the original bug expensive

  Both write paths are fixed: `planContentSave` (every MCP tool, Studio, the
  CLI) and the legacy `writeContent` (scaffold, normalize extract — extracting
  into a model that already has documents would otherwise have replaced them).

  The document branch also now reads its own accumulator before disk, as the
  collection branch does, so two entries touching one document in a single call
  compose instead of the second discarding the first.

  BREAKING CHANGE: a caller that relied on `content_save` replacing a document
  wholesale must now send `body` explicitly to clear it, and delete the entry
  with `contentrain_content_delete` to remove frontmatter keys. Every other
  caller gets the fix silently.

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

### Minor Changes

- b660624: feat: entry meta records when it was last written

  `EntryMeta` gains `updated_at` (ISO 8601, UTC), stamped on every write.

  Studio cannot offer "sort by recently edited" because the data does not exist:
  entry meta carried `status`, `source` and `updated_by`, and nothing about when.
  The doc comment on `mergeEntryMeta` already stated the principle — "`source`/
  `updated_by` describe _this_ write, so they are stamped every time" — and
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

- 2274bac: Resolve the git binary once instead of re-walking PATH on every spawn

  Every local write spawns git dozens of times — a `contentrain_init` is 33
  subprocesses — and each one was spawned by bare name, which makes the OS walk
  PATH looking for it. Measured inside a worker process on a 41-entry PATH:
  198.8ms per spawn by name against 22.0ms by absolute path. A malformed entry
  makes it worse: a PATH containing `/usr/bin/git` — the binary itself, added as
  if it were a directory — turns every probe into an ENOTDIR.

  This is not only a test concern. An MCP server launched from an editor
  inherits that editor's PATH, so every real write operation was paying it.

  - `gitBinary()` resolves the executable once per process; `CONTENTRAIN_GIT_BINARY`
    overrides it
  - `createGit()` is now the single constructor for simple-git across mcp and
    cli, so no call site can silently opt back out

  Resolution is conservative — the first PATH entry holding an executable git,
  the same one the OS would have picked. No attempt is made to bypass the macOS
  `xcode-select` shim, which exists to track the active toolchain.

  Provider contract additions, so an implementation can replace git entirely:

  - `RepoProvider.checkWriteReadiness?()` — the tool layer previously asked
    whether a provider was a `LocalProvider`, then reached through to its
    `projectRoot` to count git branches. It now asks the provider whether it
    will accept a write. Optional; a provider that omits it is always ready.
  - `Commit` gains optional `workflowAction` / `sync` / `warning`, and
    `ApplyPlanInput` gains optional `context` / `workflowOverride`. These were
    real concepts that existed only on a LocalProvider-specific type, which
    forced the dispatch to be nominal rather than capability-based.
  - New `@contentrain/mcp/testing/memory` export: `MemoryProvider`, a complete
    `RepoProvider` over `Map`s with real branch snapshots that reads workflow
    from the project's own config. Intended for suites that test what a tool
    decides rather than what git does with the result.

  No behaviour change for existing consumers: the new contract members are all
  optional, and `LocalProvider` keeps its current semantics.

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

### Patch Changes

- Updated dependencies [b660624]
- Updated dependencies [b33e2ea]
- Updated dependencies [2274bac]
- Updated dependencies [18584a2]
  - @contentrain/types@1.0.0

## 2.3.1

### Patch Changes

- 297404d: Detect the stack from workspace packages in a monorepo

  Detection walked _up_ from the project root looking for a monorepo root — "I
  am inside a package, find the workspace" — but never _down_. The common case
  is the opposite: `projectRoot` **is** the monorepo root, and its
  `package.json` holds only tooling (`turbo`, `nx`) while the frameworks live in
  `apps/*` and `packages/*`. Those projects reported `other`.

  That is not cosmetic. The stack is what selects the replacement conventions
  during normalize, and the framework guides exist precisely to make Phase 2
  patch source the way each framework expects. A Next.js monorepo detected as
  `other` sends reuse down a generic path.

  `jsoncrack.com`, a real Next.js monorepo, now reports:

  ```
  before: other
  after:  next  (monorepo: true, pnpm workspaces)
  ```

  Details:

  - Workspace directories come from `pnpm-workspace.yaml` or the `workspaces`
    field. The pnpm file is read line by line rather than with a YAML
    dependency — it is one list of strings with a fixed shape. Only a trailing
    `*` segment is expanded, which covers `apps/*` and `packages/*`; deeper
    globs and negations are skipped rather than half-supported, and the scan is
    capped at 50 directories.
  - When several packages match, the highest-priority stack wins rather than
    the most frequent. A monorepo with one Next app and two React-only packages
    is a Next project; counting would answer `react`.
  - Feature detection had the same blind spot, so an i18n library installed in
    a workspace package was invisible. It now collects workspace dependencies
    too — reporting "no i18n" for a project that has one would send normalize
    down the wrong path.

  Root-level frameworks and non-JS detection are unchanged; a workspace file
  does not shadow a `go.mod`.

## 2.3.0

### Minor Changes

- 28b6b75: Map GitHub and GitLab failures onto Contentrain's structured error envelope

  The remote providers rethrew raw SDK rejections. Local git paths produce
  errors carrying `code`, `agent_hint`, and `developer_action`, but an Octokit
  or Gitbeaker failure reached the client as the vendor's own string — a
  documentation URL, sometimes an embedded JSON response body, and nothing to
  tell the caller whether the operation was worth retrying. An agent seeing
  `"Resource not accessible by integration - https://docs.github.com/..."` has
  no way to distinguish a permission problem it must report from a conflict it
  should retry.

  Provider rejections are now mapped at the same boundary that already
  normalises local git errors, so every provider error is covered — including
  ones added later — without touching the nine `throw` sites in the providers:

  | Code                         | HTTP                                    |
  | ---------------------------- | --------------------------------------- |
  | `PROVIDER_UNAUTHORIZED`      | 401                                     |
  | `PROVIDER_FORBIDDEN`         | 403                                     |
  | `PROVIDER_RATE_LIMITED`      | 403 with an exhausted quota header, 429 |
  | `PROVIDER_NOT_FOUND`         | 404                                     |
  | `PROVIDER_CONFLICT`          | 409                                     |
  | `PROVIDER_VALIDATION_FAILED` | 422                                     |
  | `PROVIDER_UNAVAILABLE`       | 5xx                                     |
  | `PROVIDER_REQUEST_FAILED`    | anything else                           |

  Each carries an `agent_hint` stating whether a retry is appropriate. The
  vendor text is preserved as a parenthetical detail — it holds the only
  specifics available ("Reference already exists") — with documentation URLs
  stripped and the length capped so an embedded response body cannot dominate
  the response.

  Rate limiting is detected from the `x-ratelimit-remaining` header before
  falling back to the message, so a genuine permission 403 is not misreported
  as a rate limit. Errors already carrying a Contentrain code keep it, and
  local git errors are unchanged.

  `extractHttpStatus` and `mapProviderError` are exported from the shared
  provider module; `isNotFoundError` keeps its behaviour and is now built on
  `extractHttpStatus`.

## 2.2.0

### Minor Changes

- cf6f6a8: Fix silent content loss in `contentrain_apply` (normalize extract and reuse)

  A review-mode transaction pushed inside `complete()` and set its
  `pendingReview` flag only _after_ the push returned. When the push was
  rejected — no write access to the remote, offline, or stale credentials —
  the throw skipped that flag, `cleanup()` classified the transaction as
  failed, and deleted the feature branch. The commit was real and correct but
  reachable from nothing, so it was lost to the next `git gc`. Meanwhile the
  caller swallowed the error in a bare `catch {}` and reported
  `action: "pending-review"` with a full `source_map` and `entries_written`
  count, which is indistinguishable from success. Anyone running normalize on
  a repository they cannot push to lost every extracted string and was told
  the extraction had succeeded.

  Three changes:

  - `complete()` marks the review branch as surviving before attempting the
    push, and reports a push failure through the existing `warning` field
    instead of throwing. Publishing is what `contentrain_submit` is for; a
    failed convenience push must not discard committed work.
  - `cleanup()` now prunes a branch only when that cannot lose anything —
    nothing was committed, or the work was already merged into the
    `contentrain` branch. A branch holding a commit reachable from nowhere
    else is kept. A stray `cr/*` ref after a failure is recoverable; a deleted
    commit is not.
  - The `catch` blocks around `complete()` in extract and reuse no longer fall
    through to a value that mimics success. They report `action: "incomplete"`
    plus a `warning` explaining what happened and where the branch is.

  Also: `contentrain_validate` no longer suggests `contentrain_submit` in its
  `next_steps` when that tool cannot run. Validate works over any provider,
  but submit needs a local worktree and a pushable remote, so on a remote
  provider the suggestion pointed at a tool that is not even registered.

## 2.1.1

### Patch Changes

- c189b6f: fix(mcp): stop DEFAULT_INSTRUCTIONS advertising a universal dry_run

  The MCP server instructions told every client to "preview writes with
  dry_run:true, then re-run with dry_run:false" — but `dry_run` exists only on
  `contentrain_apply`. On every other write tool the unknown key is stripped by
  the schema, so an agent following the instructions performed a real write
  while believing it had previewed. The instructions now state the actual
  safety model: writes land on isolated `cr/*` branches, `content_save`
  validates before committing, destructive tools require `confirm:true`, and
  `dry_run` is the `contentrain_apply` preview. Still under the 512-character
  client-UI budget; no tool behavior changes.

## 2.1.0

### Minor Changes

- dbc99fe: feat(mcp): export `contentDirPath` from `@contentrain/mcp/core/ops`

  The helper already existed in `core/ops/paths.ts` (and backs `contentFilePath`
  / `documentFilePath`), but the subpath barrel only re-exported the file-level
  helpers. Exposing the directory-level resolver lets consumers (e.g. Studio)
  resolve a model's content directory through the same `content_path`-aware logic
  instead of maintaining a local copy.

## 2.0.1

### Patch Changes

- a0d5bfe: fix(mcp): make i18n:false delete and meta cleanup safe

  Two bugs a project hit while cleaning up an `i18n: false` collection, plus a
  source-hygiene fix surfaced along the way.

  **`content_delete` no longer destroys content when handed a locale.** On an
  `i18n: false` model, passing a non-default `locale` was destructive: the locale
  mapped onto `data.json` and the default-locale meta, so the call emptied the
  shared content and deleted the wrong meta file while the locale actually named
  kept its stray meta — the opposite of the request. Content is locale-agnostic
  here, so a locale-scoped delete is now rejected with a clear error (both in the
  plan API and the legacy path). Omit `locale` to delete the entry.

  **`contentrain_validate` with `fix: true` now clears the meta layout mismatch it
  warns about.** The "Meta layout mismatch" warning had no remediation, so `fixed`
  stayed `0`. The fix is deterministic and never decides a status: when the
  default-locale meta is authoritative the redundant strays are pruned; when only
  a stray exists it is migrated to the default path so the record is preserved;
  several strays with no default is left for the author to resolve. Consolidation
  runs before the orphan-content pass and gates that pass's draft fabrication, so
  a real published record is never replaced by a fabricated draft and then deleted
  on a later run.

  Also replaced two raw NUL bytes in the validator source (a Map-key separator)
  with a `\u0000` escape — identical at runtime, but the source is now plain text
  instead of being classified as binary by grep/diff/editors.

## 2.0.0

### Major Changes

- 173326c: feat(mcp)!: enforce the field constraints the schema already accepted

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

### Patch Changes

- Updated dependencies [173326c]
  - @contentrain/types@0.9.0

## 1.11.0

### Minor Changes

- d617dab: fix(mcp): stop content_save unpublishing entries, and make bulk update_status persist every id

  Four publish-status bugs, all found on a live project against the CDN. Each one
  reported success while content quietly stopped being delivered.

  **`contentrain_content_save` no longer resets an entry's status.** It rebuilt
  meta from scratch on every write, so editing one field silently moved a
  `published` entry to `draft` — and the next CDN build served the collection as
  `{}`. Editing a field is not a publish decision, and per this repo's own split
  (MCP is deterministic infra; the agent is intelligence) MCP should never have
  been making it. An existing entry now keeps its `status`, `approved_by` and
  `version`; only a genuinely new entry starts at `draft`. `source`/`updated_by`
  still describe the current write. The same reset lived in a second copy behind
  `contentrain_apply` and scaffolding — both now share one `mergeEntryMeta`.

  **`contentrain_bulk update_status` no longer drops entries.** It launched one
  `writeMeta` per entry ID through `Promise.all`, and every call read the same
  snapshot of the shared `{locale}.json` and rewrote the whole file — so N-1
  updates were lost while the response reported all N as updated. It is now a
  single read-modify-write per locale file, and `updated` counts what actually
  persisted. `copy_locale` had the identical race and wrote 1 meta record instead
  of N. Neither had any test coverage; `bulk` now has a suite.

  **`update_status` works on singletons and dictionaries.** The `entry_ids` guard
  ran before the model-kind guard, so a singleton had no reachable path: omitting
  `entry_ids` failed with "requires entry_ids", supplying them failed with "only
  supported for collection models". Call it without `entry_ids` for these kinds.
  It also takes an optional `locale` now, instead of always rewriting every
  supported locale.

  **Non-i18n models keep exactly one meta record.** Content collapses to a single
  `data.json` while meta was still derived from the caller's locale, so one
  content file could end up with `meta/{id}/tr.json` _and_ `meta/{id}/en.json`
  and readers disagreed about which was authoritative. `metaFilePath` now takes
  `i18n` and the default locale and pins the record there. This also fixes
  non-i18n collection deletes, which looked for `meta/{id}/data.json` — a file
  that never existed — and orphaned the meta entry.

  **`contentrain_doctor`'s SDK freshness check works again.** It compared
  directory mtimes, but `generate` rewrites the client files in place (which never
  moves the directory's mtime) while a selective sync recreates model files via
  `git checkout` (which does). Once you had saved a model, it reported "Stale"
  permanently. It now compares the newest file mtime under each directory.

  **`contentrain_validate` gained two checks** for the class of failure above,
  since it reported 0 errors throughout: a notice for drafts sitting alongside
  published entries in one collection, and a warning for a non-i18n model whose
  meta layout disagrees with its content layout. Neither is auto-fixed —
  publishing is a content decision.

  MIGRATION — read before upgrading Studio. Projects that ran an affected version
  have singletons and entries sitting at `draft` that were never meant to be. That
  is currently harmless, because the CDN publishes singletons and dictionaries
  regardless of status. When Studio starts enforcing status for those kinds, that
  content will disappear from the CDN. Upgrade here first, run
  `contentrain_validate` to find the drift, restore it with `contentrain_bulk
update_status`, and only then take the Studio change.

## 1.10.1

### Patch Changes

- dca638d: fix(mcp): stop tripping simple-git's block-unsafe guard on every write

  `git commit` (and every other worktree operation) began failing with
  `Use of "EDITOR"/"GIT_ASKPASS" is not permitted…` in any host that exports
  those variables (VS Code, Claude Code, CI). Nothing in Contentrain changed — a
  transitive bump of `simple-git` to `>= 3.34` pulled in `@simple-git/argv-parser`,
  whose block-unsafe guard rejects a `git` invocation when a guard-listed variable
  is passed **explicitly** through `.env()`. The transaction layer had been
  spreading `...process.env` into `.env()` to set the commit author, so the guard
  saw those inherited variables and refused to run.

  - Commit identity now flows through `-c user.name` / `-c user.email` config
    (`authorConfig`) instead of `.env()`. These keys are not on any unsafe list and
    git honours them for both author and committer, so the guard is never touched —
    regardless of what the host exports. `CONTENTRAIN_AUTHOR_NAME/EMAIL` overrides
    are preserved.
  - The one instance that legitimately needs the inherited environment — network
    push/fetch, which relies on the host's askpass/SSH/proxy setup — keeps `.env()`
    but opts out of the affected guard categories via `unsafe` (`NETWORK_UNSAFE`),
    leaving arg-injection protections intact. This closes the same latent failure
    in `contentrain_submit`.
  - Both concerns are centralized in `git/identity.ts` so no future call site can
    reintroduce a `process.env` spread. `simple-git` is pinned to `^3.36.0`.

  Covered by `tests/git/identity.test.ts`, including a control that asserts the old
  `.env(process.env)` path still trips the guard.

## 1.10.0

### Minor Changes

- f5c70eb: feat(mcp): media tools over an optional provider media facet

  **@contentrain/types**: new `MediaProvider` contract (`list`/`get`/`ingest`/`update`/`delete`) plus `MediaAsset`, `MediaListOptions`, `MediaListResult`, `MediaIngestInput`, `MediaUpdateInput`. `RepoProvider` gains an optional `media?: MediaProvider` facet — implemented by hosted providers (Studio MCP Cloud), absent on Local/GitHub/GitLab.

  **@contentrain/mcp**: five new tools — `contentrain_media_list`, `contentrain_media_get`, `contentrain_media_ingest`, `contentrain_media_update`, `contentrain_media_delete` — as a deterministic passthrough to the provider's media facet.

  - **Capability-aware:** registered only when `RepoProvider.media` is present (new `media` requirement in `TOOL_REQUIREMENTS`). Local stdio servers keep listing exactly the 19 core tools; nothing changes for existing embeddings.
  - **URL-based ingest.** MCP has no binary channel; the provider fetches the source URL server-side and owns SSRF/MIME/size policy. `contentrain_media_ingest` is the only tool with `openWorldHint: true`.
  - **Safety:** `media_delete` is `destructiveHint: true` and requires `confirm: true`; content references are never rewritten by MCP.
  - Closes the discovery loop for external agents: list assets → pick a `media/...` path → reference it via `contentrain_content_save` (absolute delivery URLs via `mediaBaseUrl`).

  **@contentrain/rules**: `MCP_TOOLS` now lists 24 tools (19 core + 5 media); essential guardrails document the media flow.

  **@contentrain/skills**: `references/mcp-tools.md` gains a Media Tools section covering all five tools (parity-tested against the MCP registry).

### Patch Changes

- Updated dependencies [f5c70eb]
  - @contentrain/types@0.8.0

## 1.9.0

### Minor Changes

- 1387ce1: feat(mcp): capability-aware tool listing, server instructions, openWorldHint, session tenant binding

  **@contentrain/mcp**: the MCP surface now tells the truth about what it can do, per session.

  - **Capability-aware registration.** `createServer` consults a new declarative requirement map (`TOOL_REQUIREMENTS`, exported from `@contentrain/mcp/tools/availability` together with `isToolAvailable`) and only registers tools the resolved provider + `projectRoot` pair can satisfy. Local stdio/CLI flows keep the full 19-tool surface; remote-provider sessions (Studio MCP Cloud, GitHub/GitLab providers) now list only the remote-safe subset instead of advertising tools that always failed with a capability error. Input-dependent checks (`validate --fix`, `apply` reuse) remain call-time guards.
  - **`instructions` support.** `CreateServerOptions.instructions` threads the MCP `instructions` string to clients at `initialize`. Defaults to a new `DEFAULT_INSTRUCTIONS` (< 512 chars, describes the describe-format-first and dry-run-first operating rules); pass `''` to omit.
  - **`openWorldHint: false`** added to all 19 tool annotations — every tool operates on the configured repository only.
  - **Session tenant binding.** Multi-tenant HTTP mode accepts `sessionFingerprint(req)`: the fingerprint captured at session creation must match on every follow-up request carrying that `Mcp-Session-Id`; a mismatch answers `404 Session not found` so the client re-initializes against its own provider. Closes cross-tenant session-id replay.

## 1.8.1

### Patch Changes

- c444561: Fix: `RepoProvider.mergeBranch` no longer deletes the source branch by default (regression), and never deletes a protected branch even when asked

  The GitHub/GitLab providers' `mergeBranch` deleted the merged **source** branch by default (opt-out via `removeSourceBranch: false`). Because the primitive deletes whatever `branch` it is given, a driver merging a long-lived branch — `contentrain → main` (publish) or `main → contentrain` (sync) — would delete `contentrain` or `main`. This was a destructive-default change that shipped in a minor; it is a regression.

  - **Opt-in, not opt-out.** Like `git merge` and the platform merge APIs, `mergeBranch` now leaves the source branch in place by default. Callers that want the merged branch removed (e.g. `cr/*` review-branch cleanup) pass `removeSourceBranch: true`.
  - **Mandatory guard.** Even when opted in, the cleanup NEVER deletes the merge target (`into`), the `contentrain` content branch, or the repo's default branch (resolved via `getDefaultBranch`; fail-safe skips the delete if it can't be resolved). This mirrors the LocalProvider's existing `cr/*`-only guard and defends against head/base confusion.

  Applies to both the GitHub and GitLab providers. The LocalProvider path is unchanged (it already merges only `cr/*` branches and guards its remote cleanup). Studio's explicit `removeSourceBranch: false` pin remains valid and harmless.

## 1.8.0

### Minor Changes

- f1a2dce: Three additive GitHub-provider optimizations that cut API calls per write (no breaking changes)

  - **applyPlan blob inlining** — `applyPlanToGitHub` now inlines file content directly in the Git tree entries instead of POSTing a blob per file. A write drops from `N+3` GitHub mutations to a fixed `3` (tree + commit + ref) regardless of file count, easing the mutation-rate secondary limit. This brings the GitHub provider to parity with the GitLab provider, which already inlines content in its commit actions. Deletions are unchanged (null-sha entries); content is passed through byte-for-byte.
  - **GitHubReader opt-in read memoization** — `new GitHubReader(client, repo, { memoize: true })` deduplicates repeated `(path, ref)` reads within one operation across `readFile` / `listDirectory` / `fileExists`. Opt-in and off by default; failed reads are evicted so transient errors are retried, not cached. The provider's own long-lived reader does not enable it (a reader that outlives a write must not serve stale results).
  - **buildContextChange stats injection** — `buildContextChange(reader, operation, source, { stats })` lets a caller that already knows the model/entry counts skip the O(models·locales) reader walk; only `readConfig` remains. The emitted context.json is byte-identical to the scanned variant. Parameterless callers are unaffected.

### Patch Changes

- cfface5: Speed up local writes by batching git subprocess spawns in the worktree transaction

  Every local write (`content_save`, `model_save`, `bulk`, normalize apply, …) runs through `createTransaction`, which spawned ~40 `git` processes for a single content save. Two behavior-preserving batches cut that:

  - **Commit identity via environment** — the worktree git instance now carries `GIT_AUTHOR_*` / `GIT_COMMITTER_*` in its env instead of running two `git config user.*` spawns per transaction (and per `contentrain_merge`). Git honors these for both the sync merges and the feature-branch commit.
  - **Batched selective sync** — `selectiveSync` replaced its per-file `git cat-file -e` existence loop with a single `git ls-tree` over the changed paths, and its per-file `git checkout HEAD -- <file>` loop with a single batched checkout (per-file fallback on error preserves precise skip accounting). Working-tree deletions are parallel fs removals.

  Measured: a 2-locale `content_save` drops from ~40 git spawns to ~30 (config 2→0, cat-file 5→0, checkout 7→3), roughly halving the operation's wall-clock. The selective-sync win scales with file count, so bulk writes benefit the most. No behavior change — the full worktree-transaction test suite passes unchanged.

## 1.7.0

### Minor Changes

- ee8da2d: Delete remote cr/\* branches on merge/delete and harden merged-branch detection

  Every review-mode save pushed its `cr/*` branch to origin, but nothing ever deleted the remote copy after a merge — stale branches accumulated monotonically (one per save+merge cycle) and rendered as phantom pending reviews in Studio.

  - `mergeBranch` (and therefore `contentrain_merge`, `contentrain merge`, `contentrain diff`, the Serve UI approve endpoints, and `LocalProvider.mergeBranch`) now deletes the merged branch's remote copy — best-effort: failures surface as a `remote.warning`, never as a failed merge. **Default on**; opt out with `remoteBranchCleanup: false` in `config.json`. Note: deleting a pushed branch closes any open PR/MR on it.
  - `contentrain_branch_delete`, the Serve UI reject endpoint, `contentrain diff`'s delete action, and `LocalProvider.deleteBranch` remove the remote copy too. `contentrain_branch_delete` also supports remote-only deletion when the local ref is already gone.
  - GitHub/GitLab providers delete the source branch after a successful API merge (opt out per call with `mergeBranch(..., { removeSourceBranch: false })`).
  - Merged-branch detection (`isMerged`, `cleanupMergedBranches`, `checkBranchHealth`) now falls back to patch-id equivalence (`git cherry`) when ancestry breaks — merged branches no longer flip to "unmerged" after a base-history rewrite. Also fixes the fast-forward guard in the transaction layer, which previously never fired (`merge-base --is-ancestor` signals via exit code with empty stderr, which simple-git reports as success).
  - `contentrain_doctor` gains a "Remote branches" check (authoritative `ls-remote` count, offline-safe); `contentrain_branch_list` accepts `remote: true` for a remote view.
  - New `contentrain prune` CLI command drains already-leaked merged remote branches (`--dry-run` / `--yes` / `--json`), and `contentrain_submit` lazily prunes up to 20 merged remote leftovers per run.
  - New exports from `@contentrain/mcp/git/branch-lifecycle`: `deleteRemoteBranch`, `listRemoteCrBranches`, `pruneMergedRemoteBranches`, `isRefMerged`, `classifyMergedBranches`.

### Patch Changes

- Updated dependencies [ee8da2d]
  - @contentrain/types@0.7.0

## 1.6.0

### Minor Changes

- bcca7bd: feat(mcp): normalize media paths to absolute delivery URLs on cloud writes

  External-agent writes through MCP Cloud go straight through `planContentSave`
  rather than Studio's content-engine, so relative `media/...` references used to
  land in git verbatim. They now resolve the same way Studio's own write path
  resolves them.

  - **@contentrain/types**: `RepoProvider` gains optional `mediaBaseUrl` (the
    per-project public delivery base, project segment included) and
    `ContentrainConfig` gains optional `cdn.url`.
  - **@contentrain/mcp**: when the provider supplies `mediaBaseUrl` (cloud mode),
    `contentrain_content_save` normalizes relative `media/...` references — in
    image/video/file fields (incl. nested object/array) and markdown bodies — to
    absolute `{base}/{path}` delivery URLs before commit. Idempotent: external
    URLs (`http(s)://`, `//`, `data:`) and already-absolute URLs pass through. In
    local mode (no base) paths are kept verbatim — the OSS file model.
  - **@contentrain/query**: `generate` accepts `cdnBaseUrl` (or reads
    `config.cdn.url`) and bakes a `media()` resolver into the generated local
    client — `media('media/...') → {base}/{path}` — the local-mode counterpart of
    CDN mode's `MediaAccessor.url()`.
  - **contentrain (CLI)**: `generate --cdnBaseUrl <base>` flag.
  - **@contentrain/rules, @contentrain/skills**: document the two media storage
    models (local-file vs Studio-CDN) and the `media()` resolver.

### Patch Changes

- Updated dependencies [bcca7bd]
  - @contentrain/types@0.6.0

## 1.5.2

### Patch Changes

- 8434723: Align all email addresses to real Contentrain mailboxes

  The repo referenced a number of invented `@contentrain.io` addresses that don't have a real inbox. Only four mailboxes actually exist — `support@`, `info@`, `security@`, `ai@` — and every address now maps onto them.

  - **`@contentrain/mcp`**: the default git commit-author email is now `ai@contentrain.io` (was `mcp@contentrain.io`) across the local/GitHub/GitLab provider defaults, the worktree transaction flow, and `commit-plan`. Override still honored via `CONTENTRAIN_AUTHOR_EMAIL`. Commits authored by the MCP write path will show the new address.
  - **`@contentrain/rules` / `@contentrain/skills`**: the `approved_by` example in the workflow docs now uses `info@contentrain.io` instead of a personal address.

  Repo-level contact/automation references were aligned too (CLA/Code-of-Conduct contact → `info@`, CI commit identity → `ai@`), but those don't affect published package behavior.

## 1.5.1

### Patch Changes

- 61dcd1a: Remote write path no longer commits `.contentrain/context.json` to feature branches

  `commitThroughProvider` (used by content/model save/delete over GitHub and GitLab providers) bundled a freshly built `context.json` into every feature-branch commit. Because the file embeds `new Date()` timestamps, two parallel `cr/*` branches forked from the same `contentrain` commit always diverged on it — after the first branch merged and context was regenerated on `contentrain`, the second branch's merge hit a permanent conflict on `context.json` and stayed pending forever (silent content loss in auto-merge setups).

  Remote commits now carry only the plan's own changes, matching the local transaction flow where feature branches intentionally never include `context.json`. The orchestrator that owns the merge (e.g. Studio) is responsible for regenerating `context.json` on the `contentrain` branch post-merge — `buildContextChange` is exported from `@contentrain/mcp/core/context` for that purpose.

## 1.5.0

### Minor Changes

- 149fa6b: Harden the git/branch lifecycle, redesign context.json handling, and fix validator false positives.

  **Git & branches**

  - Machine-generated `[contentrain]` commits now pass `--no-verify`, so repos with commitlint / husky / lefthook `commit-msg` hooks no longer reject Contentrain writes.
  - Feature branches are pruned automatically: a failed save no longer leaks a dangling `cr/*` branch, and merged branches (auto-merge or `contentrain_merge`) are deleted after landing.
  - Branch-health thresholds are now configurable via `config.json` — `branchWarnLimit` (default 50) and `branchBlockLimit` (default 80) — instead of being hardcoded.
  - **New tools:** `contentrain_branch_list` (pending `cr/*` branches + merge status) and `contentrain_branch_delete` (remove a stale/failed branch; the `contentrain` branch is protected).
  - `contentrain_merge` can now target a branch by `model` (+ optional `locale`/`latest`), not just the exact timestamped branch name.
  - `contentrain_submit` with no git remote now guides you to `contentrain_merge` (local landing) instead of failing with a bare "configure a remote".
  - Git/hook failures are returned as structured, ANSI-stripped errors (`{ error, stage, hook?, code?, agent_hint? }`) instead of a raw escaped color blob.

  **context.json**

  - `context.json` is no longer committed on feature branches; it is regenerated deterministically on the `contentrain` branch after merge (single-threaded). This removes the merge-conflict class that hit parallel content saves on different branches.
  - `contentrain_status` now derives `stats.models`/`stats.entries` live instead of echoing a possibly-stale `context.json`.

  **Validation**

  - Non-i18n models are validated against a single locale, eliminating phantom per-locale "orphan content" warnings (and the wrong-locale meta files `--fix` used to write) in multi-locale projects.
  - Polymorphic multi-relations (`relations` targeting multiple models) accept `{ model, ref }` items, matching the generated SDK type instead of being rejected as "must be a string".
  - Relation-integrity resolves targets at the target model's own storage locale (with a default-locale fallback for i18n:true targets), removing false "broken relation" errors.
  - `contentrain_content_save`'s inline validation now evaluates the committed/overlaid state, so freshly created locale files are no longer reported as "missing".
  - `contentrain_validate --fix` lands cosmetic structural fixes via auto-merge instead of spawning a pending review branch.

### Patch Changes

- Updated dependencies [149fa6b]
  - @contentrain/types@0.5.1

## 1.4.0

### Minor Changes

- cc066fe: feat(mcp): 1.4.0 — multi-tenant HTTP MCP, GitHub App auth, published conformance fixtures

  ### Multi-tenant HTTP MCP — per-request provider resolver

  `startHttpMcpServerWith` now accepts a `resolveProvider(req)` callback
  instead of (or in addition to) a single pre-built provider. Every new
  MCP session resolves its own `RepoProvider` from the incoming HTTP
  request — Studio's MCP Cloud and any similar hosted agent can serve
  many projects from one endpoint without spinning up N server
  instances.

  ```ts
  await startHttpMcpServerWith({
    resolveProvider: async (req) => {
      const projectId = req.headers["x-project-id"];
      const { repo, auth } = await lookupProject(projectId);
      return createGitHubProvider({ auth, repo });
    },
    authToken: workspaceBearerToken,
    port: 3333,
    sessionTtlMs: 15 * 60 * 1000, // default 15m
  });
  ```

  Resolver invoked exactly once per MCP session; subsequent requests
  carrying `Mcp-Session-Id` reuse the resolved server + transport pair.
  Idle sessions are disposed after `sessionTtlMs`. Existing single-
  provider shape is fully backward compatible.

  ### GitHub App installation auth in the factory

  `createGitHubProvider({ auth: { type: 'app', appId, privateKey,
installationId } })` now mints a short-lived JWT, exchanges it for an
  installation access token, and instantiates Octokit with the
  resulting bearer. Removes the old "`app` auth coming in Phase 5.2"
  throw.

  New public exports under `@contentrain/mcp/providers/github`:

  - `exchangeInstallationToken(config, opts?)` — standalone helper,
    useful when callers want to cache / refresh tokens externally
    (redis, KV, cross-worker pool). Supports custom `baseUrl` for
    GitHub Enterprise Server.
  - `signAppJwt(config)` — pure JWT signer (RS256, 10-min TTL).
  - Types: `AppAuthConfig`, `InstallationTokenResult`.

  The factory ships a ~1-hour bearer and does not auto-refresh — for
  long-lived hosted providers, inject your own Octokit with
  `@octokit/auth-app`'s auth strategy instead (Studio's pattern — see
  the embedding guide).

  ### Conformance fixtures published

  New subpath export `@contentrain/mcp/testing/conformance` exposes the
  byte-parity scenarios the package tests itself against, so external
  tools (Studio, alt-provider harnesses, third-party reimplementations)
  can assert matching output without symlinking `packages/mcp/tests/`.

  Fixtures were moved from `packages/mcp/tests/fixtures/conformance/`
  to `packages/mcp/testing/conformance/` and are included in the
  published tarball via `files[]`. Helpers:

  ```ts
  import {
    fixturesDir,
    listConformanceScenarios,
    loadConformanceScenario,
  } from "@contentrain/mcp/testing/conformance";
  ```

  ### `validateProject(reader, options)` overload pinned

  Phase 5.5b's reader overload got a dedicated test file
  (`tests/core/validator/reader-overload.test.ts`) that exercises:

  - validation through a pure `RepoReader`
  - error surfacing from reader-backed content
  - `OverlayReader` composition — the exact shape Studio uses for
    pre-commit validation

  The test pins the contract so the overload cannot regress silently.

  ### Docs

  `docs/guides/embedding-mcp.md` Recipe 3 now shows **three** GitHub App
  auth patterns with a trade-off table:

  1. Factory `auth.type: 'app'` — simple, 1-hour TTL
  2. `exchangeInstallationToken` + external cache — manual refresh
  3. Octokit injection with `@octokit/auth-app` — auto-refresh
     (recommended for Studio-style hosted providers)

  Plus a new 3a section showing the multi-tenant resolver pattern.

  Package description updated from "13 deterministic tools" to
  accurately describe the current 17-tool surface.

  ### Verification

  - `oxlint` across the monorepo → 0 warnings on 424 files.
  - `@contentrain/mcp` typecheck → 0 errors.
  - MCP fast suite → **471 passed / 2 skipped / 34 files** (21 new
    tests beyond 1.3.0 baseline: 4 app-auth, 3 resolver, 5 conformance
    subpath, 3 validateProject reader, plus the fixture-move
    adjustments).
  - `vitepress build docs/` → success.

## 1.3.0

### Minor Changes

- cb8f65e: chore(mcp): phase 10 alignment — docs parity, cohesion fixes, P1 bug fixes, new subpath exports

  Follow-up to the phase-0-through-9 provider-agnostic refactor. Ships
  in one PR because the pieces are interlocking: the bug fixes rely on
  new primitives, the new primitives unlock the feature gaps the docs
  claimed were already covered.

  ### New public subpath exports

  - `@contentrain/mcp/core/contracts` — `RepoProvider` / `RepoReader` /
    `RepoWriter` / capabilities / file-change / branch / commit types,
    re-exported from `@contentrain/types` for backward compat.
  - `@contentrain/mcp/providers/local` — `LocalProvider`, `LocalReader`,
    related types. Previously internal-only.

  These paths were referenced in package documentation since phase 5
  but had no `exports` entry, so external imports failed with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Now callable.

  ### Bug fixes (P1)

  - **Remote write base branch invariant** — `commit-plan.ts` and its
    call sites now always fork remote feature branches from the
    `contentrain` singleton branch, matching the local flow. Previous
    behaviour forked from `config.repository.default_branch` (usually
    `main`), breaking the single-source-of-truth invariant in any
    project that set the repository's default branch explicitly.
  - **Stale remote context / validation** — the new `OverlayReader`
    primitive layers pending `FileChange`s on top of the underlying
    reader. `buildContextChange` and post-save `validateProject` now
    see the state the pending commit produces instead of the
    pre-change base branch. Fixes commits whose context.json entry
    counts or validation result reflected the old state.

  ### Read-only tools on HTTP + remote providers (P2)

  - `contentrain_status`, `contentrain_describe`, and
    `contentrain_content_list` no longer gate on `!projectRoot`. They
    work against any `ToolProvider` — `LocalProvider`, `GitHubProvider`,
    `GitLabProvider` — through the reader surface. Branch health + stack
    detection (local-only) are skipped gracefully when no project root
    is available.
  - `contentrain_content_list` with `resolve: true` still requires local
    disk (cross-model relation hydration walks other models' content
    files); the reader path rejects it with a descriptive error.

  ### Cohesion

  - `commitThroughProvider` — shared helper that encapsulates the
    `LocalProvider` vs remote `RepoProvider` dispatch. The eight
    repeated `if (provider instanceof LocalProvider) { … } else { … }`
    blocks across `content.ts` / `model.ts` collapse to single calls.
    Uniform `{ commitSha, workflowAction, sync? }` return shape.
  - `providers/shared/{errors,paths}.ts` — consolidated
    `isNotFoundError` + `normaliseContentRoot` / `resolveRepoPath` used
    by both GitHub and GitLab providers. Removes four duplicate
    `isNotFound` helpers with asymmetric semantics (GitLab's lenient
    description-match fallback is gone — status-based check only).
  - `workflow.ts` — `contentrain_submit` and `contentrain_merge` now
    gate on explicit `provider.capabilities.X` instead of the
    `!projectRoot` proxy. Matches the pattern `normalize.ts` adopted in
    phase 6.
  - `util/serializer.ts` was previously dead-code removed in phase 9.

  ### Test coverage

  - `tests/providers/local/reader.test.ts` — new, 11 cases
  - `tests/core/overlay-reader.test.ts` — new, 11 cases
  - `tests/server/http.test.ts` — +5 cases (content_delete, model_save,
    model_delete, validate, status remote) and an updated
    capability-error test that now exercises `contentrain_submit`
    (genuinely local-only) instead of `contentrain_status`.

  ### Tool surface

  No changes. Same 16 tools, same parameters, same response shapes.
  Stdio + LocalProvider flows behave identically to the previous
  release.

- 0c6125b: feat(mcp): phase 11 — embedding surface + two more P2 fixes

  Follow-up to phase 10. Extends the public surface Studio (and any
  third-party integrator) consumes, and closes two additional bugs
  surfaced while writing the handoff documentation.

  ### New public subpath exports

  - `@contentrain/mcp/core/ops` — plan helpers (`planContentSave`,
    `planContentDelete`, `planModelSave`, `planModelDelete`) plus the
    path helpers (`contentDirPath`, `contentFilePath`,
    `documentFilePath`, `metaFilePath`) integrators need to compose
    their own write paths against a `RepoProvider`.
  - `@contentrain/mcp/core/overlay-reader` — the `OverlayReader`
    primitive required by any non-local write path that needs
    `buildContextChange` / `validateProject` to see post-commit state.

  ### Bug fixes (P2)

  - **`ApplyPlanInput.base` contract alignment.** `GitHubProvider` and
    `GitLabProvider` previously fell back to the repository's default
    branch (main / master / trunk) when `base` was omitted — in direct
    conflict with the docstring that said "defaults to provider's
    content-tracking branch". Both implementations now default to
    `CONTENTRAIN_BRANCH`, matching the documented contract and the
    `LocalProvider` transaction behaviour. Tests that locked in the old
    behaviour are rewritten; the docstring is tightened to be
    unambiguous.
  - **`contentrain_status` context field on remote.** When the session
    has no `projectRoot`, `contentrain_status` previously returned
    `context: null` unconditionally, even though remote writes do
    commit `.contentrain/context.json`. `readContext` gains a reader
    overload; `tools/context.ts` uses it for remote flows. Remote
    `status` calls now surface the last operation + stats.

  ### Tests

  - `tests/server/http.test.ts` — `status works read-only over a
remote provider` now seeds `.contentrain/context.json` and asserts
    the committed `lastOperation` + `stats` propagate.
  - `tests/providers/{github,gitlab}/apply-plan.test.ts` — the
    old "falls back to repo default branch" cases are rewritten to
    assert the new CONTENTRAIN_BRANCH default.

- ec5325f: feat: serve correctness + level-ups — drift fixes, capability surface, sync warnings, secure-by-default auth

  Consolidates a four-agent review of the `contentrain serve` surface
  and the `@contentrain/mcp` helpers it consumes. Ships as a single
  cohesive PR because the drift fixes are invisible without the UI
  affordances that surface them (sync warnings UI, capability badge,
  branch health banner).

  ### MCP — new public helpers + empty-repo init

  - `branchDiff(projectRoot, { branch, base? })` in
    `@contentrain/mcp/git/branch-lifecycle`. Defaults `base` to
    `CONTENTRAIN_BRANCH` — the singleton content-tracking branch every
    feature branch forks from. Replaces the CLI's duplicated
    `git.diff([${defaultBranch}...${branch}])` calls, which surfaced
    unrelated historical content changes once `contentrain` advanced
    past the repo's default branch.
  - `contentrain_init` tool now handles greenfield directories: if the
    repo has zero commits after `git init` (or existed commit-free),
    it seeds an `--allow-empty` initial commit so
    `ensureContentBranch` has a base ref to anchor on. Previously the
    CLI `init` command created this commit manually while the MCP
    tool skipped the step — the tool failed on an empty directory
    the CLI handled fine.

  ### Serve server — correctness + new routes + auth

  - **Merge flow** — 3 duplicated merge-via-worktree implementations
    (`/api/branches/approve`, `/api/normalize/approve`, and the `diff`
    CLI command) now delegate to MCP's `mergeBranch()` helper, which
    runs the worktree transaction with selective sync + dirty-file
    protection. Skipped-file warnings are cached server-side and
    surfaced to the UI via the new `sync:warning` WebSocket event +
    `/api/branches/:name/sync-status` route. Merge conflicts
    broadcast `branch:merge-conflict` instead of silently succeeding.
  - **Branch diff** — `/api/branches/diff` delegates to the new
    `branchDiff()` helper with `CONTENTRAIN_BRANCH` as the default base.
  - **History filter** — tolerant of BOTH legacy `Merge branch
'contentrain/'` and current `Merge branch 'cr/'` commit patterns
    so post-migration history doesn't drop merges.
  - **`.catch(() => {})` error swallowing** at 3 sites replaced with
    proper propagation. Conflicts and cleanup failures no longer
    pretend to succeed.
  - **Normalize plan approve** broadcasts `branch:created` on the
    returned `git.branch` metadata (parity with content save).
  - **New `/api/capabilities` route** — provider type, transport,
    capability manifest, branch health, repo info in one call.
    Dashboard consumes this to render a capability badge.
  - **New `/api/branches/:name/sync-status`** — on-demand sync warning
    fetch for the branch detail page; 1h TTL cache in memory.
  - **New WS events** — `branch:rejected`, `branch:merge-conflict`,
    `sync:warning`.
  - **Zod input validation** on every write route via
    `serve/schemas.ts`. Catches malformed bodies with a structured 400
    error before they reach the MCP tool layer. Adds `zod` to the CLI's
    direct dependencies.
  - **Secure-by-default auth** — `contentrain serve` on a non-localhost
    interface now HARD ERRORS when no `--authToken` is set. No opt-out
    flag (OWASP Secure-by-Default). Matches industry tooling pattern
    (Postgres, helm, kubectl port-forward).

  ### Serve UI — level-ups that make the fixes visible

  - **`useWatch.ts`** — WSEvent union widened for the new event types.
  - **`project` store** — `capabilities` state + `branchHealthAlarm`
    computed + `fetchCapabilities()` action.
  - **AppLayout** — global branch-health banner (warning / blocked),
    sync-warning toasts with "View details" action deep-linking to
    the branch detail page, merge-conflict toasts with the failure
    message.
  - **DashboardPage** — capability badge (provider type · transport)
    next to the workflow + stack badges.
  - **BranchDetailPage** — sync warnings panel listing files the
    selective sync skipped, with the clear reason why the developer's
    working tree was preserved.
  - **ValidatePage** — issues are clickable when a `model` is present;
    deep-links to the content list filtered to `locale`/`id`/`slug`.

  ### CLI — delegation to MCP helpers

  - `commands/diff.ts` — both the diff summary and the merge path now
    call `branchDiff()` / `mergeBranch()` from MCP. Surfaces
    `sync.skipped[]` warnings to the user. Removes the duplicated
    `contentrain` branch + worktree + update-ref + checkout dance.
  - `commands/doctor.ts` — branch health check delegates to MCP's
    `checkBranchHealth()`. Previously filtered `contentrain/*` directly
    after the Phase 7 naming migration to `cr/*`, so the check was
    effectively a no-op.
  - `commands/validate.ts` non-interactive path — captures `tx.complete()`
    result and surfaces the branch name + workflow action in review
    mode. Previously this metadata was silently dropped.

  ### Verification

  - `pnpm -r typecheck` → 0 errors across 8 packages.
  - `oxlint` monorepo → 0 warnings across 399 files.
  - `vue-tsc --noEmit` serve-ui → 0 errors.
  - `pnpm --filter @contentrain/mcp build` + `pnpm --filter contentrain build:cli-only` → clean.
  - MCP fast suite (`tests/core tests/conformance tests/serialization-parity tests/git tests/providers tests/server tests/util`) → **443/443 green**, 2 skipped. Includes the new `setup.test.ts` empty-repo case + the new `branch-lifecycle.test.ts` `branchDiff` suite.

  ### Tool surface

  No changes. Same 16 MCP tools, same arg schemas, same response
  shapes. Stdio + LocalProvider flows behave identically to the
  previous release.

- 035e14e: feat: MCP boundary hardening + CLI command polish

  Folds the P2 "MCP entrypoint owns a private provider contract" finding
  into a single pass with CLI gap-filling — one cohesive PR because the
  new CLI commands (`merge`, `describe`, `describe-format`, `scaffold`)
  ride the very in-memory client helper that the boundary refactor
  makes safe to commit to.

  ### `@contentrain/types` — `MergeResult.sync`

  - `MergeResult` gains an optional `sync?: SyncResult` field. Remote
    providers (GitHub, GitLab) omit it; `LocalProvider` populates it
    so selective-sync bookkeeping survives the trip through the shared
    `RepoProvider.mergeBranch()` boundary.

  ### `@contentrain/mcp` — provider boundary

  - `LocalProvider` now implements the full `RepoProvider` surface:
    `listBranches`, `createBranch`, `deleteBranch`, `getBranchDiff`,
    `mergeBranch`, `isMerged`, `getDefaultBranch`. All seven wrap
    existing simple-git / transaction helpers through a new
    `providers/local/branch-ops.ts` module that mirrors the
    `providers/github/branch-ops.ts` shape.
  - `mergeBranch(branch, into)` asserts `into === CONTENTRAIN_BRANCH` —
    the local flow merges feature branches into the content-tracking
    branch and advances the base branch via `update-ref`, so arbitrary
    targets would bypass that invariant.
  - `server.ts`: the private `ToolProvider = RepoReader & RepoWriter &
{ capabilities }` alias collapses to `type ToolProvider =
RepoProvider`. Tool handlers now depend on the shared surface
    directly; the alias is kept purely so existing `ToolProvider`
    imports do not have to migrate.
  - `providers/local/types.ts` — `LocalSelectiveSyncResult` is removed
    in favour of the shared `SyncResult` from `@contentrain/types`.
    `workflowOverride` is typed with the shared `WorkflowMode` union
    instead of the duplicated `'review' | 'auto-merge'` literal.
    Matching swap inside `git/transaction.ts` so the whole write path
    speaks one union.

  ### `contentrain` — four new commands + shared MCP client

  - `utils/mcp-client.ts` — new shared `openMcpSession(projectRoot)`
    helper built on `InMemoryTransport.createLinkedPair()`. Used by
    the new commands and available for future ones that wrap MCP
    tools one-shot.
  - `contentrain merge <branch>` — scriptable single-branch sibling
    to `contentrain diff`. Delegates to the same `mergeBranch()` MCP
    helper so dirty-file protections + selective-sync warnings are
    preserved. `--yes` skips the confirmation prompt for CI use.
  - `contentrain describe <model>` — wraps `contentrain_describe`.
    Human-readable metadata + fields + stats + import snippet view,
    with `--sample`, `--locale`, `--json`.
  - `contentrain describe-format` — wraps `contentrain_describe_format`.
    Useful for humans pairing with an agent that's asked for the
    format primer.
  - `contentrain scaffold --template <id>` — wraps
    `contentrain_scaffold`. Interactive template picker when no flag
    is passed; `--locales en,tr,de`, `--no-sample`, `--json`.
  - `commands/status.ts` — branch-health thresholds (50/80) now come
    from `checkBranchHealth()` instead of being duplicated inline. The
    JSON output surfaces the full `branch_health` object so CI
    consumers see the same warning/blocked state the text mode does.

  ### Verification

  - `pnpm -r typecheck` across `@contentrain/types`,
    `@contentrain/mcp`, and `contentrain` — 0 errors.
  - `oxlint` across MCP + CLI + types src/tests — 0 warnings.
  - `@contentrain/types` vitest — 110/110.
  - `contentrain` vitest — 130/130. Includes the 11 new command tests
    (`merge`, `describe`, `scaffold`) and the updated `status` branch-
    health test against the new `checkBranchHealth()` mock.
  - New `tests/providers/local/branch-ops.test.ts` — 7/7. Covers
    contract shape, prefix-filtered branch listing, create/delete
    round-trip, diff status mapping (added/modified), post-merge
    `isMerged` flip, `mergeBranch` target guard, and config-driven
    `getDefaultBranch`.

  ### Tool surface

  No changes. Same 16 MCP tools, same arg schemas, same response
  shapes. The boundary changes are purely internal.

- 071c46f: feat(mcp,cli): phase 14c — extract doctor into a reusable MCP tool + serve route

  Pulls the 540-line `contentrain doctor` CLI command apart so the same
  health report drives three consumers: the CLI, the new
  `contentrain_doctor` MCP tool, and the Serve UI's `/api/doctor` route.

  ### `@contentrain/mcp` — new shared surface

  - **`@contentrain/mcp/core/doctor`** — `runDoctor(projectRoot,
{ usage? })` returns a structured `DoctorReport`:
    `ts
    interface DoctorReport {
      checks: Array<{ name; pass; detail; severity? }>;
      summary: { total; passed; failed; warnings };
      usage?: { unusedKeys; duplicateValues; missingLocaleKeys };
    }
    `
    Every check now carries an explicit `severity` (`error` |
    `warning` | `info`) so consumers can render pass/warn/fail
    independently instead of inferring from text. Orphan content and
    stale SDK client drop to `warning`; missing git / config /
    structure stay at `error`.
  - **`contentrain_doctor` MCP tool** — read-only, local-only (gated
    behind `localWorktree`). Arg: `{ usage?: boolean }`. Returns the
    `DoctorReport` JSON verbatim. Advertised alongside
    `contentrain_describe_format` in the tools list.

  ### `contentrain` — CLI + serve consumers

  - **CLI `contentrain doctor`** collapses to a thin pretty-printer
    over `runDoctor()`. Default (interactive) output is byte-identical
    to the old command — same check labels, same `status icon name:
detail` format, same grouped usage output. New flags: - `--json` — silent, emits the raw `DoctorReport` to stdout.
    Exits non-zero when any check fails so CI pipelines can wire
    `contentrain doctor --json` as a gate. - Interactive mode also exits non-zero now on any failure (was
    always 0 before, which meant CI never noticed).
  - **`GET /api/doctor`** — wraps the MCP tool. `?usage=true` or
    `?usage=1` opts into usage analysis. The Serve UI consumes this
    for the Doctor panel being added in phase 14d.

  ### Scope notes

  - Doctor is inherently local-filesystem work (Node version, git
    binary, mtime comparisons, orphan-dir walk, source-file scan), so
    `contentrain_doctor` is capability-gated behind `localWorktree`
    and throws a structured capability error over remote providers —
    matching `contentrain_setup`, `contentrain_scaffold`, etc.
  - No behaviour change for existing users. The CLI command still
    prints the same rows; the new JSON output and non-zero exit codes
    are additive.

  ### Verification

  - `oxlint` across mcp/cli src + tests → 0 warnings on 350 files.
  - `@contentrain/mcp` typecheck → 0 errors.
  - `contentrain` typecheck → 0 errors.
  - Unit tests:
    - `tests/core/doctor.test.ts` — 6/6 (uninitialised project,
      minimal valid project, orphan detection with warning severity,
      default-omits-usage, usage-flag-adds-3-checks, stale-SDK-mtime).
    - `tests/tools/doctor.test.ts` — 4/4 (structured report over
      fixture, `{usage: true}` opt-in, capability error on remote
      provider, tool advertised in list).
    - `tests/commands/doctor.test.ts` (CLI) — 7/7, rewritten to mock
      `runDoctor` directly. Covers `--json` output, exit-code
      semantics (failure → 1), usage detail rendering, `--usage`
      forwarding.
    - `tests/integration/serve.integration.test.ts` — 24/24 (new
      `/api/doctor` test: default, `?usage=true`, `?usage=1`).

  ### Tool surface

  - **+1 tool**: `contentrain_doctor`. All existing tools unchanged.

- 95eb6dc: fix(rules,skills,mcp): align rules/skills catalogs with MCP tool surface + `cr/*` branches, lock with parity tests

  Closes the two P1 drift findings and installs a drift-detection
  mechanism so they don't come back:

  1. **Missing `contentrain_merge`** — `@contentrain/rules` public
     `MCP_TOOLS` listed 15 tools. `@contentrain/mcp` registers 17
     (including `merge` and the new `doctor`). `@contentrain/skills`
     tool reference also jumped from `submit` straight to `bulk`.
  2. **Legacy `contentrain/{operation}/...` branch namespace** —
     MCP's `buildBranchName()` returns `cr/...` (Phase 7 migration)
     and `checkBranchHealth` filters on `cr/`, but essential rules,
     review/normalize prompts, and multiple skills still taught the
     old prefix. Agents following the shipped guidance would look
     for branches that don't exist.

  ### `@contentrain/mcp`

  - New public export `TOOL_NAMES: readonly string[]` in
    `./tools/annotations`, frozen and derived from `TOOL_ANNOTATIONS`.
    Single source of truth — parity tests in sibling packages now
    import this instead of hardcoding.
  - New `./tools/annotations` subpath export in `package.json`.
  - Build script now emits the new subpath.

  ### `@contentrain/rules`

  - `MCP_TOOLS` extended to **17 tools** (`contentrain_merge`,
    `contentrain_doctor` added in catalog order).
  - `essential/contentrain-essentials.md` — tool table gains `doctor`
    row; feature-branch pattern rewritten to `cr/{operation}/...`;
    health-threshold language mentions `cr/*`.
  - `prompts/review-mode.md` — every legacy `contentrain/<op>/...`
    reference → `cr/<op>/...` (pattern + type examples).
  - `prompts/normalize-mode.md` — branch pattern table rewritten.
  - `shared/workflow-rules.md` — branch pattern spec rewritten.
  - `tests/mcp-parity.test.ts` (new) — 4 tests:
    - `MCP_TOOLS` ↔ `TOOL_NAMES` exact match
    - Essential guardrails mention every MCP tool
    - `buildBranchName()` output starts with `cr/` (sampled across scopes)
    - Rules docs do not contain the legacy `contentrain/<op>/...`
      branch prefix (false-positive filter excludes `.contentrain/` paths)
  - `package.json` — `@contentrain/mcp: workspace:*` added as devDep
    for the parity test.

  ### `@contentrain/skills`

  - `skills/contentrain/references/mcp-tools.md` — new sections for
    `contentrain_merge` (after submit) and `contentrain_doctor`
    (new Doctor Tools subsection). Submit description updated to
    `cr/*` branches.
  - `skills/contentrain/references/mcp-pipelines.md` + `workflow.md`
    — branch-naming spec + examples rewritten to `cr/*`.
  - `skills/contentrain-normalize/SKILL.md` + `references/extraction.md`
    - `references/reuse.md` — 4 stale `contentrain/normalize/*`
      references → `cr/normalize/*`.
  - `skills/contentrain-translate/SKILL.md` — translate branch pattern
    updated.
  - `tests/mcp-parity.test.ts` (new) — 2 tests:
    - `references/mcp-tools.md` has an `### <tool>` heading for every
      MCP tool
    - 7 key skill docs do not contain the legacy branch prefix
  - `package.json` — `@contentrain/mcp: workspace:*` devDep.

  ### Monorepo

  - `tsconfig.json` paths — `@contentrain/mcp/tools/*` alias added so
    TypeScript + vitest resolve the new subpath from source during dev.

  ### Verification

  - `oxlint` across rules + skills + mcp/tools → 0 warnings.
  - `tsc --noEmit` across rules, skills, mcp → 0 errors.
  - `@contentrain/rules` vitest → 16/16 (was 12 — 4 new parity tests).
  - `@contentrain/skills` vitest → 85/85 (was 83 — 2 new parity tests).

  ### Tool surface

  No MCP tool behaviour changes. The new `TOOL_NAMES` export is
  additive; everything else is documentation + tests.

- a488d49: feat(mcp): provider-agnostic engine + HTTP transport + GitHub & GitLab providers

  The MCP package is now driven by a `RepoProvider` abstraction. All
  tools route through the same reader + writer + branch-ops contract,
  and the server accepts any provider (not just local disk).

  Shipped in this release:

  - **HTTP transport** (`@contentrain/mcp/server/http`) — Streamable
    HTTP MCP transport with optional Bearer auth. Works against any
    provider.
  - **GitHubProvider** (`@contentrain/mcp/providers/github`) — Octokit
    over the Git Data + Repos APIs. `@octokit/rest` is an optional
    peer dependency.
  - **GitLabProvider** (`@contentrain/mcp/providers/gitlab`) —
    gitbeaker over the GitLab REST API. Supports gitlab.com and
    self-hosted CE / EE. `@gitbeaker/rest` is an optional peer
    dependency.
  - **Reader-backed reads everywhere** — `listModels`,
    `readModel`, `countEntries`, `checkReferences`, and
    `validateProject` now have reader overloads, so remote providers
    get the same read-side behaviour (validation, reference
    integrity, entry counts) as LocalProvider.
  - **Capability-gated tools** — normalize / scan / apply reject with
    a uniform `capability_required` error on providers that do not
    expose local disk access.

  No tool-surface changes. Stdio transport + LocalProvider remain the
  default and behave identically to the previous release.

  Bitbucket provider is on the roadmap; see the README.

### Patch Changes

- ca54941: docs: phase R2 — align every package README with current public surface

  Each package README was cross-checked against its `src/` exports,
  `package.json` `exports` map, and (for MCP) the `TOOL_ANNOTATIONS`
  registry. Every claim in the rewritten READMEs is verified against the
  current codebase.

  ### `@contentrain/types`

  - Adds the provider-contracts section (`RepoProvider`, `RepoReader`,
    `RepoWriter`, `ProviderCapabilities`, `Commit`, `Branch`, `FileDiff`,
    `MergeResult` with optional `sync?: SyncResult`, `LOCAL_CAPABILITIES`).
  - Documents `NormalizePlan*` types, `CONTENTRAIN_BRANCH` constant,
    `SECRET_PATTERNS`, `ModelSummary`.
  - Keeps the browser-compatible validate/serialize surface described
    for Studio integration.

  ### `@contentrain/mcp`

  - Tool count corrected to **17** (was 13/16 depending on section).
    `contentrain_doctor` row added to the annotations table.
  - Subpath export list now lists every entry in `package.json`:
    `/core/doctor`, `/core/contracts`, `/core/ops`, `/core/overlay-reader`,
    `/tools/annotations`.
  - `mergeBranch` description notes the `cr/*` branch naming.
  - Capability gates section mentions doctor alongside scan/apply.

  ### `contentrain` (CLI)

  - Global `--debug` flag + `CONTENTRAIN_DEBUG` env var documented.
  - New flags table: `--json` on status/doctor/validate/generate/diff/
    describe/scaffold; `--watch` on validate/generate; `--demo` and
    `--mcpHttp` / `--authToken` on serve.
  - `setup`, `skills`, `merge`, `describe`, `describe-format`, `scaffold`
    commands added to the command table.
  - Secure-by-default HTTP transport auth described.

  ### `@contentrain/query`

  - Clarified that `contentrain generate` (CLI) is the recommended entry
    point and `contentrain-query generate` is the programmatic path.
  - Added TypeScript snippet for the programmatic `generate()` API.

  ### `@contentrain/rules`

  - `MCP_TOOLS` length corrected to **17** (includes `contentrain_merge`
    and `contentrain_doctor`).
  - New Parity section that explains how drift is prevented by
    `tests/mcp-parity.test.ts`.
  - `shared/` directory catalog added (11 rule files, previously
    undocumented).
  - Context bridge section includes the 4 stack templates.

  ### `@contentrain/skills`

  - Reference discovery pattern documented (`references/*.md` loaded on
    demand, tier table for progressive disclosure).
  - New Parity section mirroring the rules package.
  - Quick discovery snippet added to Public Exports.

  No code changes — READMEs only.

- Updated dependencies [035e14e]
- Updated dependencies [ca54941]
- Updated dependencies [cb8f65e]
  - @contentrain/types@0.5.0

## 1.2.1

### Patch Changes

- 048fd78: fix(mcp): reduce scanner pre-filter noise with locale codes, dimensions, repeat chars, MIME types, PascalCase and short ALL-CAPS scoring

## 1.2.0

### Minor Changes

- 001e3ad: feat(cli): Add contextual Studio tips to CLI commands (init, generate, diff, status) with branding and clickable links. New setup and skills commands with IDE integration utilities.

  feat(mcp): Redesign scan pipeline with confidence scoring, deduplication, and pre-filter improvements. Add tool annotations, git transaction manager, and MCP best practices from Playwright/Engram/DBHub.

  feat(skills): Add Agent Skills ecosystem integration across all 15 skills with workflow handoff protocols, cross-references, and normalize guardrails.

  feat(rules): Add essential guardrails and shared normalize/workflow rules.

  feat(sdk): Add contentrain-query skill with bundler config references.

  fix(types): Expand shared type definitions for new scan and workflow features.

### Patch Changes

- Updated dependencies [001e3ad]
  - @contentrain/types@0.4.2

## 1.1.2

### Patch Changes

- Updated dependencies [1d25752]
  - @contentrain/types@0.4.1

## 1.1.1

### Patch Changes

- 131c752: Refactor validation and serialization to use shared functions from `@contentrain/types` instead of local duplicates. Removes ~530 lines of duplicated code (pattern constants, field type matching, secret detection, frontmatter parsing, canonical JSON). No public API changes — all existing exports remain backward-compatible via re-exports.
- Updated dependencies [131c752]
  - @contentrain/types@0.4.0

## 1.1.0

### Minor Changes

- fe97f7b: Rewrite git transaction system with dedicated `contentrain` branch and full worktree isolation.

  **@contentrain/mcp:**

  - Eliminate stash/checkout/merge on developer's working tree during auto-merge
  - All git operations happen in temporary worktrees — developer's tree never mutated
  - Dedicated `contentrain` branch as content state single source of truth
  - Feature branches use `cr/` prefix (avoids git ref namespace collision)
  - Auto-merge flow: feature → contentrain → update-ref baseBranch (fast-forward)
  - Selective sync: only changed files copied to working tree, dirty files skipped with warning
  - context.json committed with content (not separately)
  - Structured errors with code, message, agent_hint, developer_action
  - Automatic migration of old `contentrain/*` branches on first operation

  **@contentrain/types:**

  - Add `SyncResult` interface for selective file sync results
  - Add `ContentrainError` interface for structured error reporting
  - Add `CONTENTRAIN_BRANCH` constant

  **contentrain (CLI):**

  - Worktree merge pattern in diff, serve approve, normalize approve
  - Contentrain branch status display in `contentrain status`
  - Protected contentrain branch in branch listings

  **@contentrain/rules & @contentrain/skills:**

  - Updated workflow documentation for new git architecture

### Patch Changes

- Updated dependencies [fe97f7b]
  - @contentrain/types@0.3.0

## 1.0.7

### Patch Changes

- 2feb3b8: fix(mcp): auto-stash dirty working tree during auto-merge

  MCP's auto-merge flow no longer blocks when developers have staged or unstaged changes. Working tree is automatically stashed before checkout + merge, then restored after completion.

## 1.0.6

### Patch Changes

- fix(mcp): correct mcpName casing for MCP Registry (Contentrain, not contentrain)

## 1.0.5

### Patch Changes

- chore(mcp): add mcpName for MCP Registry listing

## 1.0.4

### Patch Changes

- feat(types): complete content architecture types — DocumentEntry, ModelSummary, path constants, validation patterns

  Internal packages updated to use centralized types from @contentrain/types.

- Updated dependencies
  - @contentrain/types@0.2.0

## 1.0.3

### Patch Changes

- Fix CI pipeline: add build step before tests, configure git identity, add serve-ui to workspace, fix apply-guardrails tests.

## 1.0.2

### Patch Changes

- Fix markdown document listing in serve UI: flatten frontmatter fields into table columns, include body content, and render markdown with marked + Tailwind Typography.

## 1.0.1

### Patch Changes

- Fix frontmatter serialization for nested objects, arrays, and YAML-sensitive scalar values in the MCP content manager.
