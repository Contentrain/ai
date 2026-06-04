---
"@contentrain/mcp": minor
"@contentrain/types": patch
---

Harden the git/branch lifecycle, redesign context.json handling, and fix validator false positives.

**Git & branches**

- Machine-generated `[contentrain]` commits now pass `--no-verify`, so repos with commitlint / husky / lefthook `commit-msg` hooks no longer reject Contentrain writes.
- Feature branches are pruned automatically: a failed save no longer leaks a dangling `cr/*` branch, and merged branches (auto-merge or `contentrain_merge`) are deleted after landing.
- Branch-health thresholds are now configurable via `config.json` — `branchWarnLimit` (default 50) and `branchBlockLimit` (default 80) — instead of being hardcoded.
- **New tools:** `contentrain_branch_list` (pending `cr/*` branches + merge status) and `contentrain_branch_delete` (remove a stale/failed branch; the `contentrain` branch is protected).
- `contentrain_merge` can now target a branch by `model` (+ optional `locale`/`latest`), not just the exact timestamped branch name.
- `contentrain_submit` with no git remote now guides you to `contentrain_merge` (local landing) instead of failing with a bare "configure a remote".
- Git/hook failures are returned as structured, ANSI-stripped errors (`{ error, stage, hook?, code?, agent_hint? }`) instead of a raw escaped color blob.

**context.json**

- `context.json` is no longer committed on feature branches; it is regenerated deterministically on the `contentrain` branch after merge (single-threaded). This removes the merge-conflict class that hit parallel content saves on different branches.
- `contentrain_status` now derives `stats.models`/`stats.entries` live instead of echoing a possibly-stale `context.json`.

**Validation**

- Non-i18n models are validated against a single locale, eliminating phantom per-locale "orphan content" warnings (and the wrong-locale meta files `--fix` used to write) in multi-locale projects.
- Polymorphic multi-relations (`relations` targeting multiple models) accept `{ model, ref }` items, matching the generated SDK type instead of being rejected as "must be a string".
- Relation-integrity resolves targets at the target model's own storage locale (with a default-locale fallback for i18n:true targets), removing false "broken relation" errors.
- `contentrain_content_save`'s inline validation now evaluates the committed/overlaid state, so freshly created locale files are no longer reported as "missing".
- `contentrain_validate --fix` lands cosmetic structural fixes via auto-merge instead of spawning a pending review branch.
