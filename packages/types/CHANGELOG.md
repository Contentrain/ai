# @contentrain/types

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
