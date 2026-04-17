---
"@contentrain/mcp": minor
"@contentrain/types": minor
"contentrain": minor
---

feat: MCP boundary hardening + CLI command polish

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
