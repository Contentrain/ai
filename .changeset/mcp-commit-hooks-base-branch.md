---
"@contentrain/mcp": minor
"@contentrain/types": minor
---

Commit hooks are opt-in, and every local write names its base branch.

- `"git": { "verify": true }` in `.contentrain/config.json`, or `CONTENTRAIN_VERIFY=1` for one run, runs the repository's commit hooks (`pre-commit`, `prepare-commit-msg`, `commit-msg`) on Contentrain's machine commits: the content commit, the `context.json` commit, a reconcile merge commit and the seed commit of an empty repo. A hook that rejects the content commit fails the write with the hook's output; nothing is retried without hooks. A hook that rejects only the follow-up `context.json` commit is reported in the result's `warning`. `CONTENTRAIN_VERIFY=0` skips hooks over the config. The default is unchanged: commit hooks are skipped, so existing projects keep working (#510).
- Every local write's `git` block, and `contentrain_merge`, report `base_branch`: the resolved branch an auto-merge advances and, unless pushing is off, pushes. When it is not the checked-out branch the result's `warning` already says the working tree was not touched (#509).
- `ContentrainConfig.git.verify?: boolean` and `Commit.base_branch?: string` in `@contentrain/types`.
