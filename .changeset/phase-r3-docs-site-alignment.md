---
"contentrain": patch
---

docs(site): phase R3 — align production docs/ site with current codebase

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
