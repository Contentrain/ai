---
"@contentrain/mcp": patch
---

fix(mcp): stop tripping simple-git's block-unsafe guard on every write

`git commit` (and every other worktree operation) began failing with
`Use of "EDITOR"/"GIT_ASKPASS" is not permitted…` in any host that exports
those variables (VS Code, Claude Code, CI). Nothing in Contentrain changed — a
transitive bump of `simple-git` to `>= 3.34` pulled in `@simple-git/argv-parser`,
whose block-unsafe guard rejects a `git` invocation when a guard-listed variable
is passed **explicitly** through `.env()`. The transaction layer had been
spreading `...process.env` into `.env()` to set the commit author, so the guard
saw those inherited variables and refused to run.

- Commit identity now flows through `-c user.name` / `-c user.email` config
  (`authorConfig`) instead of `.env()`. These keys are not on any unsafe list and
  git honours them for both author and committer, so the guard is never touched —
  regardless of what the host exports. `CONTENTRAIN_AUTHOR_NAME/EMAIL` overrides
  are preserved.
- The one instance that legitimately needs the inherited environment — network
  push/fetch, which relies on the host's askpass/SSH/proxy setup — keeps `.env()`
  but opts out of the affected guard categories via `unsafe` (`NETWORK_UNSAFE`),
  leaving arg-injection protections intact. This closes the same latent failure
  in `contentrain_submit`.
- Both concerns are centralized in `git/identity.ts` so no future call site can
  reintroduce a `process.env` spread. `simple-git` is pinned to `^3.36.0`.

Covered by `tests/git/identity.test.ts`, including a control that asserts the old
`.env(process.env)` path still trips the guard.
