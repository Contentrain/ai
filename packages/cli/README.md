# `contentrain`

[![npm version](https://img.shields.io/npm/v/contentrain?label=contentrain)](https://www.npmjs.com/package/contentrain)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/cli)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/packages/cli)

CLI for Contentrain.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [CLI docs](https://ai.contentrain.io/packages/cli)
- [Getting started](https://ai.contentrain.io/getting-started)

`contentrain` is the local operations surface for a Contentrain project:

- initialize `.contentrain/` in an existing repo
- inspect project health and validation state
- generate the typed `#contentrain` SDK client
- review pending `cr/*` branches
- run the local review UI
- expose the MCP server over stdio (IDE agents) or HTTP (Studio, CI, remote drivers)

This package is the human-facing companion to:

- [`@contentrain/mcp`](https://github.com/Contentrain/ai/tree/main/packages/mcp) for deterministic content operations
- [`@contentrain/query`](https://github.com/Contentrain/ai/tree/main/packages/sdk/js) for generated runtime queries
- [`@contentrain/rules`](https://github.com/Contentrain/ai/tree/main/packages/rules) and [`@contentrain/skills`](https://github.com/Contentrain/ai/tree/main/packages/skills) for agent guidance

## Install

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

## Global Flags

| Flag | Env var | Description |
| --- | --- | --- |
| `--debug` | `CONTENTRAIN_DEBUG=1` | Verbose debug logging to stderr (works on every subcommand) |

Example: `contentrain --debug status` or `CONTENTRAIN_DEBUG=1 contentrain validate`.

## Commands

| Command | Purpose |
| --- | --- |
| `contentrain init` | Initialize `.contentrain/`, git workflow, templates, and IDE rules |
| `contentrain status` | Show project overview, models, branch pressure, and validation summary |
| `contentrain doctor` | Check setup health, SDK freshness, orphan content, and branch limits |
| `contentrain validate` | Validate content against schemas, optionally create review-branch fixes |
| `contentrain generate` | Generate `.contentrain/client/` and `#contentrain` package imports |
| `contentrain diff` | Review and merge or reject pending `cr/*` branches interactively |
| `contentrain merge <branch>` | Merge one pending `cr/*` branch non-interactively (CI/agents) |
| `contentrain describe <model>` | Inspect a model's schema, stats, and import snippet |
| `contentrain describe-format` | Print the Contentrain content-format specification |
| `contentrain scaffold --template` | Apply a template (`blog`, `landing`, `docs`, `ecommerce`, `saas`, `i18n`, `mobile`) |
| `contentrain setup <agent\|--all>` | Configure MCP server + AI rules for IDE (Claude Code, Cursor, Windsurf, VSCode, Copilot) |
| `contentrain skills` | Install, update, or list Contentrain AI skills and IDE rules |
| `contentrain serve` | Start the local review UI (REST + WS), MCP stdio server (`--stdio`), or MCP HTTP server (`--mcpHttp`) |
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

## Flag Matrix

Every read command supports `--json` for CI use; write commands surface `--watch` or `--yes` where they apply:

| Command | Notable flags |
| --- | --- |
| `status` | `--json` |
| `doctor` | `--json`, `--usage` — non-zero exit on failure |
| `validate` | `--json`, `--fix`, `--interactive`, `--watch`, `--model <id>` |
| `generate` | `--json`, `--watch` |
| `diff` | `--json` |
| `merge` | `--yes` (skip confirm) |
| `describe` | `--sample`, `--locale`, `--json` |
| `scaffold` | `--template <id>`, `--locales <csv>`, `--no-sample`, `--json` |
| `serve` | `--port`, `--host`, `--open`, `--demo`, `--stdio`, `--mcpHttp`, `--authToken` |

## Typical Flow

Initialize a project:

```bash
contentrain init
```

Check project state (with optional JSON for CI):

```bash
contentrain status
contentrain status --json

contentrain doctor
contentrain doctor --json
contentrain doctor --usage  # Analyze content key usage
```

Generate the typed SDK client:

```bash
contentrain generate
contentrain generate --watch    # Watch for changes
contentrain generate --json     # CI-friendly JSON output
```

Validate content and create review-branch fixes:

```bash
contentrain validate
contentrain validate --fix
contentrain validate --watch    # Live validation in dev mode
contentrain validate --json     # CI output
```

Review pending changes:

```bash
contentrain diff
contentrain diff --json  # CI integration
```

Open the local UI:

```bash
contentrain serve
contentrain serve --demo  # Start with a temporary demo project
```

Enable detailed logging:

```bash
contentrain --debug status
CONTENTRAIN_DEBUG=1 contentrain validate  # Via environment variable
```

## `serve` Modes

`contentrain serve` has three roles.

### Local review UI (default)

```bash
contentrain serve
contentrain serve --port 3333 --host localhost
contentrain serve --demo  # Temporary project (no setup needed)
```

Serves REST endpoints for status / content / validation / branches / normalize / doctor / describe-format / preview-merge, a WebSocket stream for live updates, and the embedded Vue `serve-ui` app bundled with the CLI.

WebSocket event types: `connected`, `config:changed`, `context:changed`, `meta:changed`, `model:changed`, `content:changed`, `branch:created`, `branch:merged`, `branch:rejected`, `branch:merge-conflict`, `sync:warning`, `validation:updated`, `normalize:plan-updated`, `file-watch:error`.

### MCP stdio (IDE agents)

```bash
contentrain serve --stdio
```

Use stdio mode when connecting Claude Code, Cursor, Windsurf, or another MCP client to the local project.

### MCP HTTP (Studio, CI, remote drivers)

```bash
contentrain serve --mcpHttp --authToken $(openssl rand -hex 32)
contentrain serve --mcpHttp --port 3333 --host 0.0.0.0 --authToken $TOKEN
```

Spins up a [Streamable HTTP MCP](https://modelcontextprotocol.io) server at `POST /mcp`. Bearer auth is **required** on non-localhost binds — the CLI hard-errors when no `--authToken` is set for an exposed interface (OWASP Secure-by-Default). Use HTTP mode when:

- Studio's agent drives MCP remotely
- a CI runner needs deterministic content operations
- an agent on another machine orchestrates content changes

HTTP sessions use the same `LocalProvider` backing as stdio — the transport differs, the behaviour does not. Remote git-host providers (`GitHubProvider`, `GitLabProvider`) are constructed by embedders who instantiate the MCP server programmatically; see the MCP package docs for that flow.

## `generate` and `#contentrain`

`contentrain generate` writes a typed client to `.contentrain/client/` and injects `#contentrain` imports into your `package.json`.

After generation:

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

Run with watch mode during local model/content work:

```bash
contentrain generate --watch
```

## IDE Setup and AI Skills

Configure your IDE to use Contentrain's MCP server and AI agent rules:

```bash
contentrain setup claude-code
contentrain setup cursor
contentrain setup vscode
contentrain setup --all  # Configure all detected IDEs
```

Install or update AI agent skills and IDE rules:

```bash
contentrain skills
contentrain skills --update  # Force update
contentrain skills --list    # List installed skills
```

This installs:
- Contentrain Agent Skills (task guidance for Claude, Cursor, etc.)
- IDE rules files (CLAUDE.md, .cursorrules, .windsurfrules)

## Review Workflow

Most write operations create feature branches from the dedicated `contentrain` branch. In review mode, these branches are pushed to remote for team review. In auto-merge mode, they are merged into the `contentrain` branch and baseBranch is advanced via update-ref.

Use:

```bash
contentrain status
contentrain diff
```

to understand:

- how many active `cr/*` review branches exist on the `contentrain` branch
- whether branch health is blocking new writes (warning at 50, blocked at 80)
- what changed before merging or deleting a branch

## Studio Integration

The `studio` command group connects the CLI to [Contentrain Studio](https://studio.contentrain.io) for enterprise workflows.

Authenticate and connect:

```bash
contentrain studio login
contentrain studio whoami
contentrain studio connect
```

The `connect` command links your local repository to a Studio project. It detects the git remote, verifies GitHub App installation, scans for `.contentrain/` configuration, and creates the project — all in one interactive flow.

```bash
contentrain studio connect --workspace ws-123
```

Set up CDN for content delivery:

```bash
contentrain studio cdn-init
contentrain studio cdn-build --wait
```

Monitor project activity and usage:

```bash
contentrain studio status
contentrain studio activity --limit 10
contentrain studio usage
```

Manage branches, webhooks, and form submissions:

```bash
contentrain studio branches
contentrain studio webhooks
contentrain studio submissions --form contact-form
```

Credentials are stored securely in `~/.contentrain/credentials.json` with `0o600` permissions. Use `CONTENTRAIN_STUDIO_TOKEN` environment variable for CI/CD.

## Documentation

Full documentation at **[ai.contentrain.io/packages/cli](https://ai.contentrain.io/packages/cli)**.

## Development

From the monorepo root:

```bash
pnpm --filter contentrain test -- --run
pnpm --filter contentrain exec tsc --noEmit
pnpm --filter contentrain build
```

## License

MIT
