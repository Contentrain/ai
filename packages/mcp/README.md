# `@contentrain/mcp`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Fmcp?label=%40contentrain%2Fmcp)](https://www.npmjs.com/package/@contentrain/mcp)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/mcp)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/packages/mcp)

Provider-agnostic MCP engine for Contentrain — local-first by default, with optional GitHub and GitLab backends and an HTTP transport for remote drivers such as Studio.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [MCP package docs](https://ai.contentrain.io/packages/mcp)
- [Normalize guide](https://ai.contentrain.io/guides/normalize)

Contentrain is AI-generated content governance infrastructure:

- agent produces content decisions
- MCP applies deterministic filesystem and git workflow
- humans review and merge
- the system keeps schema, locale, and serialization consistent

This package is the runtime core behind Contentrain's MCP integration. It can be used as:

- a stdio MCP server (`contentrain-mcp`)
- an embeddable server (`createServer(projectRoot)`)
- a low-level toolkit for config, models, content, validation, scanning, and git transaction flow

## Install

```bash
pnpm add @contentrain/mcp
```

Requirements:

- Node.js `22+`
- git available on the machine

Optional parser support for higher-quality source scanning:

- `@vue/compiler-sfc`
- `@astrojs/compiler`
- `svelte`

They are listed as optional dependencies. The scanner still works without them, but Vue/Astro/Svelte detection is stronger when they are installed.

## What It Does

`@contentrain/mcp` manages a `.contentrain/` directory in your project and exposes MCP tools for:

- project initialization
- model creation and deletion
- content save, delete, and list
- validation and auto-fix
- normalize scan and apply flows
- bulk operations
- branch submission, review-mode merge, and branch-health awareness
- project health checking (doctor)

All write operations are designed around git-backed safety:

- a dedicated `contentrain` branch serves as the content state single source of truth
- each write creates a temporary worktree on a feature branch forked from `contentrain` (branch name: `cr/{operation}/{model}/{locale}/{timestamp}-{suffix}`)
- auto-merge: feature merges into `contentrain`, baseBranch advanced via update-ref, `.contentrain/` files selectively synced to developer's working tree
- review: feature branch pushed to remote for team review
- developer's working tree is never mutated during MCP git operations (no stash, no checkout, no merge)
- context.json is committed together with content changes, not as a separate commit
- canonical JSON output — sorted keys, 2-space indent, trailing newline
- validation + next-step hints surfaced to the caller

## Tool Surface

17 MCP tools with [annotations](https://spec.modelcontextprotocol.io/specification/2025-03-26/server/tools/#annotations) (`readOnlyHint`, `destructiveHint`, `idempotentHint`) for client safety hints:

| Tool | Purpose | Read-only | Destructive |
| --- | --- | --- | --- |
| `contentrain_status` | Project status, config, models, branch health, context | Yes | — |
| `contentrain_describe` | Full schema and sample data for a model | Yes | — |
| `contentrain_describe_format` | File-format and storage contract reference | Yes | — |
| `contentrain_doctor` | Project health report (env, structure, models, orphans, branches, SDK) | Yes | — |
| `contentrain_init` | Create `.contentrain/` structure and base config | — | — |
| `contentrain_scaffold` | Apply a starter template such as blog, docs, landing, saas | — | — |
| `contentrain_model_save` | Create or update a model definition | — | — |
| `contentrain_model_delete` | Delete a model definition | — | **Yes** |
| `contentrain_content_save` | Save content entries for any model kind | — | — |
| `contentrain_content_delete` | Delete content entries | — | **Yes** |
| `contentrain_content_list` | Read content entries | Yes | — |
| `contentrain_validate` | Validate project content, optionally auto-fix structural issues | — | — |
| `contentrain_submit` | Push `cr/*` branches to remote | — | — |
| `contentrain_merge` | Merge a review-mode branch into contentrain locally | — | — |
| `contentrain_scan` | Graph- and candidate-based hardcoded string scan | Yes | — |
| `contentrain_apply` | Normalize extract/reuse execution with dry-run support | — | — |
| `contentrain_bulk` | Bulk locale copy, status updates, and deletes | — | — |

## Quick Start

### Configure via CLI (recommended)

```bash
npx contentrain setup claude-code   # or: cursor, vscode, windsurf, copilot
```

This auto-creates the correct MCP config file for your IDE. See [CLI docs](https://ai.contentrain.io/packages/cli) for details.

### Run as a standalone MCP server

```bash
CONTENTRAIN_PROJECT_ROOT=/path/to/project npx contentrain-mcp
```

If `CONTENTRAIN_PROJECT_ROOT` is omitted, the current working directory is used.

### Embed the server in your own process

```ts
import { createServer } from '@contentrain/mcp/server'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = createServer(process.cwd())
const transport = new StdioServerTransport()

await server.connect(transport)
```

## Example MCP Flow

Typical agent workflow:

1. Call `contentrain_status`
2. If needed, call `contentrain_init`
3. Create models with `contentrain_model_save` or `contentrain_scaffold`
4. Save content with `contentrain_content_save`
5. Validate with `contentrain_validate`
6. For hardcoded strings, use `contentrain_scan` then `contentrain_apply`
7. Push review branches with `contentrain_submit`

## Normalize Flow

Normalize is intentionally split into two phases:

### 1. Extract

`contentrain_scan` finds candidate strings.

`contentrain_apply` with `mode: "extract"`:

- creates or updates models
- writes content entries
- records source tracking
- creates a review branch (`cr/normalize/extract/{domain}/{timestamp}`)

### 2. Reuse

`contentrain_apply` with `mode: "reuse"`:

- patches source files using agent-provided expressions
- adds imports when needed
- enforces patch path safety and scope checks
- creates a separate review branch (`cr/normalize/reuse/{model}/{locale}/{timestamp}`)

This split keeps content extraction separate from source rewriting.

### Transport / provider requirements

Normalize (`contentrain_scan` and `contentrain_apply`) requires local disk access — AST scanners walk the source tree and patch files in place. It runs only on a `LocalProvider` (stdio transport, or HTTP transport configured with a `LocalProvider`).

Remote providers such as `GitHubProvider` expose `astScan: false`, `sourceRead: false`, and `sourceWrite: false`. Calling these tools over a remote provider returns a uniform capability error:

```json
{
  "error": "contentrain_scan requires local filesystem access.",
  "capability_required": "astScan",
  "hint": "This tool is unavailable when MCP is driven by a remote provider (e.g. GitHubProvider). Use a LocalProvider or the stdio transport."
}
```

Agents driving a remote transport should fall back to a local transport (or a local checkout) before invoking normalize.

## Remote Providers

MCP supports three backends behind the same `RepoProvider` contract:

- **LocalProvider** — simple-git + worktree. Every tool (normalize included) works on it. Stdio transport defaults to this.
- **GitHubProvider** — Octokit over the Git Data + Repos APIs. No clone, no worktree. `@octokit/rest` ships as an optional peer dependency.
- **GitLabProvider** — gitbeaker over the GitLab REST API. No clone, no worktree. `@gitbeaker/rest` ships as an optional peer dependency. Supports gitlab.com and self-hosted CE / EE.

Each remote provider implements the same surface: reader (readFile / listDirectory / fileExists), writer (applyPlan — one atomic commit), branch ops (list / create / delete / diff / merge / isMerged / getDefaultBranch). `mergeBranch` goes straight through on GitHub; on GitLab it opens an MR and immediately accepts it so the final `MergeResult` shape matches either way.

### GitLab — installation & usage

```bash
pnpm add @gitbeaker/rest
```

```ts
import { createGitLabProvider } from '@contentrain/mcp/providers/gitlab'
import { createServer } from '@contentrain/mcp/server'

const provider = await createGitLabProvider({
  auth: { type: 'pat', token: process.env.GITLAB_TOKEN! },
  project: {
    projectId: 'acme/site',             // or numeric project ID
    host: 'https://gitlab.company.com', // omit for gitlab.com
  },
})

const server = createServer({ provider })
// serve over stdio or the HTTP transport from @contentrain/mcp/server/http
```

Capabilities: `sourceRead`, `sourceWrite`, `astScan`, `localWorktree` are all `false`; `pushRemote`, `branchProtection`, `pullRequestFallback` are `true`. Normalize / scan / apply reject with a capability error on GitLabProvider — fall back to a local transport for those flows.

### Bitbucket — coming soon

Bitbucket Cloud + Data Center support is on the roadmap. Until the provider ships, use the `contentrain_describe_format` tool to drive Contentrain content operations manually from a Bitbucket checkout via the LocalProvider path.

## Core Exports

The package also exposes low-level modules for embedding and advanced use:

- `@contentrain/mcp/server`
- `@contentrain/mcp/server/http`
- `@contentrain/mcp/core/config`
- `@contentrain/mcp/core/context`
- `@contentrain/mcp/core/model-manager`
- `@contentrain/mcp/core/content-manager`
- `@contentrain/mcp/core/validator`
- `@contentrain/mcp/core/scanner`
- `@contentrain/mcp/core/graph-builder`
- `@contentrain/mcp/core/apply-manager`
- `@contentrain/mcp/core/scan-config`
- `@contentrain/mcp/core/doctor`
- `@contentrain/mcp/core/contracts`
- `@contentrain/mcp/core/ops`
- `@contentrain/mcp/core/overlay-reader`
- `@contentrain/mcp/util/detect`
- `@contentrain/mcp/util/fs`
- `@contentrain/mcp/git/transaction`
- `@contentrain/mcp/git/branch-lifecycle`
- `@contentrain/mcp/tools/annotations`
- `@contentrain/mcp/templates`
- `@contentrain/mcp/providers/local`
- `@contentrain/mcp/providers/github`
- `@contentrain/mcp/providers/gitlab`

These are intended for Contentrain tooling and advanced integrations, not for direct manual editing of `.contentrain/` files.

## Design Constraints

Key design decisions in this package:

- local-first **by default** — stdio transport + LocalProvider works without any network dependency
- provider-agnostic engine — the same 17 tools run over LocalProvider, GitHubProvider, or GitLabProvider behind a single `RepoProvider` contract
- remote provider SDKs (`@octokit/rest`, `@gitbeaker/rest`) are optional peer dependencies — pulled in only when their provider is used
- JSON-only content storage
- git-backed write workflow (worktree transaction locally, single atomic commit over the Git Data / REST APIs remotely)
- canonical serialization — byte-deterministic output, sorted keys, trailing newline
- framework-agnostic MCP layer
- agent decides content semantics, MCP enforces deterministic execution
- capability gates — tools that need source-tree access (normalize, scan, apply, doctor) reject with a uniform `capability_required` error on remote providers

## Development

From the monorepo root:

```bash
pnpm --filter @contentrain/mcp build
pnpm --filter @contentrain/mcp test
pnpm --filter @contentrain/mcp typecheck
pnpm exec oxlint packages/mcp/src packages/mcp/tests
```

## Related Packages

- `contentrain` — CLI and local review tooling
- `@contentrain/query` — generated runtime query SDK
- `@contentrain/rules` — IDE/agent rules and prompts
- `@contentrain/types` — shared schema and model types

## Documentation

Full documentation at **[ai.contentrain.io/packages/mcp](https://ai.contentrain.io/packages/mcp)**.

## License

MIT
