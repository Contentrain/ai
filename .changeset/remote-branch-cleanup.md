---
"@contentrain/types": minor
"@contentrain/mcp": minor
"contentrain": minor
---

Delete remote cr/* branches on merge/delete and harden merged-branch detection

Every review-mode save pushed its `cr/*` branch to origin, but nothing ever deleted the remote copy after a merge — stale branches accumulated monotonically (one per save+merge cycle) and rendered as phantom pending reviews in Studio.

- `mergeBranch` (and therefore `contentrain_merge`, `contentrain merge`, `contentrain diff`, the Serve UI approve endpoints, and `LocalProvider.mergeBranch`) now deletes the merged branch's remote copy — best-effort: failures surface as a `remote.warning`, never as a failed merge. **Default on**; opt out with `remoteBranchCleanup: false` in `config.json`. Note: deleting a pushed branch closes any open PR/MR on it.
- `contentrain_branch_delete`, the Serve UI reject endpoint, `contentrain diff`'s delete action, and `LocalProvider.deleteBranch` remove the remote copy too. `contentrain_branch_delete` also supports remote-only deletion when the local ref is already gone.
- GitHub/GitLab providers delete the source branch after a successful API merge (opt out per call with `mergeBranch(..., { removeSourceBranch: false })`).
- Merged-branch detection (`isMerged`, `cleanupMergedBranches`, `checkBranchHealth`) now falls back to patch-id equivalence (`git cherry`) when ancestry breaks — merged branches no longer flip to "unmerged" after a base-history rewrite. Also fixes the fast-forward guard in the transaction layer, which previously never fired (`merge-base --is-ancestor` signals via exit code with empty stderr, which simple-git reports as success).
- `contentrain_doctor` gains a "Remote branches" check (authoritative `ls-remote` count, offline-safe); `contentrain_branch_list` accepts `remote: true` for a remote view.
- New `contentrain prune` CLI command drains already-leaked merged remote branches (`--dry-run` / `--yes` / `--json`), and `contentrain_submit` lazily prunes up to 20 merged remote leftovers per run.
- New exports from `@contentrain/mcp/git/branch-lifecycle`: `deleteRemoteBranch`, `listRemoteCrBranches`, `pruneMergedRemoteBranches`, `isRefMerged`, `classifyMergedBranches`.
