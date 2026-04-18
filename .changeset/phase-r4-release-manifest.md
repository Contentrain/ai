---
"contentrain": patch
---

chore(release): phase R4 — release manifest + pre-flight verification

The 14 pending changesets collectively produce this release, verified
with `pnpm release:status`:

| Package | Current | Bump | New |
|---|---|---|---|
| `@contentrain/mcp` | 1.2.0 | minor | **1.3.0** |
| `@contentrain/types` | 0.4.x | minor | **0.5.0** |
| `contentrain` | 0.4.3 | minor | **0.5.0** |
| `@contentrain/rules` | 0.3.x | minor | **0.4.0** |
| `@contentrain/skills` | 0.3.x | minor | **0.4.0** |
| `@contentrain/query` | 5.1.4 | patch | **5.1.5** |

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
