---
"@contentrain/mcp": minor
---

feat(mcp): provider-agnostic engine + HTTP transport + GitHub & GitLab providers

The MCP package is now driven by a `RepoProvider` abstraction. All
tools route through the same reader + writer + branch-ops contract,
and the server accepts any provider (not just local disk).

Shipped in this release:

- **HTTP transport** (`@contentrain/mcp/server/http`) — Streamable
  HTTP MCP transport with optional Bearer auth. Works against any
  provider.
- **GitHubProvider** (`@contentrain/mcp/providers/github`) — Octokit
  over the Git Data + Repos APIs. `@octokit/rest` is an optional
  peer dependency.
- **GitLabProvider** (`@contentrain/mcp/providers/gitlab`) —
  gitbeaker over the GitLab REST API. Supports gitlab.com and
  self-hosted CE / EE. `@gitbeaker/rest` is an optional peer
  dependency.
- **Reader-backed reads everywhere** — `listModels`,
  `readModel`, `countEntries`, `checkReferences`, and
  `validateProject` now have reader overloads, so remote providers
  get the same read-side behaviour (validation, reference
  integrity, entry counts) as LocalProvider.
- **Capability-gated tools** — normalize / scan / apply reject with
  a uniform `capability_required` error on providers that do not
  expose local disk access.

No tool-surface changes. Stdio transport + LocalProvider remain the
default and behave identically to the previous release.

Bitbucket provider is on the roadmap; see the README.
