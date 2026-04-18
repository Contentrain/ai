---
"@contentrain/mcp": minor
"contentrain": minor
---

feat: serve correctness + level-ups — drift fixes, capability surface, sync warnings, secure-by-default auth

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
