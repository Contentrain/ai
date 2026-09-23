---
"@contentrain/mcp": patch
"@contentrain/types": patch
---

Local provider: writes no longer trust the developer's checkout as the content truth.

A write whose working tree is behind `contentrain` no longer deletes entries (#226). The local provider plans from the working tree but commits on the fetched `contentrain` tip. It used to write each planned file whole, so an entry another writer (Studio, a teammate, CI) had pushed since the developer's last pull was silently dropped, then pushed and advanced into the base branch. Changes are now carried over to the tip key by key: the other writer's entries and fields stay, and the write's own edits are applied on top. Uncommitted working-tree edits are no longer committed along with the write. When both sides changed the same value, or a changed file cannot be merged (markdown, a delete of a file that gained entries), nothing is written and the tool returns `CONTENT_WORKING_TREE_STALE`. Its hint says `git pull` on the base branch, or `git merge <base>` on a feature branch, whose tree content writes do not update. In meta files, the write stamp (`updated_at`, `updated_by`, `source`) is not a conflict: every write re-stamps what it touches, so this write's stamp wins as a unit, while `status` and scheduling still merge or conflict normally.

The base branch is no longer the checked-out branch (#227). One resolver now serves writes, merge, reconcile, status and branch cleanup: the `CONTENTRAIN_BRANCH` env, then `repository.default_branch`, then the remote's default branch (`origin/HEAD`), then `main`, then `master`. The checked-out branch is used only when none of these exists. A write made while a feature branch is checked out used to merge that branch's code commits into `contentrain`, advance and push the feature branch, and let the code reach the default branch on the next write. It now lands on `contentrain` and the base branch only. The feature branch, the working tree and the index are left as they are, and the response carries a `warning` saying where the content went.

`ContentrainConfig.repository.default_branch` is documented as the base branch local writes advance, not as informational metadata.
