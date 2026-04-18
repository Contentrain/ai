---
"@contentrain/mcp": minor
"@contentrain/rules": minor
"@contentrain/skills": minor
---

fix(rules,skills,mcp): align rules/skills catalogs with MCP tool surface + `cr/*` branches, lock with parity tests

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
  + `references/reuse.md` — 4 stale `contentrain/normalize/*`
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
