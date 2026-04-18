# @contentrain/skills

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
