---
"@contentrain/mcp": minor
"contentrain": minor
---

feat(mcp,cli): phase 14c — extract doctor into a reusable MCP tool + serve route

Pulls the 540-line `contentrain doctor` CLI command apart so the same
health report drives three consumers: the CLI, the new
`contentrain_doctor` MCP tool, and the Serve UI's `/api/doctor` route.

### `@contentrain/mcp` — new shared surface

- **`@contentrain/mcp/core/doctor`** — `runDoctor(projectRoot,
  { usage? })` returns a structured `DoctorReport`:
  ```ts
  interface DoctorReport {
    checks: Array<{ name, pass, detail, severity? }>
    summary: { total, passed, failed, warnings }
    usage?: { unusedKeys, duplicateValues, missingLocaleKeys }
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
