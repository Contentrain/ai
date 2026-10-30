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
| `contentrain import <source>` | Import a WordPress site (WXR export file or REST URL) into a `.contentrain` store |
| `contentrain status` | Show project overview, models, branch pressure, and validation summary |
| `contentrain doctor` | Check setup health, SDK freshness, orphan content, and branch limits |
| `contentrain validate` | Validate content against schemas, optionally create review-branch fixes |
| `contentrain generate` | Generate `.contentrain/client/` and `#contentrain` package imports |
| `contentrain diff` | Review and merge or reject pending `cr/*` branches interactively |
| `contentrain merge <branch>` | Merge one pending `cr/*` branch non-interactively (CI/agents); deletes its remote copy |
| `contentrain reconcile` | Content-aware three-way merge of a diverged contentrain ↔ base pair (dry-run plan, interactive decisions) |
| `contentrain prune` | Delete merged `cr/*` branches locally and on the remote (backlog drain) |
| `contentrain describe <model>` | Inspect a model's schema, stats, and import snippet |
| `contentrain delta <delta.json> --dry-run` | Plan a WordPress source delta against the store: placement, field changes, conflicts, tombstones, redirects (plan only) |
| `contentrain describe-format` | Print the Contentrain content-format specification |
| `contentrain scaffold --template` | Apply a template (`blog`, `landing`, `docs`, `ecommerce`, `saas`, `i18n`, `mobile`) |
| `contentrain setup <agent\|--all>` | Configure MCP server + AI rules for IDE (Claude Code, Cursor, Windsurf, VSCode, Copilot, Codex) |
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
| `init` | `--yes`, `--locales <csv>` (default `en`), `--domains <csv>` (default `marketing,blog,system`) |
| `import` | `--out <dir>`, `--auth <user>`, `--force`, `--include-emails`, `--json` |
| `status` | `--json` |
| `doctor` | `--json`, `--usage` — non-zero exit on failure; includes a remote `cr/*` branch check |
| `validate` | `--json`, `--fix`, `--interactive`, `--watch`, `--model <id>` |
| `generate` | `--json`, `--watch`, `--published`, `--at <ISO timestamp>`, `--require-status`, `--mediaBaseUrl <url>` |
| `diff` | `--json` |
| `merge` | `--yes` (skip confirm) |
| `reconcile` | `--yes` (execute a clean plan without prompting), `--json` (dry-run plan) |
| `prune` | `--dry-run`, `--yes`, `--json` (mutates only with `--yes`) |
| `delta` | `--dry-run` (required; there is no apply mode), `--incoming <dir>`, `--store <dir>`, `--taxonomy <csv>`, `--json` |
| `describe` | `--sample`, `--locale`, `--json` |
| `describe-format` | `--json` |
| `scaffold` | `--template <id>`, `--locales <csv>`, `--json` |
| `serve` | `--port` (default 3333), `--host` (default localhost), `--no-open`, `--demo`, `--stdio`, `--mcpHttp`, `--authToken` |

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

Spins up a [Streamable HTTP MCP](https://modelcontextprotocol.io) server at `POST /mcp`. Pass `--authToken` (or `CONTENTRAIN_AUTH_TOKEN`) whenever the server is reachable beyond localhost: HTTP mode starts without a token on any host, and only warns when it binds `0.0.0.0` without one. (The review UI, by contrast, refuses to start on a non-localhost host without a token.) Use HTTP mode when:

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
- IDE rules files: `.claude/rules/`, `.cursor/rules/`, `.windsurf/rules/`, `.github/copilot-instructions.md`, and `AGENTS.md` for Codex

## Review Workflow

Most write operations create feature branches from the dedicated `contentrain` branch. In review mode, these branches are pushed to remote for team review. In auto-merge mode, they are merged into the `contentrain` branch and baseBranch is advanced via update-ref.

When baseBranch has diverged (commits `contentrain` lacks — the state a dual-domain migration PR leaves behind), a write is a **partial success**: it lands on `contentrain` and reports `base_advance: "blocked_diverged"` instead of failing. `contentrain status` shows the relation in both directions; `contentrain reconcile` merges the branches content-aware (a two-parent merge commit) so the fast-forward advance works again.

Merging a review branch (via `contentrain merge`, `contentrain diff`, the Serve UI, or the MCP tools) also deletes its remote copy, so merged branches never pile up as phantom pending reviews. The same applies to rejected/deleted drafts. This is best-effort — an offline or permission failure only produces a warning — and can be disabled with `remoteBranchCleanup: false` in `config.json`. In local mode (`"git": { "push": false }` in `config.json`, or `CONTENTRAIN_NO_PUSH=1`) nothing is pushed or deleted on the remote, and `merge`/`prune` print that they skipped it. Note that deleting a pushed branch closes any open PR/MR on it.

Use:

```bash
contentrain status
contentrain diff
contentrain prune --dry-run   # preview merged local/remote leftovers, then run with --yes
```

to understand:

- how many active `cr/*` review branches exist on the `contentrain` branch (and on the remote — `contentrain doctor`)
- whether branch health is blocking new writes (warning at 50, blocked at 80)
- what changed before merging or deleting a branch

## Studio Integration

The `studio` command group connects the CLI to [Contentrain Studio](https://studio.contentrain.io), the team operating surface for governed content.

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

## `contentrain import`

Import a WordPress site into a `.contentrain` content store:

```bash
contentrain import export.xml            # WXR export file (highest offline fidelity)
contentrain import https://site.example  # public REST
contentrain import https://site.example --auth editor  # authenticated REST: prompts for the Application Password
CONTENTRAIN_WP_APP_PASSWORD=… contentrain import https://site.example --auth editor
CONTENTRAIN_WP_AUTH=editor:… contentrain import https://site.example
contentrain import export.xml --include-emails  # also write author/commenter e-mails
```

Writes the canonical store plus `import-report.json`, `entry-source-map.json` (WP id → entry address), and — when the source has comments — `comments-export.json` (`contentrain-comments@1`, ready for a comments-service intake). An existing `.contentrain` is only overwritten with `--force`. Powered by `@contentrain/wp-import`.

**Personal data.** The store holds author names and logins, and commenters' names, website URLs and comment text. A WXR export also carries author and commenter e-mail addresses; they are left out of the store and of `comments-export.json` unless you pass `--include-emails`. Commenter IPs, user agents and avatar URLs (including Akismet's comment meta) are never written. The e-mails stay out by default because the store usually ends up in git (sometimes a public repo). The REST path never sees them.

**Credentials.** The Application Password is read from `CONTENTRAIN_WP_APP_PASSWORD` (with `--auth <user>`), from `CONTENTRAIN_WP_AUTH=user:password`, or from a hidden prompt. `--auth user:password` still works but is deprecated and warns: argv lands in shell history and process listings.

### `contentrain delta`

Plan what a later WordPress change means for a store that was already delivered:

```bash
contentrain delta bridge-delta.json --incoming ./next-export --dry-run         # report
contentrain delta bridge-delta.json --incoming ./next-export --dry-run --json  # the planned SourceDeltaPlan
```

The command reads the store (`--store`, default: the current directory) and its `entry-source-map.json`, from the store root or from `bridge/`. It reads the new export the same way. For each record it reports where it lives in the store, which fields differ, and which addresses moved (each becomes a 301). Trashed and purged deletions are kept apart. A record that was also edited in the repository is a conflict, and it is not overwritten. There is no apply mode: without `--dry-run` the command refuses, because applying a plan goes through review. Taxonomies come from the bridge's `inventory.json` when it is beside the export; name others with `--taxonomy`.

### Public static builds

`contentrain generate --published` excludes drafts and content outside its
`publish_at`/`expire_at` window. `--at 2026-10-01T12:00:00Z` fixes the public build
clock for reproducible tests and implies `--published`. `--require-status` also
excludes entries with no status in meta, for projects where every entry has one
(a WordPress import); it implies `--published`. Without these flags,
editorial generation keeps its existing behavior. Watch mode observes metadata
edits; a scheduled static publication still needs a build/deploy trigger.

## Documentation

Full documentation at **[ai.contentrain.io/packages/cli](https://ai.contentrain.io/packages/cli)**.

## Development

From the monorepo root:

```bash
pnpm --filter contentrain test -- --run
pnpm --filter contentrain exec tsc --noEmit
pnpm --filter contentrain build
```

## Part of the Contentrain ecosystem

Contentrain is a content governance ecosystem for teams and AI agents. This CLI is one of the [open-source tools](https://github.com/Contentrain/ai) ([docs](https://ai.contentrain.io)). [Studio](https://github.com/Contentrain/studio) adds team review and roles on the same repository, [Migrate](https://migrate.contentrain.io) moves WordPress sites to Astro, and [Bridge](https://github.com/Contentrain/wordpress-bridge) is a free WordPress plugin that exports a site as a Contentrain store.

## License

MIT
