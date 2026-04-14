---
title: Getting Started
description: "Set up structured content governance in under 5 minutes — start with an existing codebase rescue or a new content layer"
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

```bash [Existing Project]
# This is the main wedge: rescue hardcoded strings
npx contentrain init
# Then tell your agent: "Scan my project and extract all hardcoded strings"
```

```bash [New Project]
# Start with structured content from day one
npx contentrain init
```

:::

## Quick Start: Existing Project

Already have hardcoded strings scattered across your codebase? Start here.

```bash
npx contentrain init
npx contentrain serve --stdio
```

Then tell your agent:

```text
Scan my project and extract all hardcoded UI strings into structured content.
```

Typical outcome:

```text
Agent scans 47 files → finds 523 strings → classifies → creates models → writes content → proposes source patches
```

Review the extracted content and branch diffs locally, then continue with the full [Normalize Flow](/guides/normalize).

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

## Team Workflows

When the local CLI and MCP flow are not enough, [Contentrain Studio](/studio) adds the team web layer:

- workspace and project management
- role-based access and review responsibilities
- chat-first content operations
- branch and diff review
- media management
- CDN delivery for non-web platforms

Connect your local project to Studio with two commands:

```bash
contentrain studio login
contentrain studio connect
```

The `connect` command detects your git remote, verifies GitHub App installation, scans for `.contentrain/` configuration, and creates the project — all in one interactive flow. See [CLI Studio Integration](/packages/cli#connecting-a-repository) for details.

## The Content Pipeline

Every operation follows the same governance pipeline:

```
Agent generates → MCP validates → Human reviews → Git commits → Content delivered
```

- **Agent** decides what to create (your AI, your choice — BYOA)
- **MCP** enforces structure, validation, and canonical serialization
- **Human** reviews and approves through the local UI or [Studio](/studio)
- **Git** stores everything — full history, rollback, audit trail
- **Content** is delivered as plain JSON/Markdown to any platform

## Packages

All packages are published on npm:

| Package | Description | Install |
|---|---|---|
| [`contentrain`](https://www.npmjs.com/package/contentrain) | CLI (init, serve, generate, validate) | `npx contentrain init` |
| [`@contentrain/mcp`](https://www.npmjs.com/package/@contentrain/mcp) | 16 MCP tools for AI agents | `pnpm add @contentrain/mcp` |
| [`@contentrain/query`](https://www.npmjs.com/package/@contentrain/query) | TypeScript query SDK (optional) | `pnpm add @contentrain/query` |
| [`@contentrain/types`](https://www.npmjs.com/package/@contentrain/types) | Shared TypeScript types | `pnpm add @contentrain/types` |
| [`@contentrain/rules`](https://www.npmjs.com/package/@contentrain/rules) | AI agent quality rules | `pnpm add @contentrain/rules` |
| [`@contentrain/skills`](https://www.npmjs.com/package/@contentrain/skills) | AI agent workflow procedures | `pnpm add @contentrain/skills` |

::: tip Updating Skills & Rules
After upgrading packages, run `contentrain skills --update` to refresh IDE skills and rules. Use `contentrain skills --list` to check installation status.
:::

## Starter Templates

Want to skip setup? Start from a production-ready template with content models, SDK client, and framework patterns pre-configured:

| Template | Framework | Use Case |
|---|---|---|
| [astro-blog](https://github.com/Contentrain/contentrain-starter-astro-blog) | Astro | Blog / editorial |
| [astro-landing](https://github.com/Contentrain/contentrain-starter-astro-landing) | Astro | Landing page |
| [next-commerce](https://github.com/Contentrain/contentrain-starter-next-commerce) | Next.js | E-commerce |
| [next-saas-dashboard](https://github.com/Contentrain/contentrain-starter-next-saas-dashboard) | Next.js | SaaS dashboard |
| [nuxt-saas](https://github.com/Contentrain/contentrain-starter-nuxt-saas) | Nuxt | SaaS marketing |
| [sveltekit-editorial](https://github.com/Contentrain/contentrain-starter-sveltekit-editorial) | SvelteKit | Editorial |
| [vitepress-docs](https://github.com/Contentrain/contentrain-starter-vitepress-docs) | VitePress | Documentation |

[See all 10 templates on GitHub](https://github.com/orgs/Contentrain/repositories?q=contentrain-starter&type=template)

## What's Next?

- [Core Concepts](/concepts) — Models, content kinds, domains, and the governance architecture
- [Ecosystem Map](/ecosystem) — How AI packages and Studio fit together
- [MCP Tools](/packages/mcp) — All 15 tools available to your agent
- [Normalize Flow](/guides/normalize) — Extract hardcoded strings from existing code
- [i18n Workflow](/guides/i18n) — Add languages to your content
- [Framework Integration](/guides/frameworks) — Platform-specific setup patterns

::: info Contentrain Studio
[Contentrain Studio](/studio) is the open-core team operations surface for Git-native structured content. Teams can self-host the AGPL core or use a managed Pro/Enterprise offering when they want web-based collaboration, review, media, and CDN delivery on top of the same content model.
:::
