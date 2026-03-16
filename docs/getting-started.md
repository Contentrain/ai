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

You've shipped your landing page. 47 components, 500+ hardcoded strings. Now the founder says "we need Turkish" and the marketer wants to A/B test the hero copy. You're looking at a week of grep-and-replace.

**This is the content problem every frontend team hits:**

- **Headless CMS platforms** need dashboards, API calls, and manual copy-paste between systems
- **Git-based CMS tools** store content but have no idea what's in your components
- **Hardcoded strings** scattered across 47 files — no single source of truth, no translation path

Contentrain AI takes a different approach:

> Tell your AI agent what you need. It scans your code, extracts strings into structured content models, patches your source files with i18n references, and opens a review UI — all through Git, all type-safe, zero vendor lock-in.

```
You: "Extract the hardcoded strings from my landing page and translate to Turkish"
Agent: scans 47 files → finds 523 strings → classifies → creates models → writes content → patches source
You: review in UI → approve → content is live in 2 languages
```

### Bring Your Own Agent (BYOA)

Contentrain doesn't ship its own AI. Your IDE agent (Claude Code, Cursor, Windsurf, or any MCP-compatible agent) **is** the intelligence layer. Contentrain provides 13 deterministic MCP tools that any agent can call. No AI markup in your code, no proprietary syntax — just Git files and a typed SDK.

### The Content Pipeline

```
Agent generates → MCP validates → Human reviews → Git commits → SDK serves
```

Every step is auditable. Every change is a git diff. Nothing reaches production without your approval.

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

::: info Contentrain Studio
For team collaboration, visual content review, and CDN delivery, check out [Contentrain Studio](https://studio.contentrain.io) — the hosted governance UI that connects to your Git repo.
:::
