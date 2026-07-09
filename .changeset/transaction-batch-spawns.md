---
"@contentrain/mcp": patch
---

Speed up local writes by batching git subprocess spawns in the worktree transaction

Every local write (`content_save`, `model_save`, `bulk`, normalize apply, …) runs through `createTransaction`, which spawned ~40 `git` processes for a single content save. Two behavior-preserving batches cut that:

- **Commit identity via environment** — the worktree git instance now carries `GIT_AUTHOR_*` / `GIT_COMMITTER_*` in its env instead of running two `git config user.*` spawns per transaction (and per `contentrain_merge`). Git honors these for both the sync merges and the feature-branch commit.
- **Batched selective sync** — `selectiveSync` replaced its per-file `git cat-file -e` existence loop with a single `git ls-tree` over the changed paths, and its per-file `git checkout HEAD -- <file>` loop with a single batched checkout (per-file fallback on error preserves precise skip accounting). Working-tree deletions are parallel fs removals.

Measured: a 2-locale `content_save` drops from ~40 git spawns to ~30 (config 2→0, cat-file 5→0, checkout 7→3), roughly halving the operation's wall-clock. The selective-sync win scales with file count, so bulk writes benefit the most. No behavior change — the full worktree-transaction test suite passes unchanged.
