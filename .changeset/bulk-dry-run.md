---
"@contentrain/mcp": minor
"@contentrain/skills": patch
---

`contentrain_bulk` takes `dry_run`

Every other write path could be previewed; bulk — the one tool that changes many
entries at once — could not. `dry_run: true` runs the operation in the throwaway
worktree it would have used anyway and reports exactly what would change, then
discards it: no commit, no content on disk, no `cr/*` branch left behind.

Because the preview is the real operation against a disposable worktree, the
numbers are measured rather than predicted — `would_update` counts the meta
records actually found (with `not_found` for the rest), `would_delete` comes with
the file list, and `copy_locale` reports `would_replace`: how many records
already exist in the target locale and would be overwritten, which is the whole
risk of that operation and was invisible before.

`delete_entries` needs no `confirm` while previewing — demanding confirmation for
a run that deletes nothing would make the safe path the harder one. The real run
still requires it, and now points at the preview.

Default is `false`, so existing callers keep executing.
