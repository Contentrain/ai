# @contentrain/skills

## 0.8.0

### Minor Changes

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

## 0.7.0

### Minor Changes

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

## 0.6.0

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

## 0.5.3

### Patch Changes

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

## 0.5.2

### Patch Changes

- 8434723: Align all email addresses to real Contentrain mailboxes

  The repo referenced a number of invented `@contentrain.io` addresses that don't have a real inbox. Only four mailboxes actually exist — `support@`, `info@`, `security@`, `ai@` — and every address now maps onto them.

  - **`@contentrain/mcp`**: the default git commit-author email is now `ai@contentrain.io` (was `mcp@contentrain.io`) across the local/GitHub/GitLab provider defaults, the worktree transaction flow, and `commit-plan`. Override still honored via `CONTENTRAIN_AUTHOR_EMAIL`. Commits authored by the MCP write path will show the new address.
  - **`@contentrain/rules` / `@contentrain/skills`**: the `approved_by` example in the workflow docs now uses `info@contentrain.io` instead of a personal address.

  Repo-level contact/automation references were aligned too (CLA/Code-of-Conduct contact → `info@`, CI commit identity → `ai@`), but those don't affect published package behavior.

## 0.5.1

### Patch Changes

- 34c9cf1: Fix stale context.json documentation: the file is never committed on feature branches

  Rules and skills docs still described the pre-1.x behavior ("context.json is committed together with content changes"). Since the dedicated-branch transaction flow landed, context.json is regenerated on the `contentrain` branch after merge and feature branches never carry it — parallel writes therefore cannot conflict on it. Updated workflow-rules, mcp-usage, contentrain-essentials, context-bridge, and the contentrain skill references to state the current contract.

## 0.5.0

### Minor Changes

- 149fa6b: Document the new `contentrain_branch_list` / `contentrain_branch_delete` MCP tools and fix SDK wiring guidance.

  - `MCP_TOOLS` / the essential guardrails / the MCP tool reference now include the two new branch tools (19 tools total) and the model/locale/latest selector for `contentrain_merge`.
  - Bundler-config snippets for Vite and Nuxt use `import.meta.url` + `fileURLToPath` instead of `__dirname` (which is undefined in ESM `vite.config.ts` / `nuxt.config.ts`), and now cover Nuxt 4's `app/` + `server/` layout.
  - The generate skill documents wiring `contentrain generate` into a `prebuild`/`predev` step, since `.contentrain/client/` is git-ignored and must be regenerated on fresh clones / CI.
  - Clarified the two generator invocations: `contentrain generate` (CLI) vs `npx contentrain-query generate` (the `@contentrain/query` bin).

## 0.4.0

### Minor Changes

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

## 0.3.0

### Minor Changes

- 001e3ad: feat(cli): Add contextual Studio tips to CLI commands (init, generate, diff, status) with branding and clickable links. New setup and skills commands with IDE integration utilities.

  feat(mcp): Redesign scan pipeline with confidence scoring, deduplication, and pre-filter improvements. Add tool annotations, git transaction manager, and MCP best practices from Playwright/Engram/DBHub.

  feat(skills): Add Agent Skills ecosystem integration across all 15 skills with workflow handoff protocols, cross-references, and normalize guardrails.

  feat(rules): Add essential guardrails and shared normalize/workflow rules.

  feat(sdk): Add contentrain-query skill with bundler config references.

  fix(types): Expand shared type definitions for new scan and workflow features.

## 0.2.1

### Patch Changes

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

- 2bf3f65: feat(rules,skills,cli): migrate to Agent Skills standard format

  **@contentrain/rules:**

  - Add `essential/contentrain-essentials.md` — compact always-loaded guardrails (~86 lines)
  - Remove `ide/` directory and `scripts/build-rules.ts` (IDE-specific build system)
  - Replace `ALL_SHARED_RULES`, `IDE_RULE_FILES` exports with `ESSENTIAL_RULES_FILE`
  - Always-loaded context reduced from 2,945 lines to 86 lines (97% reduction)

  **@contentrain/skills:**

  - Add `skills/` directory with 15 Agent Skills (SKILL.md + references/) following agentskills.io standard
  - Add `AGENT_SKILLS` catalog export for Tier 1 discovery (name + description)
  - New `contentrain-sdk` skill for @contentrain/query usage (local + CDN)
  - Existing `workflows/` and `frameworks/` kept for backward compatibility

  **contentrain (CLI):**

  - Rewrite `installRules()` with generic IDE installer supporting Claude Code, Cursor, Windsurf, and GitHub Copilot
  - Install one compact essential guardrails file per IDE (always-loaded) + Agent Skills directories (on-demand)
  - Automatic cleanup of old granular rule files from previous versions

## 0.1.2

### Patch Changes

- fix(skills): fix step numbering, correct system field names, add Nuxt alias docs

## 0.1.1

### Patch Changes

- fix(skills): correct GitHub URLs, add npm badges, update documentation links
