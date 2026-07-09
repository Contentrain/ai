# @contentrain/query

## 6.1.1

### Patch Changes

- Updated dependencies [ee8da2d]
  - @contentrain/types@0.7.0

## 6.1.0

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

## 6.0.0

### Major Changes

- 149fa6b: Fix generated client correctness and align with the platform.

  **Breaking:** the generated document body field is now `body` (was `content`), matching `@contentrain/types` `DocumentEntry.body` and the MCP `document_save` schema. Update consumers reading `.content` on document entries to `.body`, and regenerate the client.

  Also fixed in the generated runtime + types:

  - **Dictionary interpolation was broken** in generated output — the param regex lost its escaping during emit, so `dictionary('ui').get('key', { name })` returned the raw `{name}` template. Now interpolates correctly.
  - **`DocumentQuery.sort()` added** — documents can now be ordered (e.g. by `published_at`); previously only collections could sort, and calling `.sort()` on a document query threw.
  - **`include()` now resolves relations across i18n boundaries** — an i18n:false relation target (e.g. `author`) is resolved whether or not `.locale()` was set, and i18n:true targets resolve when no explicit locale is passed. Previously one side silently stayed an unresolved id string.
  - **Generated types corrected** — no more duplicate `slug` member when a document model declares a `slug` field; relation fields are typed as `id | ResolvedTarget` (and `include(...)` arguments are constrained to model keys) so resolved relations are no longer plain `string`.
  - **String frontmatter is no longer numerically coerced** — a string-typed field like `"007"` keeps its value instead of becoming `7`.
  - **`where(field, 'ne', x)` on array fields** is now the complement of `eq` (membership), matching `eq` semantics.
  - Removed dead/misleading CJS proxy code; documented the required `await init()` for CommonJS.

### Patch Changes

- Updated dependencies [149fa6b]
  - @contentrain/types@0.5.1

## 5.1.5

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

## 5.1.4

### Patch Changes

- 001e3ad: feat(cli): Add contextual Studio tips to CLI commands (init, generate, diff, status) with branding and clickable links. New setup and skills commands with IDE integration utilities.

  feat(mcp): Redesign scan pipeline with confidence scoring, deduplication, and pre-filter improvements. Add tool annotations, git transaction manager, and MCP best practices from Playwright/Engram/DBHub.

  feat(skills): Add Agent Skills ecosystem integration across all 15 skills with workflow handoff protocols, cross-references, and normalize guardrails.

  feat(rules): Add essential guardrails and shared normalize/workflow rules.

  feat(sdk): Add contentrain-query skill with bundler config references.

  fix(types): Expand shared type definitions for new scan and workflow features.

- Updated dependencies [001e3ad]
  - @contentrain/types@0.4.2

## 5.1.3

### Patch Changes

- Updated dependencies [1d25752]
  - @contentrain/types@0.4.1

## 5.1.2

### Patch Changes

- Updated dependencies [131c752]
  - @contentrain/types@0.4.0

## 5.1.1

### Patch Changes

- Updated dependencies [fe97f7b]
  - @contentrain/types@0.3.0

## 5.1.0

### Minor Changes

- 2bf3f65: feat(sdk): add CDN transport for remote content delivery

  New `createContentrain()` factory for async HTTP-based content access from Contentrain Studio CDN.

  - New `./cdn` subpath export with `HttpTransport`, async query classes
  - `ContentrainError` class for HTTP error handling (401, 403, 404, 429)
  - ETag-based HTTP caching for efficient CDN fetching
  - Extended `where()` operators: eq, ne, gt, gte, lt, lte, in, contains
  - Metadata endpoints: `manifest()`, `models()`, `model(id)`
  - Zero breaking changes — existing sync local mode is unaffected

## 5.0.2

### Patch Changes

- Updated dependencies
  - @contentrain/types@0.2.0

## 5.0.1

### Patch Changes

- 84eb1c2: feat(rules): add granular IDE rule files for Claude Code, Cursor, and Windsurf

  Generated individual rule files per shared rule in ide/claude-code/rules/, ide/cursor/rules/ (.mdc with alwaysApply frontmatter), and ide/windsurf/rules/ (.md with trigger: always_on frontmatter).

  feat(cli): redesign installRules() to distribute granular rules to .claude/rules/, .cursor/rules/, .windsurf/rules/

  For Claude Code: install 11 granular rule files to .claude/rules/, workflow skills to .claude/skills/ from @contentrain/skills, and add a lightweight reference to CLAUDE.md instead of the previous 2984-line monolithic bundle.

  For Cursor: install .mdc files to .cursor/rules/ when .cursor/ directory detected; fall back to monolithic .cursorrules otherwise.

  For Windsurf: install individual .md files to .windsurf/rules/ when .windsurf/ directory detected.

  fix(sdk): fix race condition in generate.test.ts that caused intermittent test failures when test files ran concurrently
