---
"@contentrain/mcp": minor
---

feat(mcp): phase 11 — embedding surface + two more P2 fixes

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
