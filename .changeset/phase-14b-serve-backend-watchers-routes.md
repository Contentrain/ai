---
"contentrain": minor
---

feat(cli): serve backend — meta watcher, watcher error broadcast, new routes, defensive Zod

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
