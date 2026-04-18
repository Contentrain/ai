# contentrain

## 0.5.1

### Patch Changes

- Updated dependencies [cc066fe]
  - @contentrain/mcp@1.4.0
  - @contentrain/rules@0.4.0
  - @contentrain/skills@0.4.0

## 0.5.0

### Minor Changes

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

- 382a3a9: feat(cli): serve backend — meta watcher, watcher error broadcast, new routes, defensive Zod

  Second pass on `contentrain serve` after Phase 13's auth + drift fixes.
  Tight, surgical changes — no behaviour regressions, additive routes
  and events the Serve UI can consume immediately.

  ### File watcher coverage

  - **`.contentrain/meta/`** — the chokidar handler now recognises
    `meta/<model>/<locale>.json` and `meta/<model>/<entry>/<locale>.json`
    paths and broadcasts a `meta:changed` WebSocket event with `modelId`,
    optional `entryId`, and `locale`. Matches the two real layouts
    agents produce (per-model SEO metadata, per-entry SEO metadata).
    Without this, editing a `.contentrain/meta/*` file left the Serve
    UI rendering stale metadata until a full refresh.
  - **Watcher errors surfaced** — `chokidar.on('error', …)` was
    previously unhandled. Now broadcasts `file-watch:error` with
    `message` + ISO `timestamp`. The UI can render a "watcher down,
    live updates paused" banner instead of silently degrading (e.g.
    hitting the OS inotify limit on Linux).

  ### New HTTP routes

  - **`GET /api/describe-format`** — thin wrapper around the
    `contentrain_describe_format` MCP tool. The Serve UI can render
    this as a format-reference panel alongside the model inspector
    (what the `contentrain describe-format` CLI command shows locally).
  - **`GET /api/preview/merge?branch=cr/...`** — preview a merge
    before approving it, with zero side effects:
    - `alreadyMerged` — the feature branch is already in
      `CONTENTRAIN_BRANCH`'s history (approve would be a no-op)
    - `canFastForward` — `CONTENTRAIN_BRANCH` is an ancestor of the
      feature branch (approve will FF cleanly)
    - `conflicts` — best-effort list of conflicting paths from
      `git merge-tree`. Empty array on clean merges; `null` when the
      check can't run (older git, missing refs). Complements the
      approve route, which continues to surface runtime conflicts by
      throwing.
    - `filesChanged`, `stat` — from the shared `branchDiff()` helper
      so UI preview + actual approve see the same file list.

  ### Defensive Zod parity

  - **`/api/normalize/plan/reject`** — previously validated nothing;
    now parses an optional `{ reason? }` body through a new
    `NormalizePlanRejectBodySchema`. Both empty-body and reason-only
    requests still work (backwards compatible); malformed bodies
    return a structured 400 instead of silently succeeding. Keeps the
    entire serve write surface parsing through one `parseOrThrow()`
    gate.

  ### Explicitly out of scope

  - **`/api/doctor`** — the MCP surface has no `contentrain_doctor`
    tool yet; only the CLI's 540-line command. Proper route requires
    extracting doctor into a reusable `@contentrain/mcp` tool first,
    which is its own phase (14c candidate). Rather than duplicate
    CLI logic into serve, we defer.
  - **`sdk:regenerated` WS event** — `contentrain generate` runs
    outside serve's process, so the watcher can't observe it cleanly.
    Needs a different mechanism (e.g. a sentinel file, or integrating
    generate into serve's lifecycle). Defer until the design is
    concrete.

  ### Verification

  - `oxlint` across cli/src + cli/tests → 0 warnings on 209 files.
  - `contentrain` typecheck — 0 errors.
  - `contentrain` vitest → **137/137** (was 130 on `next-mcp`). The 7
    new tests cover: `meta:changed` with and without `entryId`,
    `file-watch:error` payload shape, `/api/describe-format` tool
    invocation, `/api/preview/merge` validation + happy path, and
    the plan/reject route's body-validation + backwards compat.

  ### Tool surface

  No MCP changes — this is pure serve-backend work on existing tools.

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

- 84af43c: feat(cli/serve-ui): phase 14d — consume 14b + 14c backend capabilities

  Wires the Serve UI to the routes and events added in 14b + 14c so the
  new backend capabilities become visible to the user.

  ### New pages

  - **`/doctor`** — structured health report from `/api/doctor`. Four
    stat cards (passed / errors / warnings / summary) mirror the
    ValidatePage layout. Per-check rows with severity icon + badge.
    Optional `--usage` mode expands into three collapsible panels
    (unused keys, duplicate dictionary values, missing locale keys),
    each with a 20–50 row preview + overflow indicator. Nav link in
    `PrimarySidebar`.
  - **`/format`** — content-format specification from
    `/api/describe-format`, grouped by top-level section. Each
    section is a collapsible Card. Scalar values render inline;
    objects render as labelled rows with `<pre>` for nested
    structures. Nav link in `PrimarySidebar`.

  ### Extended pages

  - **BranchDetailPage** — new "Merge preview" panel fetched on mount
    from `/api/preview/merge`. Renders one of four states:

    - _already merged_ (info — approve is a no-op)
    - _fast-forward clean_ (success — approve will FF cleanly)
    - _requires three-way_ (warning)
    - _conflicts_ (error — lists the conflicting paths)

    Sits above the sync-warning panel so reviewers see the upcoming
    merge outcome before they see the previous merge's outcome.

  ### Global shell (AppLayout)

  - **File-watcher error banner** — when chokidar emits `error` (e.g.
    OS inotify limit), the backend broadcasts `file-watch:error`.
    The layout surfaces a persistent destructive banner with the
    message + a Dismiss button. Mirrors the branch-health banner
    pattern.
  - **`meta:changed` toast** — light informational toast when an
    agent edits `.contentrain/meta/<model>[/<entry>]/<locale>.json`.
    No push-back CTA; toast disappears on its own.

  ### Store + composable

  - `stores/project.ts` — new state: `doctor`, `formatReference`,
    `fileWatchError`. New actions: `fetchDoctor({ usage })`,
    `fetchFormatReference()`, `fetchMergePreview(branch)`,
    `setFileWatchError()`, `dismissFileWatchError()`. Types:
    `DoctorReport`, `DoctorCheck`, `DoctorUsage`, `MergePreview`,
    `FileWatchError`.
  - `composables/useWatch.ts` — `WSEvent` union extended with
    `meta:changed` and `file-watch:error`. New optional fields
    `entryId`, `timestamp`.

  ### Dictionary-first

  Every new user-facing string uses
  `dictionary('serve-ui-texts').locale('en').get()` — no hardcoded
  copy. Twenty-three new keys added via `contentrain_content_save`
  (auto-merged, committed as two content ops). Reused existing keys
  where applicable (`dashboard.run`, `trust-badge.warnings`,
  `validate.all-checks-passed`, `validate.errors`, `dashboard.total`).

  ### Verification

  - `vue-tsc --noEmit` → 0 errors.
  - `oxlint` across cli src → 0 warnings on 185 files.
  - `@contentrain/query` client regenerates `ServeUiTexts =
Record<string, string>` typing — new keys type-safe at lookup.

  No backend changes. Everything here is UI wiring on top of 14b + 14c.

- e234e0e: feat(cli): phase 14e — cross-cutting flags: --json, --watch, --debug

  Closes the CLI ergonomics gap identified in the 14b/14c audits. Three
  additive flags that make the CLI usable in CI, dev loops, and when
  something goes wrong internally.

  ### `--json` on `diff` and `generate`

  - `contentrain diff --json` emits a structured pending-branches
    summary and exits without entering the interactive review loop:
    ```json
    { "branches": [{ "name", "base", "filesChanged", "insertions",
                     "deletions", "stat" }] }
    ```
    Agents and CI can inspect pending `cr/*` branches without a TTY.
  - `contentrain generate --json` emits the SDK-generate result verbatim
    (`generatedFiles`, `typesCount`, `dataModulesCount`,
    `packageJsonUpdated`) so pipelines can wire generation into
    automated refresh/diff flows.
  - `contentrain doctor --json` already shipped in 14c; this completes
    the set for the most CI-relevant read commands.

  ### `--watch` on `validate`

  - `contentrain validate --watch` keeps a chokidar watcher on
    `.contentrain/content/` + `.contentrain/models/` + `config.json`
    and re-runs validation on every change (300ms debounce). Graceful
    SIGINT teardown.
  - Read-only by design — watch mode force-disables `--fix` /
    `--interactive` because those would produce a fresh `cr/fix/*`
    branch on every keystroke.
  - `--json` composes: each run prints a single-line JSON report so
    `contentrain validate --watch --json | jq` just works.

  ### `--debug` + `CONTENTRAIN_DEBUG`

  - Global `--debug` flag, stripped at the root before citty parses
    subcommands so every command's internal `debug()` / `debugTimer()`
    calls see it. Same effect from `CONTENTRAIN_DEBUG=1`.
  - New `utils/debug.ts` with `debug(context, msg)`, `debugJson(ctx,
label, value)`, and `debugTimer(ctx, label) → end()` that no-ops
    when off. All output goes to **stderr** so `--json` stdout
    payloads stay clean.
  - Wired into `validate --watch` as the first consumer; future
    commands can sprinkle it where the user-facing output isn't
    enough to diagnose a stuck op.

  ### Verification

  - `oxlint` cli src + tests → 0 warnings on 213 files.
  - `contentrain` typecheck → 0 errors.
  - New unit tests (13 added, all pass):
    - `tests/utils/debug.test.ts` — 5: default silent, `enableDebug()`
      turns on, `CONTENTRAIN_DEBUG=1` turns on at import, timer no-op,
      timer prints elapsed ms.
    - `tests/commands/diff.test.ts` — 1 new: `--json` emits structured
      branches array + skips the interactive `select()`.
    - `tests/commands/generate.test.ts` — 1 new: `--json` emits the
      generate result and suppresses pretty output.
    - `tests/commands/validate.test.ts` — 1 new: `--watch` flag is
      advertised in args.
  - Full CLI command unit suite: 38/38 pass (doctor, diff, generate,
    validate, status, merge, describe, scaffold, debug).

  No backend or tool-surface changes.

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

- 3cf7d19: docs(site): phase R3 — align production docs/ site with current codebase

  Every page under `docs/` (the ai.contentrain.io VitePress site) was
  audited against the current source by 5 parallel Explore agents (top-
  level, packages, reference, guides-infra, guides-content-domain), then
  applied sequentially with VitePress build verification.

  ### Tool-count corrections

  - `getting-started.md`, `concepts.md`, `packages/mcp.md`,
    `packages/cli.md`, `guides/embedding-mcp.md`,
    `guides/http-transport.md`, `guides/providers.md`,
    `guides/serve-ui.md` — every "16 tools" / "16 Contentrain tools"
    reference updated to **17** (includes `contentrain_merge` + the new
    `contentrain_doctor`).

  ### Branch-naming corrections (post Phase 7)

  - `concepts.md`, `guides/normalize.md` — legacy
    `contentrain/{operation}/...` branch prefixes rewritten to `cr/*`.
    MCP's `buildBranchName()` emits `cr/` and `checkBranchHealth` filters
    on `cr/` — docs must not teach the stale prefix.

  ### Major rewrites

  - **`packages/mcp.md`** — full tool table with 17 rows and the new
    `contentrain_doctor` in the read section. Capability gates section
    mentions doctor alongside scan/apply. Complete subpath-export list
    (adds `/core/doctor`, `/core/contracts`, `/core/ops`,
    `/core/overlay-reader`, `/tools/annotations`).
  - **`packages/cli.md`** — every command expanded with its real flags:
    `--json` on status/doctor/validate/generate/diff/describe/scaffold;
    `--watch` on validate + generate; `--fix` / `--interactive` on
    validate; global `--debug` / `CONTENTRAIN_DEBUG`; new commands
    (`merge`, `describe`, `describe-format`, `scaffold`, `setup`,
    `skills`). Serve section documents `--demo`, `--mcpHttp`, and the
    secure-by-default Bearer-token requirement on non-localhost binds.
  - **`packages/types.md`** — new Provider Contract Types section
    (`RepoProvider`, `RepoReader`, `RepoWriter`, `ProviderCapabilities`,
    `FileChange`, `ApplyPlanInput`, `Commit`, `Branch`, `FileDiff`,
    `MergeResult` with `sync?`, `SyncResult`, `CommitAuthor`), plus
    `LOCAL_CAPABILITIES` constant.
  - **`packages/rules.md`** — MCP_TOOLS length (17) and explicit
    include-checks for `contentrain_merge` and `contentrain_doctor`.
  - **`reference/providers.md`** — complete capability matrix, merge-
    result shape (including `sync?` for LocalProvider), supporting
    types, and a minimum-viable custom-provider recipe.
  - **`guides/serve-ui.md`** — new sections for every Phase 14b/c/d
    capability: `/doctor` and `/format` UI pages, merge preview on
    BranchDetail, `meta:changed` / `file-watch:error` / `sync:warning`
    / `branch:merge-conflict` / `branch:rejected` WS events, new HTTP
    routes (`/api/doctor`, `/api/describe-format`, `/api/preview/merge`,
    `/api/capabilities`, `/api/branches/:name/sync-status`), secure-by-
    default HTTP MCP auth.

  ### Minor

  - `packages/sdk.md` — generation entry point ordering: `contentrain
generate` is now presented as the recommended path; the
    programmatic `@contentrain/query/generate` API is documented for
    build-tool authors.
  - `demo.md` — code snippet gets an explicit `import { singleton }
from '#contentrain'` line for copy-paste clarity.

  ### Verified

  - `npx vitepress build` → success in 5.33s, no broken links, no
    rendering errors.
  - Every claim cross-checked against current source code.

  No code changes — docs only.

- ed87a56: docs: phase R3b — align root README / CLAUDE / AGENTS with current codebase

  Repo root guidance files updated so they agree with the per-package
  READMEs (phase R2) and the docs site (phase R3):

  ### README.md

  - Architecture diagram: `MCP (16 tools)` → `MCP (17 tools)`.
  - Feature bullet: "MCP engine — 16 tools" → "17 tools".
  - Packages table: `@contentrain/mcp` row → "17 MCP tools + ...".

  ### CLAUDE.md

  - Monorepo tree `packages/mcp` comment → `17 MCP tools`.
  - npm-packages table → `17 MCP tools`.
  - Obsolete "Octokit YOK in MCP" decision rewritten: `@octokit/rest`
    and `@gitbeaker/rest` are optional peer dependencies (Phase 5.1 + 8).

  ### AGENTS.md

  - Essentials bullet: "16 MCP tools with mandatory calling protocols"
    → 17.
  - Packages table: mcp row → "17 MCP tools — content operations engine".

  ### RELEASING.md

  - No changes — release flow docs stayed accurate through R1-R3.

  ### CONTRIBUTING.md, CLA.md, CODE_OF_CONDUCT.md

  - No changes — standards files, no code-specific content.

- e9f3104: chore(release): phase R4 — release manifest + pre-flight verification

  The 14 pending changesets collectively produce this release, verified
  with `pnpm release:status`:

  | Package               | Current | Bump  | New       |
  | --------------------- | ------- | ----- | --------- |
  | `@contentrain/mcp`    | 1.2.0   | minor | **1.3.0** |
  | `@contentrain/types`  | 0.4.x   | minor | **0.5.0** |
  | `contentrain`         | 0.4.3   | minor | **0.5.0** |
  | `@contentrain/rules`  | 0.3.x   | minor | **0.4.0** |
  | `@contentrain/skills` | 0.3.x   | minor | **0.4.0** |
  | `@contentrain/query`  | 5.1.4   | patch | **5.1.5** |

  ### Studio handoff pre-flight — satisfied

  - `@contentrain/types ≥ 0.5.0` ✓ (handoff pre-req was ≥ 0.4.2)
  - `@contentrain/mcp ≥ 1.3.0` ✓

  ### What's in this release

  **MCP:**

  - Phase 5–10 engine refactor (provider-agnostic plan/apply, Local /
    GitHub / GitLab providers, HTTP transport, capability gates).
  - Phase 13 serve correctness + secure-by-default auth.
  - Phase 14a MCP boundary hardening (`LocalProvider` implements full
    `RepoProvider`, `ToolProvider = RepoProvider`, `WorkflowMode` /
    `SyncResult` / `MergeResult.sync?` consolidation).
  - Phase 14c `contentrain_doctor` tool extraction.
  - Phase R1 parity tests — rules / skills / MCP tool registry lockstep.

  **CLI:**

  - Phase 14a new commands: `merge`, `describe`, `describe-format`,
    `scaffold`.
  - Phase 14c `doctor --json` with non-zero exit on failure.
  - Phase 14e cross-cutting flags: `--json` on diff/generate, `--watch`
    on validate, global `--debug` / `CONTENTRAIN_DEBUG`.
  - Phase 14b serve backend: `/api/describe-format`, `/api/doctor`,
    `/api/preview/merge`, `meta:changed` + `file-watch:error` WS events,
    defensive Zod on plan/reject.
  - Phase 14d Serve UI: `/doctor`, `/format` pages, merge preview panel,
    watcher-down banner, SEO metadata toast. Dictionary-first UI text.

  **Docs:**

  - Phase R2 per-package READMEs aligned with actual exports.
  - Phase R3 production docs/ site aligned with current surface (every
    claim cross-checked against source).
  - Phase R3b root README / CLAUDE / AGENTS aligned.

  ### Verification (this branch, pre-release)

  - `pnpm release:check` → passed.
  - `pnpm release:status` → 14 changesets, 5 minor + 1 patch bump.
  - `pnpm -r typecheck` → 0 errors across 8 workspace packages.
  - `pnpm lint` → 0 warnings on 419 files.

  ### Automated release flow (post-merge)

  1. R1, R2, R3, R3b, R4 PRs merge into `next-mcp`.
  2. `next-mcp` merges into `main`.
  3. Changesets action opens a "Version Packages" PR.
  4. Merging that PR publishes to npm and creates per-package tags.

  No manual `pnpm release` required — the automation handles it.

- Updated dependencies [cb8f65e]
- Updated dependencies [0c6125b]
- Updated dependencies [ec5325f]
- Updated dependencies [035e14e]
- Updated dependencies [071c46f]
- Updated dependencies [95eb6dc]
- Updated dependencies [ca54941]
- Updated dependencies [a488d49]
- Updated dependencies [cb8f65e]
  - @contentrain/mcp@1.3.0
  - @contentrain/types@0.5.0
  - @contentrain/rules@0.4.0
  - @contentrain/skills@0.4.0
  - @contentrain/query@5.1.5

## 0.4.4

### Patch Changes

- Updated dependencies [048fd78]
  - @contentrain/mcp@1.2.1

## 0.4.3

### Patch Changes

- 8af7bb9: fix(cli): resolve rules/skills packages reliably across npm, pnpm, and workspace layouts

  - Add `@contentrain/skills` as a CLI dependency so it installs transitively
  - Replace broken try/catch-around-lambda with eager `createPackageResolver()` that tests availability upfront
  - Three fallback resolution strategies: CLI bundle path, project root, direct node_modules
  - Show actionable error messages instead of generic "packages not installed"

  fix(rules): publish `shared/` directory to npm

  - Add `shared` to `files` and `exports` in package.json — 11 rule files referenced by `prompts/` were missing from published package

- Updated dependencies [8af7bb9]
  - @contentrain/rules@0.3.3

## 0.4.2

### Patch Changes

- 001e3ad: feat(cli): Add contextual Studio tips to CLI commands (init, generate, diff, status) with branding and clickable links. New setup and skills commands with IDE integration utilities.

  feat(mcp): Redesign scan pipeline with confidence scoring, deduplication, and pre-filter improvements. Add tool annotations, git transaction manager, and MCP best practices from Playwright/Engram/DBHub.

  feat(skills): Add Agent Skills ecosystem integration across all 15 skills with workflow handoff protocols, cross-references, and normalize guardrails.

  feat(rules): Add essential guardrails and shared normalize/workflow rules.

  feat(sdk): Add contentrain-query skill with bundler config references.

  fix(types): Expand shared type definitions for new scan and workflow features.

- Updated dependencies [001e3ad]
  - @contentrain/mcp@1.2.0
  - @contentrain/rules@0.3.2
  - @contentrain/query@5.1.4
  - @contentrain/types@0.4.2

## 0.4.1

### Patch Changes

- 228610f: Add contextual Contentrain Studio tips to CLI command output (init, generate, diff, status) with proper branding, colored commands, and clickable Studio link.

## 0.4.0

### Minor Changes

- 8c3e659: Add `studio connect` command that links a local repository to a Contentrain Studio project in one interactive flow — workspace selection, GitHub App installation, repo detection, `.contentrain/` scanning, and project creation. Also fixes the validate integration test timeout by batching 80 sequential git-branch spawns into a single `git update-ref --stdin` call.

## 0.3.4

### Patch Changes

- Updated dependencies [1d25752]
  - @contentrain/types@0.4.1
  - @contentrain/mcp@1.1.2
  - @contentrain/query@5.1.3

## 0.3.3

### Patch Changes

- Updated dependencies [131c752]
- Updated dependencies [131c752]
  - @contentrain/mcp@1.1.1
  - @contentrain/types@0.4.0
  - @contentrain/query@5.1.2

## 0.3.2

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

- Updated dependencies [fe97f7b]
  - @contentrain/mcp@1.1.0
  - @contentrain/types@0.3.0
  - @contentrain/rules@0.3.1
  - @contentrain/query@5.1.1

## 0.3.1

### Patch Changes

- Updated dependencies [2feb3b8]
  - @contentrain/mcp@1.0.7

## 0.3.0

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

### Patch Changes

- Updated dependencies [2bf3f65]
- Updated dependencies [2bf3f65]
  - @contentrain/rules@0.3.0
  - @contentrain/query@5.1.0

## 0.2.3

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.6

## 0.2.2

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.5

## 0.2.1

### Patch Changes

- feat(types): complete content architecture types — DocumentEntry, ModelSummary, path constants, validation patterns

  Internal packages updated to use centralized types from @contentrain/types.

- Updated dependencies
  - @contentrain/types@0.2.0
  - @contentrain/mcp@1.0.4
  - @contentrain/query@5.0.2

## 0.2.0

### Minor Changes

- 84eb1c2: feat(rules): add granular IDE rule files for Claude Code, Cursor, and Windsurf

  Generated individual rule files per shared rule in ide/claude-code/rules/, ide/cursor/rules/ (.mdc with alwaysApply frontmatter), and ide/windsurf/rules/ (.md with trigger: always_on frontmatter).

  feat(cli): redesign installRules() to distribute granular rules to .claude/rules/, .cursor/rules/, .windsurf/rules/

  For Claude Code: install 11 granular rule files to .claude/rules/, workflow skills to .claude/skills/ from @contentrain/skills, and add a lightweight reference to CLAUDE.md instead of the previous 2984-line monolithic bundle.

  For Cursor: install .mdc files to .cursor/rules/ when .cursor/ directory detected; fall back to monolithic .cursorrules otherwise.

  For Windsurf: install individual .md files to .windsurf/rules/ when .windsurf/ directory detected.

  fix(sdk): fix race condition in generate.test.ts that caused intermittent test failures when test files ran concurrently

### Patch Changes

- Updated dependencies [84eb1c2]
  - @contentrain/rules@0.2.0
  - @contentrain/query@5.0.1

## 0.1.4

### Patch Changes

- Add Docs and GitHub external links to serve UI sidebar.

## 0.1.3

### Patch Changes

- Fix CI pipeline: add build step before tests, configure git identity, add serve-ui to workspace, fix apply-guardrails tests.
- Updated dependencies
  - @contentrain/mcp@1.0.3

## 0.1.2

### Patch Changes

- Fix markdown document listing in serve UI: flatten frontmatter fields into table columns, include body content, and render markdown with marked + Tailwind Typography.
- Updated dependencies
  - @contentrain/mcp@1.0.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - @contentrain/mcp@1.0.1
