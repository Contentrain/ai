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

## Global Options

These flags are available on every command:

| Flag | Environment Variable | Description |
|------|----------------------|-------------|
| `--debug` | `CONTENTRAIN_DEBUG=1` | Enable debug logging to stderr (useful for troubleshooting) |

Example: `contentrain --debug status` or `CONTENTRAIN_DEBUG=1 contentrain status`.

## Commands

| Command | Purpose |
|---------|--------|
| `contentrain init` | Initialize `.contentrain/`, git workflow, templates, and IDE rules |
| `contentrain status` | Show project overview, models, branch pressure, and validation summary |
| `contentrain doctor` | Check setup health, SDK freshness, orphan content, and branch limits |
| `contentrain validate` | Validate content against schemas, optionally create review-branch fixes |
| `contentrain generate` | Generate `.contentrain/client/` and `#contentrain` package imports |
| `contentrain describe` | Display full model schema and sample data |
| `contentrain describe-format` | Show file format specification and storage conventions |
| `contentrain scaffold` | Apply starter templates (blog, landing, docs, SaaS, ...) |
| `contentrain diff` | Review and merge or reject pending `cr/*` branches interactively |
| `contentrain merge <branch>` | Merge one pending `cr/*` branch non-interactively |
| `contentrain setup` | Configure MCP server and AI rules for your IDE |
| `contentrain skills` | Install, update, or list AI skills and rules for your IDE |
| `contentrain serve` | Start the local review UI, the MCP stdio server, or the MCP HTTP server |
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
contentrain init              # Interactive
contentrain init --yes        # Skip prompts
contentrain init --root /path # Different project root
```

| Flag | Description |
|------|-------------|
| `--yes` | Skip prompts, use defaults |
| `--root <path>` | Project root path |

Creates `.contentrain/config.json`, `.contentrain/models/`, `.contentrain/content/`, plus IDE rules and Agent Skills. Runs `git init` if not already a repo.

---

### `contentrain status`

```bash
contentrain status
contentrain status --json       # CI-friendly JSON
contentrain status --root /path
```

Outputs config, models, active `cr/*` branches and their health, validation summary, and last operation context.

---

### `contentrain doctor`

Runs a health check on your project.

```bash
contentrain doctor
contentrain doctor --usage      # Analyze content key usage in source
contentrain doctor --json       # CI-friendly JSON; exits non-zero on failures
```

| Flag | Description |
|------|-------------|
| `--usage` | Analyze unused keys, duplicate values, locale coverage gaps |
| `--json` | Machine-readable output; non-zero exit on check failures |
| `--root <path>` | Project root path |

Checks: `.contentrain/config.json` shape, SDK client freshness (mtime comparison), orphan content, branch limits (warning at 50, blocked at 80), Node/git versions.

---

### `contentrain validate`

```bash
contentrain validate
contentrain validate --fix              # Auto-fix and create review branch
contentrain validate --interactive      # Choose fixes interactively
contentrain validate --watch            # Re-run on .contentrain/ changes (read-only)
contentrain validate --model blog-posts
contentrain validate --json             # CI-friendly JSON
```

| Flag | Description |
|------|-------------|
| `--fix` | Auto-fix and create a `cr/fix/*` review branch |
| `--interactive` | Choose which issues to fix interactively |
| `--watch` | Re-run when `.contentrain/` changes (read-only polling mode) |
| `--model <id>` | Validate one model instead of all |
| `--json` | CI-friendly JSON |

::: tip Watch mode for development
Run `contentrain validate --watch` in one terminal alongside your editing workflow. It re-runs on `.contentrain/` changes without creating branches (read-only). Rapid feedback while editing content.
:::

---

### `contentrain generate`

Generates the typed SDK client from model definitions.

```bash
contentrain generate
contentrain generate --watch  # Regen on model/content changes
contentrain generate --json   # CI-friendly JSON
```

Writes `.contentrain/client/` (ESM, CJS, types + per-model data modules) and adds `#contentrain` subpath to `package.json`.

---

### `contentrain describe <model>`

```bash
contentrain describe blog-post
contentrain describe blog-post --sample --locale en
contentrain describe blog-post --json
```

Shows full schema, field types, stats, sample data, and import snippet.

---

### `contentrain describe-format`

```bash
contentrain describe-format
contentrain describe-format --json
```

Prints the Contentrain content-format specification (directory structure, JSON formats, markdown conventions, locale strategies).

---

### `contentrain scaffold`

```bash
contentrain scaffold                     # Interactive picker
contentrain scaffold --template blog
contentrain scaffold --template saas --locales en,tr,de --no-sample
contentrain scaffold --template blog --json
```

Templates: `blog`, `landing`, `docs`, `ecommerce`, `saas`, `i18n`, `mobile`.

---

### `contentrain diff`

```bash
contentrain diff
contentrain diff --json   # Summary of pending cr/* branches for CI
```

Interactive (default) review of pending review branches. `--json` emits `{ branches: [{name, base, filesChanged, insertions, deletions, stat}] }` without entering the interactive loop.

---

### `contentrain merge <branch>`

```bash
contentrain merge cr/content/faq/1234-abcd
contentrain merge cr/content/faq/1234-abcd --yes  # Skip confirm (CI)
```

Non-interactive single-branch sibling of `contentrain diff`. Delegates to MCP's `mergeBranch` so dirty-file protections + selective sync warnings behave identically.

---

### `contentrain setup`

```bash
contentrain setup claude-code   # or: cursor, vscode, windsurf, copilot
contentrain setup --all         # Configure every detected IDE
```

Writes the correct `.mcp.json` (or equivalent) for the target IDE and installs AI rules/skills if absent. Merges into existing config without overwriting other MCP servers.

---

### `contentrain skills`

```bash
contentrain skills           # Install / refresh
contentrain skills --update  # Force update
contentrain skills --list    # Show installed status per IDE
```

Installs 15 Agent Skills + essential rules across detected IDEs (Claude Code, Cursor, Windsurf, GitHub Copilot).

---

### `contentrain serve`

Three roles: web UI, MCP stdio, MCP HTTP.

#### Web UI (default)

```bash
contentrain serve
contentrain serve --port 8080 --host 0.0.0.0
contentrain serve --demo  # Temporary demo project, no setup required
```

Serves REST endpoints (`/api/status`, `/api/content`, `/api/branches`, `/api/doctor`, `/api/describe-format`, `/api/preview/merge`, `/api/normalize/*`, `/api/capabilities`, `/api/branches/:name/sync-status`), a WebSocket stream (`meta:changed`, `file-watch:error`, `sync:warning`, `branch:*` events), and the bundled Vue UI.

#### MCP stdio

```bash
contentrain serve --stdio
```

For IDE agents. Same 17 tools, stdio transport.

#### MCP HTTP

```bash
contentrain serve --mcpHttp --authToken $(openssl rand -hex 32)
contentrain serve --mcpHttp --port 3334 --host 0.0.0.0 --authToken $TOKEN
```

| Flag | Env var | Description |
|------|---------|-------------|
| `--mcpHttp` | `CONTENTRAIN_MCP_HTTP=true` | Enable HTTP MCP at `POST /mcp` |
| `--port <n>` | `CONTENTRAIN_PORT` | Port (default 3333) |
| `--host <bind>` | `CONTENTRAIN_HOST` | Bind address (default `localhost`) |
| `--authToken <token>` | `CONTENTRAIN_AUTH_TOKEN` | Required Bearer token |

**Secure-by-default:** non-localhost binds (`0.0.0.0` or specific IPs) **hard-error** without `--authToken` / `CONTENTRAIN_AUTH_TOKEN`. This is deliberate (OWASP Secure-by-Default) — the HTTP MCP endpoint exposes full project write access.

## Studio Integration

The `studio` command group connects the CLI to [Contentrain Studio](/studio).

### Authentication

```bash
contentrain studio login
contentrain studio login --provider github
contentrain studio login --url https://studio.example.com
contentrain studio whoami
contentrain studio logout
```

Credentials stored in `~/.contentrain/credentials.json` (mode `0o600`). Use `CONTENTRAIN_STUDIO_TOKEN` for CI.

### Connecting a Repository {#connecting-a-repository}

```bash
contentrain studio connect
contentrain studio connect --workspace ws-123
contentrain studio connect --json
```

Interactive flow: workspace → GitHub App install → repo detection → `.contentrain/` scan → project creation. Defaults are cached for subsequent `studio` commands.

### Project Monitoring

```bash
contentrain studio status                 # Branches + CDN + team
contentrain studio activity --limit 10    # Recent activity feed
contentrain studio usage                  # AI messages, storage, bandwidth
```

### Branch Management

```bash
contentrain studio branches
```

List pending branches, interactively merge or reject.

### CDN Setup & Delivery

```bash
contentrain studio cdn-init               # First-time CDN setup
contentrain studio cdn-build --wait       # Trigger + wait for build
```

### Webhooks & Submissions

```bash
contentrain studio webhooks
contentrain studio submissions --form contact-form
contentrain studio submissions --form contact-form --status pending
```

Each Studio command accepts `--workspace <id>`, `--project <id>`, and `--json` for scripting.

---

## Typical Workflow

```bash
# 1. Initialize (auto-configures MCP for detected IDEs)
contentrain init

# 2. Or set up a specific IDE later
contentrain setup claude-code

# 3. Inspect project health
contentrain status
contentrain doctor

# 4. Let the agent create models and content via MCP...

# 5. Generate the typed SDK client
contentrain generate

# 6. Validate everything (optionally --watch during dev)
contentrain validate

# 7. Review agent-created branches
contentrain diff

# 8. Open the local review UI
contentrain serve
```

::: tip From Local to Team
The CLI covers single-developer workflows. When you need workspace/project management, role-based collaboration, visual diff review, media operations, and content CDN delivery, [Contentrain Studio](/studio) extends the same Git-native model with an open-core team web surface.
:::

## Related Pages

- [MCP Tools](/packages/mcp) — The deterministic tool layer the CLI wraps
- [Query SDK](/packages/sdk) — The generated client that `contentrain generate` produces
- [Rules & Skills](/packages/rules) — Agent behavior policies installed by `contentrain init`
- [Contentrain Studio](/studio) — Team workspace, review, media, and CDN operations
