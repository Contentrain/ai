# `@contentrain/mcp`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Fmcp?label=%40contentrain%2Fmcp)](https://www.npmjs.com/package/@contentrain/mcp)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/mcp)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/packages/mcp)

Local-first MCP server and core primitives for Contentrain.

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

## 🚀 Install

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

## ✨ What It Does

`@contentrain/mcp` manages a `.contentrain/` directory in your project and exposes MCP tools for:

- project initialization
- model creation and deletion
- content save, delete, and list
- validation and auto-fix
- normalize scan and apply flows
- bulk operations
- branch submission and branch-health awareness

All write operations are designed around git-backed safety:

- a dedicated `contentrain` branch serves as the content state single source of truth
- each write creates a temporary worktree on a feature branch forked from `contentrain`
- auto-merge: feature merges into `contentrain`, baseBranch advanced via update-ref, `.contentrain/` files selectively synced to developer's working tree
- review: feature branch pushed to remote for team review
- developer's working tree is never mutated during MCP git operations (no stash, no checkout, no merge)
- context.json is committed together with content changes, not as a separate commit
- keep canonical JSON output
- surface validation and next-step hints to the caller

## 🧰 Tool Surface

16 MCP tools with [annotations](https://spec.modelcontextprotocol.io/specification/2025-03-26/server/tools/#annotations) (`readOnlyHint`, `destructiveHint`, `idempotentHint`) for client safety hints:

| Tool | Purpose | Read-only | Destructive |
| --- | --- | --- | --- |
| `contentrain_status` | Project status, config, models, branch health, context | Yes | — |
| `contentrain_describe` | Full schema and sample data for a model | Yes | — |
| `contentrain_describe_format` | File-format and storage contract reference | Yes | — |
| `contentrain_init` | Create `.contentrain/` structure and base config | — | — |
| `contentrain_scaffold` | Apply a starter template such as blog, docs, landing, saas | — | — |
| `contentrain_model_save` | Create or update a model definition | — | — |
| `contentrain_model_delete` | Delete a model definition | — | **Yes** |
| `contentrain_content_save` | Save content entries for any model kind | — | — |
| `contentrain_content_delete` | Delete content entries | — | **Yes** |
| `contentrain_content_list` | Read content entries | Yes | — |
| `contentrain_validate` | Validate project content, optionally auto-fix structural issues | — | — |
| `contentrain_submit` | Push `contentrain/*` branches to remote | — | — |
| `contentrain_merge` | Merge a review-mode branch into contentrain locally | — | — |
| `contentrain_scan` | Graph- and candidate-based hardcoded string scan | Yes | — |
| `contentrain_apply` | Normalize extract/reuse execution with dry-run support | — | — |
| `contentrain_bulk` | Bulk locale copy, status updates, and deletes | — | — |

## 🚀 Quick Start

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

## 🔄 Example MCP Flow

Typical agent workflow:

1. Call `contentrain_status`
2. If needed, call `contentrain_init`
3. Create models with `contentrain_model_save` or `contentrain_scaffold`
4. Save content with `contentrain_content_save`
5. Validate with `contentrain_validate`
6. For hardcoded strings, use `contentrain_scan` then `contentrain_apply`
7. Push review branches with `contentrain_submit`

## 🧪 Normalize Flow

Normalize is intentionally split into two phases:

### 1. Extract

`contentrain_scan` finds candidate strings.

`contentrain_apply` with `mode: "extract"`:

- creates or updates models
- writes content entries
- records source tracking
- creates a review branch

### 2. Reuse

`contentrain_apply` with `mode: "reuse"`:

- patches source files using agent-provided expressions
- adds imports when needed
- enforces patch path safety and scope checks
- creates a separate review branch

This split keeps content extraction separate from source rewriting.

### Transport / provider requirements

Normalize (`contentrain_scan` and `contentrain_apply`) requires local
disk access — AST scanners walk the source tree and patch files in
place. It runs only on a `LocalProvider` (stdio transport, or HTTP
transport configured with a `LocalProvider`).

Remote providers such as `GitHubProvider` expose `astScan: false`,
`sourceRead: false`, and `sourceWrite: false`. Calling these tools
over a remote provider returns a uniform capability error:

```json
{
  "error": "contentrain_scan requires local filesystem access.",
  "capability_required": "astScan",
  "hint": "This tool is unavailable when MCP is driven by a remote provider (e.g. GitHubProvider). Use a LocalProvider or the stdio transport."
}
```

Agents driving a remote transport should fall back to a local transport
(or a local checkout) before invoking normalize.

## 📦 Core Exports

The package also exposes low-level modules for embedding and advanced use:

- `@contentrain/mcp/server`
- `@contentrain/mcp/core/config`
- `@contentrain/mcp/core/context`
- `@contentrain/mcp/core/model-manager`
- `@contentrain/mcp/core/content-manager`
- `@contentrain/mcp/core/validator`
- `@contentrain/mcp/core/scanner`
- `@contentrain/mcp/core/graph-builder`
- `@contentrain/mcp/core/apply-manager`
- `@contentrain/mcp/util/detect`
- `@contentrain/mcp/util/fs`
- `@contentrain/mcp/git/transaction`
- `@contentrain/mcp/git/branch-lifecycle`
- `@contentrain/mcp/templates`

These are intended for Contentrain tooling and advanced integrations, not for direct manual editing of `.contentrain/` files.

## 🧠 Design Constraints

Key design decisions in this package:

- local-first, filesystem-based MCP
- no GitHub API dependency in MCP
- JSON-only content storage
- git-backed write workflow
- canonical serialization
- framework-agnostic MCP layer
- agent decides content semantics, MCP enforces deterministic execution

## 🛠 Development

From the monorepo root:

```bash
pnpm --filter @contentrain/mcp build
pnpm --filter @contentrain/mcp test
pnpm --filter @contentrain/mcp typecheck
pnpm exec oxlint packages/mcp/src packages/mcp/tests
```

## 🔗 Related Packages

- `contentrain` — CLI and local review tooling
- `@contentrain/query` — generated runtime query SDK
- `@contentrain/rules` — IDE/agent rules and prompts
- `@contentrain/types` — shared schema and model types

## 📚 Documentation

Full documentation at **[ai.contentrain.io/packages/mcp](https://ai.contentrain.io/packages/mcp)**.

## 📄 License

MIT
