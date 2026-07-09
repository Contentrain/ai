# @contentrain/types

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
