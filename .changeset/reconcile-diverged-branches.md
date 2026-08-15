---
"@contentrain/types": minor
"@contentrain/mcp": minor
"contentrain": minor
---

Divergence becomes a product state, and reconcile becomes its exit.

**Truth first (types, mcp, cli).** A diverged base branch — commits the
`contentrain` branch lacks, the state a dual-domain migration PR leaves
behind — is no longer reported as a failed write. The content lands on
`contentrain` either way; auto-merge writes and `contentrain_merge` now
return `base_advance: 'advanced' | 'blocked_diverged'` (shared vocabulary
with Studio's approve contract — a PR is an attachment, never a third
state) plus `remote_push: 'pushed' | 'rejected' | 'no-remote'`, where a
non-fast-forward push rejection used to be swallowed silently.
`mergeBranch` gains the fetch + base-sync pre-step the write path already
had, so one clean base commit no longer kills every approve; the merged
`cr/*` branch is pruned even when the advance is blocked, ending the
phantom pending-review rows in the serve UI. `contentrain_status` and
`contentrain status` count BOTH directions (`in_sync / content_ahead /
base_ahead / diverged`) — one-directional counting reported the exact
state that blocks every advance as "in sync". Serve approve endpoints
return the new fields and carry structured error data; transaction-layer
fetch/push is hardened (no credential prompts, block timeout).

**The reconcile primitive (types, mcp).** `planReconcile`
(`@contentrain/mcp/core/ops`) is a content-aware three-way merge over
three ref-bound `RepoReader`s (merge-base / contentrain / base). One side
changed → mechanical merge at entry-, key-, and term+locale granularity;
both sides changed the same item → a `ConflictItem` with a CLOSED `code`
union (consumers key localized editor questions on it) and an id that
hashes position AND values — a resolution made against a stale dry-run is
dropped and the conflict re-reported (compare-and-set). Document bodies
are never text-merged; models carry `suggested: 'theirs'` as advice,
never auto-applied; context.json is always regenerated. `RepoProvider`
gains optional `getMergeBase`/`createMergeCommit` members and the
optional `mergeCommit` capability (GitHub: two-parent Git Data API
commit; GitLab: absent, MR fallback; both keep external `implements`
code compiling).

**Executors and surfaces (mcp, cli).** `reconcileBranches`
(`@contentrain/mcp/git/reconcile`) runs a real `git merge --no-commit`
in a temp worktree and writes the entire plan over it — the planner is
authoritative for content paths, git for everything else — then commits
with two parents and fast-forwards the base. `contentrain_reconcile`
(new tool, local-only, dry_run-first like `contentrain_apply`) and
`contentrain reconcile` (interactive CLI: plan summary, one ours/theirs
question per conflict, `--yes` never defaults a conflict) are the
product doors. Every `blocked_diverged` surface names them as the exit.
