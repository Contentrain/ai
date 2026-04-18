---
"@contentrain/types": patch
"@contentrain/mcp": patch
"contentrain": patch
"@contentrain/query": patch
"@contentrain/rules": patch
"@contentrain/skills": patch
---

docs: phase R2 — align every package README with current public surface

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
