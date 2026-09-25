---
'@contentrain/mcp': minor
'@contentrain/types': minor
---

On a checked-out feature branch, MCP now reads `.contentrain/` from the `contentrain` ref instead of the working tree. Content writes deliberately leave that branch's tree alone, so it fell behind every write. Editing the same field of an entry twice was refused with `CONTENT_WORKING_TREE_STALE` until the developer merged the base branch, and `content_list`, `describe`, `status` and `validate` showed stale content.

Now the second edit sees the first. The read tools show what is on `contentrain` and add `content_source: { source: 'ref', ref, commit, checked_out }`. The same-value refusal remains only for a concurrent writer, and it asks for a re-read rather than a git action.

Source files, scan and normalize still read the working tree. The base branch, `contentrain`, `cr/*` branches and a detached HEAD (a CI checkout) behave as before.

Reads are served from one snapshot per tool call: one `ls-tree` and one `cat-file --batch`, reused while `contentrain` does not move. They are never a `git show` per file.

New: `RepoProvider.contentSource?()` and the `ContentReadSource` type in `@contentrain/types`.
