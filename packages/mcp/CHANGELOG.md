# @contentrain/mcp

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
    ```ts
    interface DoctorReport {
      checks: Array<{ name; pass; detail; severity? }>;
      summary: { total; passed; failed; warnings };
      usage?: { unusedKeys; duplicateValues; missingLocaleKeys };
    }
    ```
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
detail` format, same grouped usage output. New flags:
    - `--json` — silent, emits the raw `DoctorReport` to stdout.
      Exits non-zero when any check fails so CI pipelines can wire
      `contentrain doctor --json` as a gate.
    - Interactive mode also exits non-zero now on any failure (was
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
