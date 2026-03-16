# `contentrain`

[![npm version](https://img.shields.io/npm/v/contentrain?label=contentrain)](https://www.npmjs.com/package/contentrain)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/cli)

CLI for Contentrain.

`contentrain` is the local operations surface for a Contentrain project:

- initialize `.contentrain/` in an existing repo
- inspect project health and validation state
- generate the typed `#contentrain` SDK client
- review pending `contentrain/*` branches
- run the local review UI
- expose the MCP server over stdio for IDE agents

This package is the human-facing companion to:

- [`@contentrain/mcp`](https://github.com/contentrain/contentrain-ai/tree/main/packages/mcp) for deterministic content operations
- [`@contentrain/query`](https://github.com/contentrain/contentrain-ai/tree/main/packages/sdk/js) for generated runtime queries
- [`@contentrain/rules`](https://github.com/contentrain/contentrain-ai/tree/main/packages/rules) and [`@contentrain/skills`](https://github.com/contentrain/contentrain-ai/tree/main/packages/skills) for agent guidance

## 🚀 Install

Use `npx`:

```bash
npx contentrain init
```

Or install globally:

```bash
pnpm add -g contentrain
contentrain status
```

Requirements:

- Node.js 22+
- Git available in `PATH`

## 🧰 Commands

| Command | Purpose |
| --- | --- |
| `contentrain init` | Initialize `.contentrain/`, git workflow, templates, and IDE rules |
| `contentrain status` | Show project overview, models, branch pressure, and validation summary |
| `contentrain doctor` | Check setup health, SDK freshness, orphan content, and branch limits |
| `contentrain validate` | Validate content against schemas, optionally create review-branch fixes |
| `contentrain generate` | Generate `.contentrain/client/` and `#contentrain` package imports |
| `contentrain diff` | Review and merge or reject pending `contentrain/*` branches |
| `contentrain serve` | Start the local review UI or the MCP stdio server |

## 🔄 Typical Flow

Initialize a project:

```bash
contentrain init
```

Check project state:

```bash
contentrain status
contentrain doctor
```

Generate the typed SDK client:

```bash
contentrain generate
```

Validate content and create review-branch fixes when possible:

```bash
contentrain validate
contentrain validate --fix
```

Review pending changes:

```bash
contentrain diff
```

Open the local UI:

```bash
contentrain serve
```

## 🖥 `serve` Modes

`contentrain serve` has two roles.

Start the local review UI:

```bash
contentrain serve
contentrain serve --port 3333 --host localhost
```

This serves:

- REST endpoints for status, content, validation, branches, and normalize data
- a WebSocket stream for live updates
- the embedded Vue `serve-ui` app bundled with the CLI

Start the MCP server for IDE integration:

```bash
contentrain serve --stdio
```

Use stdio mode when connecting Claude Code, Cursor, Windsurf, or another MCP client to the local project.

## 📦 `generate` and `#contentrain`

`contentrain generate` writes a typed client to `.contentrain/client/` and injects `#contentrain` imports into your `package.json`.

After generation:

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

Run with watch mode during local model/content work:

```bash
contentrain generate --watch
```

## 👀 Review Workflow

Most write operations create `contentrain/*` branches in review mode.

Use:

```bash
contentrain status
contentrain diff
```

to understand:

- how many active review branches exist
- whether branch health is blocking new writes
- what changed before merging or deleting a branch

## 🤖 IDE Rules

`contentrain init` installs project-level AI rules automatically:

- `CLAUDE.md` for Claude Code or generic fallback
- `.cursorrules` for Cursor
- `.windsurfrules` for Windsurf

If the target file already exists, Contentrain appends its rules instead of overwriting unrelated content where possible.

## 🛠 Development

From the monorepo root:

```bash
pnpm --filter contentrain test -- --run
pnpm --filter contentrain exec tsc --noEmit
pnpm --filter contentrain build
```
