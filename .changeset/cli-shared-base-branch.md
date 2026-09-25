---
'@contentrain/mcp': minor
'contentrain': patch
---

`contentrain status` and the `contentrain serve` UI now resolve the base branch with the same resolver MCP writes use, exported as `@contentrain/mcp/git/base-branch` (`resolveBaseBranch`): `CONTENTRAIN_BRANCH` env, then `repository.default_branch`, then `origin/HEAD`, then `main`, then `master`, then the checked-out branch. Both used to read `repository.default_branch ?? 'main'`, so in a `master` or `trunk` repository without that config they reported divergence against a branch no write advances. `status --json` now also reports the base as `content_branch.base`, and serve's `/api/capabilities` `defaultBranch` is `null` when it cannot be resolved.
