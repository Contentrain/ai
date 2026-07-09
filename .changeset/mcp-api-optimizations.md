---
"@contentrain/mcp": minor
---

Three additive GitHub-provider optimizations that cut API calls per write (no breaking changes)

- **applyPlan blob inlining** — `applyPlanToGitHub` now inlines file content directly in the Git tree entries instead of POSTing a blob per file. A write drops from `N+3` GitHub mutations to a fixed `3` (tree + commit + ref) regardless of file count, easing the mutation-rate secondary limit. This brings the GitHub provider to parity with the GitLab provider, which already inlines content in its commit actions. Deletions are unchanged (null-sha entries); content is passed through byte-for-byte.
- **GitHubReader opt-in read memoization** — `new GitHubReader(client, repo, { memoize: true })` deduplicates repeated `(path, ref)` reads within one operation across `readFile` / `listDirectory` / `fileExists`. Opt-in and off by default; failed reads are evicted so transient errors are retried, not cached. The provider's own long-lived reader does not enable it (a reader that outlives a write must not serve stale results).
- **buildContextChange stats injection** — `buildContextChange(reader, operation, source, { stats })` lets a caller that already knows the model/entry counts skip the O(models·locales) reader walk; only `readConfig` remains. The emitted context.json is byte-identical to the scanned variant. Parameterless callers are unaffected.
