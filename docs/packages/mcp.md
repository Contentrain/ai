---
title: MCP Tools
description: Complete reference for @contentrain/mcp — the local-first MCP server powering AI content governance with 13 deterministic tools
order: 1
slug: mcp
---

# MCP Tools

Contentrain's MCP (Model Context Protocol) package is the deterministic execution layer that sits between your AI agent and your filesystem. While the agent makes intelligent content decisions, `@contentrain/mcp` enforces consistent file operations, canonical serialization, and git-backed safety.

## Why MCP?

Traditional content management relies on APIs, dashboards, and manual workflows. Contentrain inverts this:

- **Agent produces** content decisions (what to write, where, in what structure)
- **MCP applies** deterministic filesystem and git operations (how to write it safely)
- **Humans review** and merge through git workflows
- **The system guarantees** schema, locale, and serialization consistency

This separation means your AI agent never directly touches files. Every write goes through MCP's validation, canonical serialization, and git transaction pipeline.

::: tip Why not just let the agent write files?
Agents are non-deterministic. The same prompt can produce different file formats, inconsistent JSON ordering, or broken git state. MCP is the deterministic guardrail that makes AI-generated content safe for production.
:::

## Install

```bash
pnpm add @contentrain/mcp
```

Requirements:
- Node.js 22+
- Git available on the machine

Optional parser support for higher-quality source scanning:
- `@vue/compiler-sfc` — Vue SFC parsing
- `@astrojs/compiler` — Astro component parsing
- `svelte` — Svelte component parsing

## Tool Catalog

The MCP server exposes 13 tools organized by function:

### Read Tools (Safe, No Side Effects)

| Tool | Purpose | Description |
|------|---------|-------------|
| `contentrain_status` | Project overview | Config, models, branch health, context, validation summary |
| `contentrain_describe` | Model deep-dive | Full schema, sample data, field types for any model |
| `contentrain_describe_format` | Format reference | File structure, JSON formats, markdown conventions, locale strategies |
| `contentrain_content_list` | Read content | List and filter content entries with optional relation resolution |

### Write Tools (Git-Backed, Branch-Isolated)

| Tool | Purpose | Description |
|------|---------|-------------|
| `contentrain_init` | Bootstrap project | Creates `.contentrain/` structure, config, and git setup |
| `contentrain_scaffold` | Apply templates | Blog, docs, landing page, or SaaS starter templates |
| `contentrain_model_save` | Define schemas | Create or update model definitions with field types and constraints |
| `contentrain_model_delete` | Remove models | Delete a model definition and its content |
| `contentrain_content_save` | Write content | Save entries for any model kind (collection, singleton, dictionary, document) |
| `contentrain_content_delete` | Remove content | Delete specific content entries |
| `contentrain_validate` | Check & fix | Validate content against schemas, optionally auto-fix structural issues |
| `contentrain_submit` | Push branches | Push `contentrain/*` review branches to remote |

### Normalize Tools (Scan + Apply)

| Tool | Purpose | Description |
|------|---------|-------------|
| `contentrain_scan` | Find hardcoded strings | Graph-based component scan with candidate detection |
| `contentrain_apply` | Extract or reuse | Two-phase normalize: extract content or patch source files |
| `contentrain_bulk` | Batch operations | Bulk locale copy, status updates, and deletes |

## Key Principles

### 1. Deterministic Infrastructure

MCP is infrastructure, not intelligence. It does not decide what content to write — the agent does. MCP guarantees:

- **Canonical JSON** — sorted keys, 2-space indent, trailing newline
- **Consistent file paths** — locale strategy determines where files live
- **Atomic git transactions** — every write is committed to a branch
- **Schema enforcement** — content is validated against model definitions

### 2. Dry-Run First

Every write operation supports `dry_run: true`. The pattern is always:

1. Run with `dry_run: true` to preview changes
2. Review the output
3. Run with `dry_run: false` to commit

::: warning Never Skip Preview
Always call write tools with `dry_run: true` first. This is not optional — it prevents accidental schema changes, content overwrites, and branch pollution.
:::

### 3. Git-Native Workflow

All write operations create or update `contentrain/*` branches:

- Content changes go to isolated branches
- Humans review via `contentrain diff` or the serve UI
- Approved changes merge to main
- Branch health is tracked and surfaced via `contentrain_status`

### 4. Local-First, No API Dependencies

MCP operates entirely on the local filesystem. There is no GitHub API, no cloud service, no external dependency. This means:

- Works offline
- Works with any git provider
- No API keys or authentication needed
- Full data sovereignty

## Usage Examples

### Check Project Status

```ts
// Agent calls contentrain_status
// Returns: config, models list, branch health, pending changes, validation state
```

Ask your agent: *"What's the current state of my Contentrain project?"*

### Create a Model

```ts
// Agent calls contentrain_model_save with dry_run: true first
{
  "id": "blog-post",
  "name": "Blog Posts",
  "kind": "collection",
  "domain": "content",
  "i18n": true,
  "fields": {
    "title": { "type": "string", "required": true },
    "excerpt": { "type": "text" },
    "author": { "type": "relation", "relation": "team-members" },
    "published": { "type": "boolean" }
  }
}
```

Ask your agent: *"Create a blog post model with title, excerpt, author relation, and published flag"*

### Save Content

```ts
// Agent calls contentrain_content_save
{
  "model": "blog-post",
  "entries": [{
    "locale": "en",
    "data": {
      "title": "Getting Started with Contentrain",
      "excerpt": "Learn how to set up AI-powered content management",
      "published": true
    }
  }]
}
```

Ask your agent: *"Add a new blog post about getting started"*

### Normalize Flow (Scan + Extract + Reuse)

```ts
// Phase 1: Scan for hardcoded strings
// Agent calls contentrain_scan → gets candidates

// Phase 2: Extract content
// Agent calls contentrain_apply with mode: "extract"
// Creates models, writes content entries, tracks sources

// Phase 3: Reuse in source
// Agent calls contentrain_apply with mode: "reuse"
// Patches source files with i18n function calls
```

Ask your agent: *"Scan my landing page for hardcoded strings and extract them"*

## Agent Configuration

Connect your IDE agent to the Contentrain MCP server:

::: code-group

```json [Claude Code (.claude/settings.json)]
{
  "mcpServers": {
    "contentrain": {
      "command": "npx",
      "args": ["contentrain", "serve", "--stdio"]
    }
  }
}
```

```json [Cursor (.cursor/mcp.json)]
{
  "mcpServers": {
    "contentrain": {
      "command": "npx",
      "args": ["contentrain", "serve", "--stdio"]
    }
  }
}
```

```json [Windsurf]
{
  "mcpServers": {
    "contentrain": {
      "command": "npx",
      "args": ["contentrain", "serve", "--stdio"]
    }
  }
}
```

:::

Once connected, the agent has access to all 13 MCP tools and can manage your content through natural language.

## Trust Model

| Trust Level | Tools | Risk | Notes |
|-------------|-------|------|-------|
| **HIGH** (read-only) | `status`, `describe`, `describe_format`, `content_list` | None | Safe to call anytime, no side effects |
| **MEDIUM** (git-isolated writes) | `model_save`, `content_save`, `content_delete`, `model_delete`, `validate`, `scaffold`, `bulk` | Low | Changes isolated to `contentrain/*` branches, reviewable |
| **LOW** (source modification) | `scan`, `apply` | Medium | Normalize touches source files — always use dry_run first |
| **MEDIUM** (remote push) | `submit` | Medium | Pushes branches to remote — requires network access |

::: danger Source Modifications
The `contentrain_apply` tool with `mode: "reuse"` modifies your source code files. Always run with `dry_run: true` first, review the patches carefully, and use the review workflow before merging.
:::

## Typical Agent Workflow

```
1. contentrain_status          → understand project state
2. contentrain_init            → bootstrap if needed
3. contentrain_describe_format → understand storage contract
4. contentrain_model_save      → define content schemas
5. contentrain_content_save    → write content entries
6. contentrain_validate        → check everything is valid
7. contentrain_submit          → push for review
```

## Core Exports

For advanced integrations, the package exports low-level modules:

```ts
import { createServer } from '@contentrain/mcp/server'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = createServer(process.cwd())
const transport = new StdioServerTransport()
await server.connect(transport)
```

Available subpath exports:

- `@contentrain/mcp/server` — MCP server factory
- `@contentrain/mcp/core/config` — Config manager
- `@contentrain/mcp/core/model-manager` — Model CRUD
- `@contentrain/mcp/core/content-manager` — Content CRUD
- `@contentrain/mcp/core/validator` — Validation engine
- `@contentrain/mcp/core/scanner` — Source code scanner
- `@contentrain/mcp/core/graph-builder` — Component graph
- `@contentrain/mcp/core/apply-manager` — Normalize apply
- `@contentrain/mcp/git/transaction` — Git transaction flow
- `@contentrain/mcp/templates` — Scaffold templates

## Related Pages

- [CLI](/packages/cli) — Human-facing companion for local operations
- [Query SDK](/packages/sdk) — Generated runtime client for consuming content
- [Rules & Skills](/packages/rules) — Agent behavior policies and workflow playbooks
