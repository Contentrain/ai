---
title: CLI
description: Complete reference for the contentrain CLI — initialize projects, validate content, generate SDK clients, and manage review workflows from the terminal
order: 2
slug: cli
---

# CLI

[![npm version](https://img.shields.io/npm/v/contentrain)](https://www.npmjs.com/package/contentrain) [![npm downloads](https://img.shields.io/npm/dm/contentrain)](https://www.npmjs.com/package/contentrain)

The `contentrain` CLI is the human-facing companion to `@contentrain/mcp`. While MCP handles deterministic tool execution for AI agents, the CLI gives you direct terminal access to initialize projects, inspect health, generate typed SDK clients, review pending changes, and run the local review UI.

## Why a CLI?

You might wonder: if the AI agent handles everything through MCP, why do you need a CLI?

- **Bootstrapping** — `contentrain init` sets up `.contentrain/`, git hooks, and IDE rules before the agent is even connected
- **Visibility** — `contentrain status` and `contentrain doctor` give you instant project health without asking an agent
- **SDK generation** — `contentrain generate` creates the typed client your application code imports
- **Review workflow** — `contentrain diff` and `contentrain serve` let you review agent-created content in a proper UI
- **CI/CD integration** — `contentrain validate` runs in pipelines to catch schema violations before deploy

::: tip Agent + CLI = Complete Workflow
The agent creates content through MCP tools. The CLI helps you verify, review, and consume that content. They are complementary, not redundant.
:::

## Install

Run directly with `npx` (no install required):

```bash
npx contentrain init
```

Or install globally:

```bash
npm install -g contentrain
contentrain status
```

Requirements:
- Node.js 22+
- Git available in `PATH`

## Commands

| Command | Purpose |
|---------|--------|
| `contentrain init` | Initialize `.contentrain/`, git workflow, templates, and IDE rules |
| `contentrain status` | Show project overview, models, branch pressure, and validation summary |
| `contentrain doctor` | Check setup health, SDK freshness, orphan content, and branch limits |
| `contentrain validate` | Validate content against schemas, optionally create review-branch fixes |
| `contentrain generate` | Generate `.contentrain/client/` and `#contentrain` package imports |
| `contentrain diff` | Review and merge or reject pending `contentrain/*` branches |
| `contentrain serve` | Start the local review UI or the MCP stdio server |

---

### `contentrain init`

Bootstraps a Contentrain project in your repository.

```bash
contentrain init
```

This creates:
- `.contentrain/config.json` — project configuration
- `.contentrain/models/` — model schema directory
- `.contentrain/content/` — content storage directory
- IDE rule files (`CLAUDE.md`, `.cursorrules`, `.windsurfrules`)

If the directory is not a git repo, `contentrain init` runs `git init` automatically.

::: info IDE Rules
`contentrain init` installs project-level AI rules automatically. If rule files already exist, Contentrain appends its rules instead of overwriting your content.
:::

---

### `contentrain status`

Shows a comprehensive project overview.

```bash
contentrain status
```

Outputs:
- Project configuration (stack, workflow mode, locales)
- Registered models with entry counts
- Active `contentrain/*` branches and their health
- Validation summary (errors, warnings)
- Last operation context

---

### `contentrain doctor`

Runs a health check on your project setup.

```bash
contentrain doctor
```

Checks for:
- Missing or misconfigured `.contentrain/config.json`
- SDK client freshness (is the generated client stale?)
- Orphan content (entries referencing deleted models)
- Branch limit pressure (too many pending review branches)
- Missing dependencies

---

### `contentrain validate`

Validates all content against model schemas.

```bash
# Check for issues
contentrain validate

# Auto-fix structural issues and create a review branch
contentrain validate --fix
```

Validation catches:
- Missing required fields
- Type mismatches (string where integer expected)
- Invalid relation references
- Locale coverage gaps
- Canonical serialization violations

::: warning Auto-Fix Creates a Branch
When using `--fix`, the validator creates a `contentrain/*` review branch with the fixes. You still need to review and merge the changes.
:::

---

### `contentrain generate`

Generates the typed SDK client from your model definitions.

```bash
# Generate once
contentrain generate

# Watch mode (re-generates on model/content changes)
contentrain generate --watch

# Specify project root
contentrain generate --root /path/to/project
```

This reads `.contentrain/models/` and `.contentrain/content/` and produces:

```
.contentrain/client/
  index.mjs          — ESM entry
  index.cjs          — CJS entry
  index.d.ts         — Generated TypeScript types
  data/
    {model}.{locale}.mjs   — Static data modules
```

It also updates your `package.json` with `#contentrain` subpath imports:

```json
{
  "imports": {
    "#contentrain": {
      "types": "./.contentrain/client/index.d.ts",
      "import": "./.contentrain/client/index.mjs",
      "require": "./.contentrain/client/index.cjs",
      "default": "./.contentrain/client/index.mjs"
    }
  }
}
```

After generation, import the client in your app:

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

::: tip Watch Mode for Development
Run `contentrain generate --watch` alongside your framework's dev server. Add it to your `package.json` scripts:
```json
{
  "scripts": {
    "contentrain:watch": "contentrain generate --watch"
  }
}
```
:::

---

### `contentrain diff`

Review pending `contentrain/*` branches.

```bash
contentrain diff
```

Shows:
- List of pending review branches
- Changes in each branch (models added/modified, content entries changed)
- Options to merge or reject each branch

Use `contentrain status` first to see how many branches are pending.

---

### `contentrain serve`

Starts the local review UI or the MCP stdio server.

#### Web UI Mode (default)

```bash
# Default: localhost:4321
contentrain serve

# Custom host and port
contentrain serve --port 3333 --host localhost
```

The web UI provides:
- REST endpoints for status, content, validation, branches, and normalize data
- WebSocket stream for live updates
- Embedded Vue application for visual content review
- Branch management (merge, reject, inspect diffs)

#### MCP Stdio Mode

```bash
contentrain serve --stdio
```

Use stdio mode when connecting an IDE agent (Claude Code, Cursor, Windsurf) to the local project. This exposes all 13 MCP tools over the stdio transport.

::: code-group

```json [Claude Code]
{
  "mcpServers": {
    "contentrain": {
      "command": "npx",
      "args": ["contentrain", "serve", "--stdio"]
    }
  }
}
```

```json [Cursor]
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

## Typical Workflow

```bash
# 1. Initialize the project
contentrain init

# 2. Check project health
contentrain status
contentrain doctor

# 3. Let the agent create models and content via MCP...

# 4. Generate the typed SDK client
contentrain generate

# 5. Validate everything
contentrain validate

# 6. Review agent-created branches
contentrain diff

# 7. Open the local review UI
contentrain serve
```

::: tip From Local to Team
The CLI covers single-developer workflows. When you need team collaboration, visual diff review, and content CDN, [Contentrain Studio](https://studio.contentrain.io) extends everything the CLI does with a hosted governance UI.
:::

## Related Pages

- [MCP Tools](/packages/mcp) — The deterministic tool layer the CLI wraps
- [Query SDK](/packages/sdk) — The generated client that `contentrain generate` produces
- [Rules & Skills](/packages/rules) — Agent behavior policies installed by `contentrain init`
- [Contentrain Studio](https://studio.contentrain.io) — Hosted team review, chat-first agent, and CDN
