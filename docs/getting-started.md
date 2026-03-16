---
title: Getting Started
description: Install Contentrain AI and create your first content model in under 5 minutes
order: 1
category: getting-started
slug: getting-started
---

# Getting Started

Contentrain AI is an open-source content governance infrastructure that lets AI agents manage your project's content through [Model Context Protocol (MCP)](https://modelcontextprotocol.io) tools.

## Why Contentrain AI?

Modern web projects have a content problem:

- **Headless CMS platforms** require API calls, dashboards, and manual editing
- **Git-based CMS tools** store content but don't understand your codebase
- **Hardcoded strings** scattered across components are impossible to manage at scale

Contentrain AI solves this differently:

> Your AI agent scans your code, extracts content into structured models, and patches your source files — all through Git, all reviewable, all type-safe.

```
You: "Extract the hardcoded strings from my landing page"
Agent: scans → classifies → creates models → writes content → opens review UI
You: approve in UI → content is live
```

## Quick Start

### 1. Initialize your project

```bash
npx contentrain init
```

This creates `.contentrain/` in your project root with `config.json`, model definitions, and content directories.

### 2. Add MCP to your IDE

Add Contentrain MCP server to your IDE's agent configuration:

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

### 3. Create your first model

Ask your AI agent:

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
subtitle is "Content governance for modern web projects"
```

### 5. Generate the SDK client

```bash
npx contentrain generate
```

This creates a typed client at `.contentrain/client/` with `#contentrain` imports:

```ts
import { singleton } from '#contentrain'

const hero = singleton('hero-section').locale('en').get()
console.log(hero.title) // "Build faster with AI"
```

### 6. Start the review UI

```bash
npx contentrain serve
```

Open `http://localhost:3333` to browse models, content, validation results, and pending branches.

## Packages

All Contentrain packages are published on npm and ready to use:

| Package | Description | Install |
|---|---|---|
| [`@contentrain/mcp`](https://www.npmjs.com/package/@contentrain/mcp) | 13 MCP tools for AI agents | `pnpm add @contentrain/mcp` |
| [`contentrain`](https://www.npmjs.com/package/contentrain) | CLI (init, serve, generate, validate) | `npx contentrain init` |
| [`@contentrain/query`](https://www.npmjs.com/package/@contentrain/query) | Prisma-pattern query SDK | `pnpm add @contentrain/query` |
| [`@contentrain/types`](https://www.npmjs.com/package/@contentrain/types) | Shared TypeScript types | `pnpm add @contentrain/types` |
| [`@contentrain/rules`](https://www.npmjs.com/package/@contentrain/rules) | AI agent quality rules | `pnpm add @contentrain/rules` |
| [`@contentrain/skills`](https://www.npmjs.com/package/@contentrain/skills) | AI agent workflow skills | `pnpm add @contentrain/skills` |

## What's Next?

- [Core Concepts](/concepts) — Understand models, content kinds, and the agent-driven workflow
- [MCP Tools](/packages/mcp) — Explore all 13 MCP tools available to your agent
- [Normalize Flow](/guides/normalize) — Extract hardcoded strings from your codebase
- [Framework Integration](/guides/frameworks) — Set up Contentrain with Vue, Nuxt, Next.js, Astro, or SvelteKit
