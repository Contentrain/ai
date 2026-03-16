# `@contentrain/mcp`

Local-first MCP server and core primitives for Contentrain.

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

- write to a dedicated `contentrain/*` branch
- keep canonical JSON output
- update `.contentrain/context.json`
- surface validation and next-step hints to the caller

## 🧰 Tool Surface

Current MCP tools exposed by the server:

| Tool | Purpose |
| --- | --- |
| `contentrain_status` | Project status, config, models, branch health, context |
| `contentrain_describe` | Full schema and sample data for a model |
| `contentrain_describe_format` | File-format and storage contract reference |
| `contentrain_init` | Create `.contentrain/` structure and base config |
| `contentrain_scaffold` | Apply a starter template such as blog, docs, landing, saas |
| `contentrain_model_save` | Create or update a model definition |
| `contentrain_model_delete` | Delete a model definition |
| `contentrain_content_save` | Save content entries for any model kind |
| `contentrain_content_delete` | Delete content entries |
| `contentrain_content_list` | Read content entries |
| `contentrain_validate` | Validate project content, optionally auto-fix structural issues |
| `contentrain_submit` | Push `contentrain/*` branches to remote |
| `contentrain_scan` | Graph- and candidate-based hardcoded string scan |
| `contentrain_apply` | Normalize extract/reuse execution with dry-run support |
| `contentrain_bulk` | Bulk locale copy, status updates, and deletes |

## 🚀 Quick Start

### Run as an MCP server

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

## 📄 License

MIT
