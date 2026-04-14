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
| `contentrain studio connect` | Connect a repository to a Studio project |
| `contentrain studio login` | Authenticate with Contentrain Studio |
| `contentrain studio logout` | Log out from Studio |
| `contentrain studio whoami` | Show current authentication status |
| `contentrain studio status` | Show project overview from Studio |
| `contentrain studio activity` | Show recent activity feed |
| `contentrain studio usage` | Show workspace usage metrics |
| `contentrain studio branches` | Manage remote content branches |
| `contentrain studio cdn-init` | Set up CDN for content delivery |
| `contentrain studio cdn-build` | Trigger a CDN rebuild |
| `contentrain studio webhooks` | Manage webhooks |
| `contentrain studio submissions` | Manage form submissions |

---

### `contentrain init`

Bootstraps a Contentrain project in your repository.

```bash
# Interactive setup
contentrain init

# Skip prompts, use defaults
contentrain init --yes

# Specify project root
contentrain init --root /path/to/project
```

| Flag | Description |
|------|-------------|
| `--yes` | Skip prompts, use defaults |
| `--root <path>` | Project root path |

This creates:
- `.contentrain/config.json` — project configuration
- `.contentrain/models/` — model schema directory
- `.contentrain/content/` — content storage directory
- IDE rules and Agent Skills (Claude Code, Cursor, Windsurf, GitHub Copilot)

If the directory is not a git repo, `contentrain init` runs `git init` automatically.

::: info IDE Rules & Skills
`contentrain init` installs a compact essential guardrails file (~86 lines, always-loaded) plus Agent Skills directories (on-demand) for detected IDEs. Old granular rule files from previous versions are automatically cleaned up. GitHub Copilot support is included via `.github/copilot-instructions.md`.
:::

---

### `contentrain status`

Shows a comprehensive project overview.

```bash
# Human-readable output
contentrain status

# JSON output for CI pipelines
contentrain status --json

# Specify project root
contentrain status --root /path/to/project
```

| Flag | Description |
|------|-------------|
| `--json` | Output results as JSON (for CI/CD) |
| `--root <path>` | Project root path |

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

# Specify project root
contentrain doctor --root /path/to/project
```

| Flag | Description |
|------|-------------|
| `--root <path>` | Project root path |

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

# Interactive mode — choose which issues to fix
contentrain validate --interactive

# Validate a single model
contentrain validate --model blog-posts

# JSON output for CI pipelines
contentrain validate --json
```

| Flag | Description |
|------|-------------|
| `--fix` | Auto-fix structural issues and create a review branch |
| `--interactive` | Choose which issues to fix interactively |
| `--model <id>` | Validate a single model instead of all |
| `--json` | Output results as JSON (for CI/CD) |
| `--root <path>` | Project root path |

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

# Specify project root
contentrain diff --root /path/to/project
```

| Flag | Description |
|------|-------------|
| `--root <path>` | Project root path |

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
# Default: localhost:3333
contentrain serve

# Custom host and port
contentrain serve --port 8080 --host 0.0.0.0

# Open browser automatically
contentrain serve --open
```

| Flag | Description |
|------|-------------|
| `--port <number>` | HTTP server port (default: `3333`) |
| `--host <address>` | Bind address (default: `localhost`) |
| `--open` | Open browser automatically |
| `--root <path>` | Project root path |

The web UI provides:
- REST endpoints for status, content, validation, branches, and normalize data
- WebSocket stream for live updates
- Embedded Vue application for visual content review
- Branch management (merge, reject, inspect diffs)

#### MCP Stdio Mode

```bash
contentrain serve --stdio
```

| Flag | Description |
|------|-------------|
| `--stdio` | Use stdio MCP transport (for IDE integration) |

Use stdio mode when connecting an IDE agent (Claude Code, Cursor, Windsurf) to the local project. This exposes all 15 MCP tools over the stdio transport.

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

## Studio Integration

The `studio` command group connects the CLI to [Contentrain Studio](/studio) — the enterprise web surface for team content management.

### Authentication

```bash
# Sign in via GitHub or Google OAuth
contentrain studio login

# Select provider directly
contentrain studio login --provider github

# Connect to a self-hosted Studio instance
contentrain studio login --url https://studio.example.com

# Check who you're logged in as
contentrain studio whoami

# Sign out and clear stored credentials
contentrain studio logout
```

| Flag | Description |
|------|-------------|
| `--provider <github\|google>` | Skip provider selection prompt |
| `--url <url>` | Studio instance URL (default: `https://studio.contentrain.io`) |

Credentials are stored in `~/.contentrain/credentials.json` with `0o600` permissions — never inside the project directory.

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `CONTENTRAIN_STUDIO_TOKEN` | Skip interactive login in CI/CD |
| `CONTENTRAIN_STUDIO_URL` | Override Studio instance URL |

### Connecting a Repository

```bash
# Interactive flow: workspace → GitHub App → repo → scan → create project
contentrain studio connect

# Skip workspace selection
contentrain studio connect --workspace ws-123

# JSON output for scripting
contentrain studio connect --json
```

| Flag | Description |
|------|-------------|
| `--workspace <id>` | Skip workspace selection prompt |
| `--json` | Output result as JSON (workspace, project, repository, scan) |

The `connect` command links your local repository to a Studio project in one interactive flow:

1. **Workspace** — select an existing workspace (auto-selects if only one)
2. **GitHub App** — checks if the Contentrain GitHub App is installed; if not, opens the browser for installation
3. **Repository** — detects the current git remote and matches it against accessible repos
4. **Scan** — checks the repository for `.contentrain/` configuration, reports found models and locales
5. **Create** — prompts for a project name and creates the project in Studio

After a successful connection, workspace and project IDs are saved as defaults so subsequent `studio` commands skip interactive selection.

::: tip Run `contentrain init` First
The connect flow works best when `.contentrain/` is already initialized and pushed to the repository. The scan step confirms your setup, but you can also connect first and initialize later.
:::

### Project Monitoring

#### `contentrain studio status`

```bash
contentrain studio status
contentrain studio status --workspace ws-123 --project proj-456 --json
```

| Flag | Description |
|------|-------------|
| `--workspace <id>` | Workspace ID (skip selection prompt) |
| `--project <id>` | Project ID (skip selection prompt) |
| `--json` | Output as JSON |

Shows project overview: branches, CDN status, and team.

#### `contentrain studio activity`

```bash
contentrain studio activity
contentrain studio activity --limit 10 --json
```

| Flag | Description |
|------|-------------|
| `--limit <number>` | Number of entries (default: `20`) |
| `--workspace <id>` | Workspace ID |
| `--project <id>` | Project ID |
| `--json` | Output as JSON |

Shows recent activity feed.

#### `contentrain studio usage`

```bash
contentrain studio usage
contentrain studio usage --workspace ws-123 --json
```

| Flag | Description |
|------|-------------|
| `--workspace <id>` | Workspace ID |
| `--project <id>` | Project ID (for context resolution) |
| `--json` | Output as JSON |

Shows workspace usage metrics (AI messages, storage, bandwidth).

### Branch Management

#### `contentrain studio branches`

```bash
contentrain studio branches
contentrain studio branches --workspace ws-123 --project proj-456 --json
```

| Flag | Description |
|------|-------------|
| `--workspace <id>` | Workspace ID |
| `--project <id>` | Project ID |
| `--json` | Output as JSON |

List pending branches, interactively merge or reject.

### CDN Setup & Delivery

#### `contentrain studio cdn-init`

```bash
contentrain studio cdn-init
contentrain studio cdn-init --workspace ws-123 --project proj-456
```

| Flag | Description |
|------|-------------|
| `--workspace <id>` | Workspace ID |
| `--project <id>` | Project ID |

Interactive setup: create API key, trigger first build, get SDK snippet.

#### `contentrain studio cdn-build`

```bash
contentrain studio cdn-build
contentrain studio cdn-build --wait --json
```

| Flag | Description |
|------|-------------|
| `--wait` | Wait for build to complete |
| `--workspace <id>` | Workspace ID |
| `--project <id>` | Project ID |
| `--json` | Output as JSON |

Trigger a CDN rebuild after content changes.

### Webhooks

#### `contentrain studio webhooks`

```bash
contentrain studio webhooks
contentrain studio webhooks --workspace ws-123 --project proj-456 --json
```

| Flag | Description |
|------|-------------|
| `--workspace <id>` | Workspace ID |
| `--project <id>` | Project ID |
| `--json` | Output as JSON |

Manage webhooks: create, delete, test, view deliveries.

### Form Submissions

#### `contentrain studio submissions`

```bash
contentrain studio submissions --form contact-form
contentrain studio submissions --form contact-form --status pending --json
```

| Flag | Description |
|------|-------------|
| `--form <id>` | Form model ID |
| `--status <status>` | Filter by status (`pending`, `approved`, `rejected`) |
| `--workspace <id>` | Workspace ID |
| `--project <id>` | Project ID |
| `--json` | Output as JSON |

Manage form submissions: list, approve, reject.

::: tip Studio + CLI = Full Developer Experience
Studio handles team collaboration, media management, AI conversations, and CDN delivery in the browser. The CLI gives developers terminal access to the same operations — authenticate once, then manage branches, trigger builds, and monitor usage without leaving the editor.
:::

---

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
The CLI covers single-developer workflows. When you need workspace/project management, role-based collaboration, visual diff review, media operations, and content CDN delivery, [Contentrain Studio](/studio) extends the same Git-native model with an open-core team web surface that can be self-hosted or run as a managed Pro/Enterprise offering.
:::

## Related Pages

- [MCP Tools](/packages/mcp) — The deterministic tool layer the CLI wraps
- [Query SDK](/packages/sdk) — The generated client that `contentrain generate` produces
- [Rules & Skills](/packages/rules) — Agent behavior policies installed by `contentrain init`
- [Contentrain Studio](/studio) — Team workspace, review, media, and CDN operations
