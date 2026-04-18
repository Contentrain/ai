---
title: Providers & Transports
description: How Contentrain MCP's provider-agnostic engine works — LocalProvider, GitHubProvider, GitLabProvider — and which capabilities each exposes.
slug: providers
---

# Providers & Transports

Contentrain MCP runs the same 17 tools over three backends:

- **LocalProvider** — simple-git + a temporary worktree on your disk. Default for `npx contentrain serve --stdio` and the HTTP transport when driven by the CLI.
- **GitHubProvider** — Octokit over the GitHub Git Data + Repos APIs. No clone, no worktree.
- **GitLabProvider** — gitbeaker over the GitLab REST API. No clone, no worktree. Works with gitlab.com and self-hosted CE / EE.

All three implement the same `RepoProvider` contract from `@contentrain/types`. Tool handlers route through the contract, never the concrete provider, so a change of backend never changes the tool surface an agent sees.

Bitbucket support is on the roadmap — see the README for the current status.

## Transport matrix

| Transport | Typical driver | Provider used | Notes |
|---|---|---|---|
| `stdio` | Claude Code, Cursor, Windsurf, any MCP client | LocalProvider | Ships inside `contentrain` CLI (`contentrain serve --stdio`) |
| HTTP (`POST /mcp`) with LocalProvider | Local CI runner, Studio when pointed at a working tree | LocalProvider | `contentrain serve --mcpHttp --authToken …` |
| HTTP with GitHubProvider | Studio's hosted agent, CI against a GitHub repo | GitHubProvider | Embedders construct the provider with `createGitHubProvider({ auth, repo })` |
| HTTP with GitLabProvider | Studio's hosted agent, CI against a GitLab repo | GitLabProvider | Embedders construct the provider with `createGitLabProvider({ auth, project })` |

## Capability matrix

Some tools need more than a git provider can offer — normalize has to walk your source tree with an AST parser, submit has to invoke `git push`. Each provider advertises a capability set; tools gate on the capabilities they need and reject over HTTP with a uniform `capability_required` error when the active provider can't satisfy them.

| Capability | LocalProvider | GitHubProvider | GitLabProvider | Tools that require it |
|---|---|---|---|---|
| `localWorktree` | ✓ | — | — | `init`, `scaffold`, `validate --fix`, `submit`, `merge`, `bulk` |
| `sourceRead` | ✓ | — | — | `apply` (extract mode) |
| `sourceWrite` | ✓ | — | — | `apply` (reuse mode) |
| `astScan` | ✓ | — | — | `scan` |
| `pushRemote` | ✓ | ✓ | ✓ | `submit` |
| `branchProtection` | — | ✓ | ✓ | merge fallback detection |
| `pullRequestFallback` | — | ✓ | ✓ | merge fallback creation |

Read-only tools (`status`, `describe`, `describe_format`, `content_list`, `validate` without `--fix`) work on every provider. Write tools (`content_save`, `content_delete`, `model_save`, `model_delete`) work over any provider too — a remote provider posts the changes as a single atomic commit and always returns `action: pending-review` so Studio (or whoever orchestrates the server) drives the merge.

`content_list` with `resolve: true` requires local filesystem access today because relation hydration walks other models' content files. The reader-backed path rejects it with a descriptive error.

## When to use which provider

- **`LocalProvider`** — Day-to-day development from an IDE. Offline-capable, zero API keys, full source-tree access for normalize.
- **`GitHubProvider`** — CI-driven content operations, Studio's hosted agent, or any automation that should push directly to a GitHub repository without a clone. Requires `@octokit/rest` (optional peer dependency) and a personal access token or GitHub App installation.
- **`GitLabProvider`** — Same as above for GitLab (SaaS or self-hosted). Requires `@gitbeaker/rest` (optional peer dependency) and a PAT / OAuth / job token.

The choice is operational, not commercial. All three providers live in MIT; enterprise features are on top of Contentrain Studio, not behind provider gates. See [Ecosystem Map](/ecosystem) for the full package-to-product relationship.

## Installation

Base install:

```bash
pnpm add @contentrain/mcp
```

Remote provider peers — install only when the backend is used:

```bash
# GitHub
pnpm add @octokit/rest

# GitLab
pnpm add @gitbeaker/rest
```

stdio + `LocalProvider` flows (the default) need neither peer.

## Wiring a remote provider

```ts
import { createServer } from '@contentrain/mcp/server'
import { createGitHubProvider } from '@contentrain/mcp/providers/github'
// or: import { createGitLabProvider } from '@contentrain/mcp/providers/gitlab'
import { startHttpMcpServerWith } from '@contentrain/mcp/server/http'

const provider = await createGitHubProvider({
  auth: { type: 'pat', token: process.env.GITHUB_TOKEN! },
  repo: { owner: 'acme', name: 'site' },
})

const handle = await startHttpMcpServerWith({
  provider,
  port: 3333,
  authToken: process.env.MCP_BEARER_TOKEN,
})

console.log(`MCP server at ${handle.url}`)
```

The server is MCP-compliant — any MCP client (including Studio) can talk to it over Streamable HTTP.

## Next steps

- See the [HTTP Transport guide](/guides/http-transport) for deployment patterns, auth, and the Studio use case.
- The [MCP package reference](/packages/mcp) documents every tool's parameters and return shape.
- [Normalize Flow](/guides/normalize) explains why normalize is local-only.
