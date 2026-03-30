---
title: Getting Started
description: "Set up repo-native content governance for AI agents in under 5 minutes — for new projects or existing codebases"
order: 1
category: getting-started
slug: getting-started
---

# Getting Started

Contentrain AI is an open-source, repo-native content governance stack. Your AI agent creates, extracts, and updates content through [Model Context Protocol (MCP)](https://modelcontextprotocol.io) tools, while Contentrain ensures that content is structured, validated, reviewed, and deliverable to any platform.

## Prerequisites

- Node.js 22+
- Git
- An MCP-compatible AI agent (Claude Code, Cursor, Windsurf, or similar)

## Choose Your Path

::: code-group

```bash [New Project]
# Start with structured content from day one
npx contentrain init
```

```bash [Existing Project]
# Already have hardcoded strings? Extract them
npx contentrain init
# Then tell your agent: "Scan my project and extract all hardcoded strings"
```

:::

## Quick Start: New Project

### 1. Initialize

```bash
npx contentrain init
```

This creates `.contentrain/` in your project root with configuration, model definitions, and content directories. If the directory is not a git repo, it runs `git init` automatically.

### 2. Connect your AI agent

Add the Contentrain MCP server to your IDE:

::: code-group

```json [Claude Code (.mcp.json)]
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

### 3. Create a content model

Tell your agent:

```
Create a hero section model with title, subtitle, and CTA fields
```

The agent calls `contentrain_model_save` and creates:

```
.contentrain/
  models/hero-section.json
  content/marketing/hero-section/en.json
```

### 4. Add content

```
Add content to the hero section: title is "Build faster with AI",
subtitle is "Content governance for any platform"
```

### 5. Use your content

The content is plain JSON — you can read it directly from any language or platform:

```json
{
  "title": "Build faster with AI",
  "subtitle": "Content governance for any platform"
}
```

For TypeScript projects, generate a typed SDK client for convenience:

```bash
npx contentrain generate
```

```ts
import { singleton } from '#contentrain'

const hero = singleton('hero-section').locale('en').get()
console.log(hero.title) // "Build faster with AI"
```

::: tip SDK is optional
The generated TypeScript SDK provides type-safe queries, but the content files are plain JSON and Markdown. Any platform that reads JSON — Go, Python, Swift, Kotlin, Rust — can consume your content directly.
:::

### 6. Review with the local UI

```bash
npx contentrain serve
```

Open `http://localhost:3333` to browse models, content, validation results, and pending branches.

## Quick Start: Existing Project

Already have hardcoded strings scattered across your codebase? The [Normalize Flow](/guides/normalize) extracts them into structured content:

```
You: "Scan my project and extract all hardcoded strings"
Agent: scans 47 files → finds 523 strings → classifies → creates models → patches source
You: review in UI → approve → structured content, ready for any language
```

See the [Normalize Flow guide](/guides/normalize) for the complete walkthrough.

## The Content Pipeline

Every operation follows the same governance pipeline:

```
Agent generates → MCP validates → Human reviews → Git commits → Content delivered
```

- **Agent** decides what to create (your AI, your choice — BYOA)
- **MCP** enforces structure, validation, and canonical serialization
- **Human** reviews and approves through the local UI or [Studio](https://studio.contentrain.io)
- **Git** stores everything — full history, rollback, audit trail
- **Content** is delivered as plain JSON/Markdown to any platform

## Packages

All packages are published on npm:

| Package | Description | Install |
|---|---|---|
| [`contentrain`](https://www.npmjs.com/package/contentrain) | CLI (init, serve, generate, validate) | `npx contentrain init` |
| [`@contentrain/mcp`](https://www.npmjs.com/package/@contentrain/mcp) | 13 MCP tools for AI agents | `pnpm add @contentrain/mcp` |
| [`@contentrain/query`](https://www.npmjs.com/package/@contentrain/query) | TypeScript query SDK (optional) | `pnpm add @contentrain/query` |
| [`@contentrain/types`](https://www.npmjs.com/package/@contentrain/types) | Shared TypeScript types | `pnpm add @contentrain/types` |
| [`@contentrain/rules`](https://www.npmjs.com/package/@contentrain/rules) | AI agent quality rules | `pnpm add @contentrain/rules` |
| [`@contentrain/skills`](https://www.npmjs.com/package/@contentrain/skills) | AI agent workflow procedures | `pnpm add @contentrain/skills` |

## What's Next?

- [Core Concepts](/concepts) — Models, content kinds, domains, and the governance architecture
- [MCP Tools](/packages/mcp) — All 13 tools available to your agent
- [Normalize Flow](/guides/normalize) — Extract hardcoded strings from existing code
- [i18n Workflow](/guides/i18n) — Add languages to your content
- [Framework Integration](/guides/frameworks) — Platform-specific setup patterns

::: info Contentrain Studio
When you need team collaboration, visual diff review, and content CDN for non-web platforms — [Contentrain Studio](https://studio.contentrain.io) extends everything with a hosted governance UI.
:::
