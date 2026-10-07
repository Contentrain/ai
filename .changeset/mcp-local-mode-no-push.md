---
'@contentrain/mcp': minor
'@contentrain/types': minor
'contentrain': minor
---

Adds local mode, an explicit way to keep every MCP write off the remote. Set `"git": { "push": false }` in `.contentrain/config.json`, or `CONTENTRAIN_NO_PUSH=1` for one run. The env wins over the config in both directions: `=1`/`true` turns pushing off even where config allows it, and `=0`/`false` turns it back on over `git.push: false`. Without either, nothing changes: pushing stays on.

- No write path pushes: not the branch publish in `ensureContentBranch`, the review push, the push after an auto-merge, approve (`mergeBranch`) or reconcile, and not `contentrain_submit`. Remote branch deletes and prunes are skipped too. Fetching is not a push and still happens.
- It is never a silent success. `RemotePush` gains `'disabled'`, and each write's `git` block reports `remote_push: "disabled"` with `remote_note: "not pushed (local mode)"` and a `LOCAL MODE` next step. `contentrain_submit` returns an error naming the switch. Remote delete and prune results report `skipped: 'local-mode'`. `contentrain_merge` and `contentrain_branch_delete` still delete the local branch fully and leave any remote copy untouched.
- `@contentrain/types`: `ContentrainConfig.git.push` and `RemotePush` `'disabled'`.
- CLI: `contentrain merge` and `contentrain prune` say when they skipped the remote in local mode.
- The MCP README now documents `CONTENTRAIN_BRANCH`, `CONTENTRAIN_REMOTE` and `CONTENTRAIN_NO_PUSH`.
