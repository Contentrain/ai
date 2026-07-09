---
"@contentrain/mcp": patch
---

Fix: `RepoProvider.mergeBranch` no longer deletes the source branch by default (regression), and never deletes a protected branch even when asked

The GitHub/GitLab providers' `mergeBranch` deleted the merged **source** branch by default (opt-out via `removeSourceBranch: false`). Because the primitive deletes whatever `branch` it is given, a driver merging a long-lived branch — `contentrain → main` (publish) or `main → contentrain` (sync) — would delete `contentrain` or `main`. This was a destructive-default change that shipped in a minor; it is a regression.

- **Opt-in, not opt-out.** Like `git merge` and the platform merge APIs, `mergeBranch` now leaves the source branch in place by default. Callers that want the merged branch removed (e.g. `cr/*` review-branch cleanup) pass `removeSourceBranch: true`.
- **Mandatory guard.** Even when opted in, the cleanup NEVER deletes the merge target (`into`), the `contentrain` content branch, or the repo's default branch (resolved via `getDefaultBranch`; fail-safe skips the delete if it can't be resolved). This mirrors the LocalProvider's existing `cr/*`-only guard and defends against head/base confusion.

Applies to both the GitHub and GitLab providers. The LocalProvider path is unchanged (it already merges only `cr/*` branches and guards its remote cleanup). Studio's explicit `removeSourceBranch: false` pin remains valid and harmless.
