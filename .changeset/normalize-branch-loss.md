---
"@contentrain/mcp": minor
---

Fix silent content loss in `contentrain_apply` (normalize extract and reuse)

A review-mode transaction pushed inside `complete()` and set its
`pendingReview` flag only *after* the push returned. When the push was
rejected — no write access to the remote, offline, or stale credentials —
the throw skipped that flag, `cleanup()` classified the transaction as
failed, and deleted the feature branch. The commit was real and correct but
reachable from nothing, so it was lost to the next `git gc`. Meanwhile the
caller swallowed the error in a bare `catch {}` and reported
`action: "pending-review"` with a full `source_map` and `entries_written`
count, which is indistinguishable from success. Anyone running normalize on
a repository they cannot push to lost every extracted string and was told
the extraction had succeeded.

Three changes:

- `complete()` marks the review branch as surviving before attempting the
  push, and reports a push failure through the existing `warning` field
  instead of throwing. Publishing is what `contentrain_submit` is for; a
  failed convenience push must not discard committed work.
- `cleanup()` now prunes a branch only when that cannot lose anything —
  nothing was committed, or the work was already merged into the
  `contentrain` branch. A branch holding a commit reachable from nowhere
  else is kept. A stray `cr/*` ref after a failure is recoverable; a deleted
  commit is not.
- The `catch` blocks around `complete()` in extract and reuse no longer fall
  through to a value that mimics success. They report `action: "incomplete"`
  plus a `warning` explaining what happened and where the branch is.

Also: `contentrain_validate` no longer suggests `contentrain_submit` in its
`next_steps` when that tool cannot run. Validate works over any provider,
but submit needs a local worktree and a pushable remote, so on a remote
provider the suggestion pointed at a tool that is not even registered.
