---
"@contentrain/mcp": minor
---

chore(mcp): phase 10 alignment — docs parity, cohesion fixes, P1 bug fixes, new subpath exports

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
