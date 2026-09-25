---
'@contentrain/types': minor
'@contentrain/mcp': minor
'contentrain': minor
---

`contentrain init` and the `contentrain_init` tool record the project's default branch as `repository.default_branch`, so later local writes no longer depend on inference. It is resolved once with the base-branch resolver: `origin/HEAD`, then `main`, then `master`. The `CONTENTRAIN_BRANCH` env is not recorded. The checked-out branch is recorded only when it is the repository's only branch, so running `init` from a feature branch still records the default branch. When the default cannot be told apart from the checkout, nothing is written and the CLI says so. `contentrain_init` returns the value as `default_branch`.

`ContentrainConfig.repository.provider`, `owner` and `name` are now optional, so `{ "repository": { "default_branch": "main" } }` is a valid config. New exports from `@contentrain/mcp/git/base-branch`: `resolveBaseBranchSource` and `resolveInitDefaultBranch`.
