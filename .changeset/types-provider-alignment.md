---
"@contentrain/types": minor
---

feat(types): RepoProvider contracts + widened `repository.provider`

- `ContentrainConfig.repository.provider` is now `'github' | 'gitlab'` (was a hardcoded `'github'`). Reflects the two remote providers `@contentrain/mcp` ships today.
- The provider-agnostic engine contracts used by `@contentrain/mcp` are now exposed directly from `@contentrain/types`:
  - `RepoReader`, `RepoWriter`, `RepoProvider`
  - `ProviderCapabilities`, `LOCAL_CAPABILITIES`
  - `ApplyPlanInput`, `Commit`, `CommitAuthor`
  - `FileChange`, `Branch`, `FileDiff`, `MergeResult`

Third-party tools can now implement a custom `RepoProvider` without
taking a runtime dependency on `@contentrain/mcp`.

`@contentrain/mcp/core/contracts` keeps re-exporting every symbol, so
existing MCP-based imports are unchanged.
