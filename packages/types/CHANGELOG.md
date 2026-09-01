# @contentrain/types

## 1.9.0

### Minor Changes

- 68f4582: List sections, page titles, and per-route language.

  - **List sections** (`QueryPage.sections`, `LIST_ITEMS_SLOT`): a list renders as a sequence of blocks — a big card in its own wrapper, then a grid — each with its own template and item count. One template per list forced every item into the big-card shape (a measured category page scored 56), and baking the big card into the chrome puts the wrong post on page 2. `item_template` remains the single-section shorthand, and a sectioned list no longer triggers the fallback warning.
  - **Page titles** (`QueryPage.title`, `RouteModel.title`): archive, paginated and static pages emit a real `<title>` instead of an empty one.
  - **Per-route language** (`RouteModel.locale`, `QueryBinding.locale`, `EmitPost.locale`): the emitted layout takes `lang` as a prop and each route passes its own, so a multilingual site is a route + family + query per language instead of a second collection workaround.

## 1.8.0

### Minor Changes

- 4079160: Nested addresses and multiple content collections.

  - **Rest parameters:** a trailing `*` in `RouteModel.pattern` (`/category/:term*`) emits `[...term].astro`, so hierarchical taxonomy and nested page addresses (`/category/about-cc/events/`) keep their full path instead of collapsing to the last segment and breaking every nested link. A rest parameter that is not the final segment is warned about (Astro matches them greedily).
  - **Per-route collections:** `RouteModel.collection` names the content a per-entry route generates from, and `EmitContent.collections` carries it. Previously every `single` route wrote `src/data/posts.json`, so a second content type (pages, custom post types) collided with the first. Any route naming a collection is collection-driven — pages and CPTs are per-entry routes too — and an empty collection warns by name.

## 1.7.0

### Minor Changes

- b92140a: Template markers for the shapes real themes need, and per-post route/CSS data.

  - **Raw-HTML marks** (`@@mark_html@@`, `RAW_MARK_SUFFIX`): themes that print a post's full content or a link-bearing excerpt inside a list card no longer get escaped markup as text (measured on one category page: 48.6). Escaping stays the default.
  - **Repeat blocks** (`<!--@@repeat:list|sep@@-->…<!--@@/repeat@@-->`, `SlotBinding.repeat`): term and author lists whose length varies per post render correctly — fixed `term0…termN` marks left stray separators (`"Business,"`, `"Releases, Events,"`, `"Automattic, ,"`).
  - **Conditional blocks** (`<!--@@if:name@@-->`, `SlotBinding.optional`): regions that only some posts of the same route render (a featured block; measured spread 3.5–84.5) can now be expressed — route-parameter variants could not.
  - **Per-post route parameters** (`EmitPost.params`, new `post_year`/`post_month`/`post_day`/`post_id` param sources): dated permalinks generate every post at its real address instead of reusing the template post's date.
  - **Per-page stylesheets** (`EmitPost.css`, `QueryPage.css`): page-builder sites emit CSS per page; the family's `css.files` is documented as the union of its members.
  - **Page-level marks** (`QueryPage.marks`): list chrome can show a term's display name where the route parameter only has its slug.
  - Generated `build` script runs `astro check` before `astro build`.

## 1.6.0

### Minor Changes

- ca62ade: Carry the source page's root attributes. `LayoutFamily.root_attrs` (new `RootAttrs`) holds the `<html>` and `<body>` attributes; the emitter writes them onto the generated page and fills `@@marks@@` inside attribute values (per-page classes like `postid-123`). Themes hang layout on those classes — a page with perfect content and empty root attributes loses its entire layout (measured on one corpus site: 36.4 vs 100, while another site was unaffected, so they are carried always). An explicit `lang` from the source wins over the project default.

## 1.5.0

### Minor Changes

- 364af0f: Single-injection body chrome. `ChromeChunk` gains a `body` position carrying the new `CHROME_BODY_SLOT` marker (`<!--@@body@@-->`) at any nesting depth — real themes nest the content container (`article > div.entry-content`), so before/after halves are unbalanced fragments the parser silently "repairs" (measured: 36 vs 100). The emitter splices content in at the marker and injects the whole body as ONE fragment; the legacy `before_body`/`after_body` pair still works by composing into a single string. Generated pages pass content via the `body` prop; slot children still work through `Astro.slots.render`.

## 1.4.0

### Minor Changes

- c0960f8: Comments export contracts for migration → Studio intake: `EntrySourceMap` (WP post id → content entry address), `CommentsExport` (`contentrain-comments@1` payload with verbatim `RawComment`s and `threads_closed`), and `MigrationHandoff.comments` (`HandoffComments` summary + payload pointer). `RawComment` gains `date_gmt` and a fixed `approved` vocabulary (`'1' | '0' | 'spam' | 'trash'`, unknown values pass through).

## 1.3.0

### Minor Changes

- 7aa4424: Add the WordPress migration contracts: `RawIR` (source-faithful site extraction with access-rung provenance), `CapabilityManifest` (evidence-based capability inventory), `ProjectIR` (route model, layout families, component variants, query bindings, design tokens), and `MigrationHandoff` (per-capability dispositions and runtime-capability offers with cost comparison). Plain-JSON, snake_case, versioned via `MIGRATION_CONTRACT_VERSION`.

## 1.2.0

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

## 1.1.0

### Minor Changes

- d04947f: The serve UI reads the model's declared title, labels and order

  serve-ui was still guessing what `title_field`, `label` and `order` now
  declare. Its column list called `Object.keys(desc.fields)` under a comment
  saying that preserved definition order — it does not, because model JSON is
  written with canonically sorted keys, so it was alphabetical. On a
  sixteen-field article model that put `author` first and `title` fifteenth,
  each column headed by its raw key (`body_public`, `is_category_hero`).

  - columns order by `orderedFieldNames`, so a declared `order` wins and fields
    without one keep today's alphabetical fallback
  - headers render `resolveFieldLabel`, with the raw key kept as the `title`
    attribute so the underlying field is still discoverable
  - the default visible columns lead with `title_field` when the model declares
    one; the existing required-plus-simple-type heuristic fills the rest and
    still covers models that predate the property

  Both helpers come from `@contentrain/types`, so the UI and any other consumer
  resolve them the same way.

  **The secret detector no longer flags documentation about secrets.**

  `SECRET_PATTERNS` matched bare prefixes, so `task_id` and `risk_level` tripped
  `sk_`, every page documenting `Authorization: Bearer <token>` tripped
  `Bearer `, and `postgres://localhost:5432/mydb` in a guide tripped the
  connection-string rule. On this repository, which stores its own docs as
  content, that was **7 of 12 validation errors** — and the real findings were
  buried under them.

  Each pattern now matches a credential-shaped _value_ rather than prose about
  credentials: prefixes need their key body, a bearer token needs an actual
  token (not `<token>`, `$TOKEN`, `{{token}}` or `YOUR_TOKEN`), an api key needs
  to be assigned one, and a connection string needs embedded credentials.

  Two existing assertions changed, because they encoded the false positive:
  `my_api_key_value` and `mongodb://localhost/test` are no longer reported. A
  check that fires on the wrong thing is not a strict check; it is one people
  learn to scroll past.

## 1.0.2

### Patch Changes

- Republish as 1.0.2 — 1.0.0, 1.0.1 and 2.0.0 are all permanently unavailable

  `@contentrain/types` reached 2.0.0 in January 2025, was unpublished, and
  restarted at 0.1.0 in March 2026. npm reserves an unpublished version number
  forever, so three numbers in the 1.x–2.x range can never be used again:

  | version | published  | status |
  | ------- | ---------- | ------ |
  | 1.0.0   | 2025-01-04 | burned |
  | 1.0.1   | 2025-01-05 | burned |
  | 2.0.0   | 2025-01-05 | burned |

  The first attempt at this release chose 1.0.0 and was refused; the second chose
  1.0.1 and was refused for the same reason, because only 1.0.0 had been checked.
  Both times the five packages that do not depend on types published fine while
  types did not — and `workspace:*` resolves to an exact version at publish time,
  so `@contentrain/mcp`, `@contentrain/query` and `contentrain` each shipped
  pinned to a version that does not exist.

  1.0.2 is verified free against the full `npm view @contentrain/types time`
  history, as are the resulting 3.0.2 / 7.0.4 / 0.9.2 for the dependents.

  Follow-up worth doing separately: `workspace:^` instead of `workspace:*` would
  publish `^1.0.2` rather than `1.0.2`. A dependent pinned that way keeps
  resolving when types ships a later patch, so a partial publish failure heals
  itself instead of requiring every dependent to be republished.

## 1.0.1

### Patch Changes

- 0430ce2: Republish as 1.0.1 — 1.0.0 is permanently unavailable on npm

  `@contentrain/types@1.0.0` was published on 2025-01-04 and later unpublished.
  npm reserves an unpublished version number forever, so when the release
  sequence reached 1.0.0 again the registry refused it:

      npm error 400 — Cannot publish over previously published version "1.0.0"

  Five of the six packages in that release published successfully; only types
  failed. But `workspace:*` resolves to an exact version at publish time, so
  `@contentrain/mcp@3.0.0`, `@contentrain/query@7.0.2` and `contentrain@0.9.0`
  all went out pinned to `@contentrain/types@1.0.0` — a version that does not
  exist and cannot be created. Installing any of them fails with ETARGET.

  This bumps types to 1.0.1 and carries the three dependents with it. Nothing
  about the code changes; 1.0.0 never reached anyone.

  Worth noting for later: had the workspace used `workspace:^` rather than
  `workspace:*`, the published range would have been `^1.0.0` and this would
  have healed itself the moment 1.0.1 landed, without needing to republish the
  dependents.

## 1.0.0

### Major Changes

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

## 0.9.0

### Minor Changes

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

## 0.8.0

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

## 0.7.0

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

## 0.6.0

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

## 0.5.1

### Patch Changes

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

## 0.5.0

### Minor Changes

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

- cb8f65e: feat(types): RepoProvider contracts + widened `repository.provider`

  - `ContentrainConfig.repository.provider` is now `'github' | 'gitlab'` (was a hardcoded `'github'`). Reflects the two remote providers `@contentrain/mcp` ships today.
  - The provider-agnostic engine contracts used by `@contentrain/mcp` are now exposed directly from `@contentrain/types`:
    - `RepoReader`, `RepoWriter`, `RepoProvider`
    - `ProviderCapabilities`, `LOCAL_CAPABILITIES`
    - `ApplyPlanInput`, `Commit`, `CommitAuthor`
    - `FileChange`, `Branch`, `FileDiff`, `MergeResult`

  Third-party tools can now implement a custom `RepoProvider` without
  taking a runtime dependency on `@contentrain/mcp`.

  `@contentrain/mcp/core/contracts` keeps re-exporting every symbol, so
  existing MCP-based imports are unchanged.

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

## 0.4.2

### Patch Changes

- 001e3ad: feat(cli): Add contextual Studio tips to CLI commands (init, generate, diff, status) with branding and clickable links. New setup and skills commands with IDE integration utilities.

  feat(mcp): Redesign scan pipeline with confidence scoring, deduplication, and pre-filter improvements. Add tool annotations, git transaction manager, and MCP best practices from Playwright/Engram/DBHub.

  feat(skills): Add Agent Skills ecosystem integration across all 15 skills with workflow handoff protocols, cross-references, and normalize guardrails.

  feat(rules): Add essential guardrails and shared normalize/workflow rules.

  feat(sdk): Add contentrain-query skill with bundler config references.

  fix(types): Expand shared type definitions for new scan and workflow features.

## 0.4.1

### Patch Changes

- 1d25752: Fix declaration file path in package.json — point to `index.d.mts` instead of non-existent `index.d.ts`

## 0.4.0

### Minor Changes

- 131c752: Add pure, dependency-free validate and serialize functions for shared use across MCP (Node.js) and Studio (web).

  **Validate:** `validateSlug`, `validateEntryId`, `validateLocale`, `detectSecrets`, `validateFieldValue` (type, required, min/max, pattern, select options).

  **Serialize:** `sortKeys`, `canonicalStringify`, `generateEntryId`, `parseMarkdownFrontmatter`, `serializeMarkdownFrontmatter`.

  All functions are browser-compatible with zero runtime dependencies.

## 0.3.0

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

## 0.2.0

### Minor Changes

- feat(types): complete content architecture types — DocumentEntry, ModelSummary, path constants, validation patterns

  Internal packages updated to use centralized types from @contentrain/types.
