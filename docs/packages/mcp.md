---
title: MCP Tools
description: Complete reference for @contentrain/mcp — the provider-agnostic MCP engine powering AI content governance with 24 deterministic tools over stdio or HTTP
order: 1
slug: mcp
---

# MCP Tools

[![npm version](https://img.shields.io/npm/v/@contentrain/mcp)](https://www.npmjs.com/package/@contentrain/mcp) [![npm downloads](https://img.shields.io/npm/dm/@contentrain/mcp)](https://www.npmjs.com/package/@contentrain/mcp)

Contentrain's MCP (Model Context Protocol) package is the deterministic execution layer that sits between your AI agent and your filesystem. While the agent makes intelligent content decisions, `@contentrain/mcp` enforces consistent file operations, canonical serialization, and git-backed safety.

## Why MCP?

Traditional content management relies on APIs, dashboards, and manual workflows. Contentrain inverts this:

- **Agent produces** content decisions (what to write, where, in what structure)
- **MCP applies** deterministic filesystem and git operations (how to write it safely)
- **Humans review** and merge through git workflows
- **The system guarantees** schema, locale, and serialization consistency

This separation means your AI agent never directly touches files. Every write goes through MCP's validation, canonical serialization, and git transaction pipeline.

::: tip Why not just let the agent write files?
Agents are non-deterministic. The same prompt can produce different file formats, inconsistent JSON ordering, or broken git state. MCP is the deterministic guardrail that makes AI-generated content safe for production.
:::

## Install

```bash
pnpm add @contentrain/mcp
```

Requirements:
- Node.js 22+
- Git available on the machine

Optional parser support for higher-quality source scanning:
- `@vue/compiler-sfc` — Vue SFC parsing
- `@astrojs/compiler` — Astro component parsing
- `svelte` — Svelte component parsing

## Discovery

`@contentrain/mcp` is published for both package-based and registry-based MCP discovery:

- **npm package:** [`@contentrain/mcp`](https://www.npmjs.com/package/@contentrain/mcp)
- **MCP Registry name:** `io.github.Contentrain/contentrain`
- **Local server binary:** `contentrain-mcp`
- **CLI stdio entrypoint:** `contentrain serve --stdio`
- **Hosted remote endpoint:** Contentrain Studio MCP Cloud at `https://studio.contentrain.io/api/mcp/v1/{projectId}/mcp`

Use the local stdio server when the agent should work against a checkout on your machine. Use Studio MCP Cloud when an external agent should operate a connected Studio project through a project-scoped API key.

## Tool Catalog

The MCP server exposes **24 tools** — 19 core + 5 media — organized by function. Each tool includes [MCP annotations](https://spec.modelcontextprotocol.io/specification/2025-03-26/server/tools/#annotations) (`readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint: false` everywhere except `contentrain_media_ingest`, which fetches a caller-supplied URL server-side) so clients can distinguish safe reads from writes and destructive operations.

::: info Capability-aware listing
`tools/list` is filtered per session: tools whose requirements (local project root, provider capabilities) cannot be met are not registered at all. A local stdio server lists the 19 core tools; a remote-provider session lists the remote-safe subset plus — on media-capable providers like Studio MCP Cloud — the 5 `contentrain_media_*` tools. Core remote-safe subset — `status`, `describe`, `describe_format`, `model_save`, `model_delete`, `content_save`, `content_delete`, `content_list`, `validate`. See `TOOL_REQUIREMENTS` in `@contentrain/mcp/tools/availability`.
:::

| Tool | Title | Read-only | Destructive |
|------|-------|-----------|-------------|
| `contentrain_status` | Project Status | Yes | — |
| `contentrain_describe` | Describe Model | Yes | — |
| `contentrain_describe_format` | Describe Format | Yes | — |
| `contentrain_doctor` | Project Health Report | Yes | — |
| `contentrain_init` | Initialize Project | — | — |
| `contentrain_scaffold` | Scaffold Template | — | — |
| `contentrain_model_save` | Save Model | — | — |
| `contentrain_model_delete` | Delete Model | — | **Yes** |
| `contentrain_content_save` | Save Content | — | — |
| `contentrain_content_delete` | Delete Content | — | **Yes** |
| `contentrain_content_list` | List Content | Yes | — |
| `contentrain_validate` | Validate Project | — | — |
| `contentrain_submit` | Submit Branches | — | — |
| `contentrain_merge` | Merge Branch | — | — |
| `contentrain_branch_list` | List Branches | Yes | — |
| `contentrain_branch_delete` | Delete Branch | — | **Yes** |
| `contentrain_scan` | Scan Source Code | Yes | — |
| `contentrain_apply` | Apply Normalize | — | — |
| `contentrain_bulk` | Bulk Operations | — | — |
| `contentrain_media_list` | List Media Assets | Yes | — |
| `contentrain_media_get` | Get Media Asset | Yes | — |
| `contentrain_media_ingest` | Ingest Media From URL | — | — |
| `contentrain_media_update` | Update Media Metadata | — | — |
| `contentrain_media_delete` | Delete Media Asset | — | **Yes** |

### Detailed Reference

### Read Tools (Safe, No Side Effects)

| Tool | Purpose | Description |
|------|---------|-------------|
| `contentrain_status` | Project overview | Config, models, branch health, context, validation summary |
| `contentrain_describe` | Model deep-dive | Full schema, sample data, field types for any model |
| `contentrain_describe_format` | Format reference | File structure, JSON formats, markdown conventions, locale strategies |
| `contentrain_doctor` | Health diagnostics | Setup validation, SDK freshness, orphan content, local branch limits, remote `cr/*` count, unused keys, missing translations |
| `contentrain_content_list` | Read content | List and filter content entries with optional relation resolution |

### Write Tools (Git-Backed, Branch-Isolated)

| Tool | Purpose | Description |
|------|---------|-------------|
| `contentrain_init` | Bootstrap project | Creates `.contentrain/` structure, config, and git setup |
| `contentrain_scaffold` | Apply templates | Blog, docs, landing page, or SaaS starter templates |
| `contentrain_model_save` | Define schemas | Create or update model definitions with field types and constraints |
| `contentrain_model_delete` | Remove models | Delete a model definition and its content |
| `contentrain_content_save` | Write content | Save entries for any model kind (collection, singleton, dictionary, document) |
| `contentrain_content_delete` | Remove content | Delete specific content entries |
| `contentrain_validate` | Check & fix | Validate content against schemas, optionally auto-fix structural issues |
| `contentrain_submit` | Push branches | Push `cr/*` review branches to remote, then lazily prune merged local + remote leftovers |
| `contentrain_merge` | Merge branches | Merge a review-mode branch into contentrain locally (by exact branch or model; no external platform needed); deletes the branch's remote copy |
| `contentrain_branch_list` | Inspect branches | List pending `cr/*` branches with merge status and branch-health pressure (`remote: true` adds a remote view + remote-only leftovers) |
| `contentrain_branch_delete` | Clean up branches | Delete a stale/failed `cr/*` branch locally and on the remote (the contentrain branch is protected; supports remote-only deletion) |

### Normalize Tools (Scan + Apply)

| Tool | Purpose | Description |
|------|---------|-------------|
| `contentrain_scan` | Find hardcoded strings | Graph-based component scan with candidate detection |
| `contentrain_apply` | Extract or reuse | Two-phase normalize: extract content or patch source files |
| `contentrain_bulk` | Batch operations | Bulk locale copy, status updates, and deletes |

### Field constraints

`contentrain_content_save` **validates before it writes**. A `severity: error` issue
on any entry in the call means nothing is committed — no branch, nothing to clean up.
Fix the values and call again. Warnings pass and come back in the response.

The split is deliberate:

- **Errors** are definitional. A `slug` that does not match `SLUG_PATTERN` is not a
  slug; an unparseable `date` is not a date; `3.7` is not an `integer`.
- **Warnings** are heuristics. `email`, `url`, `color` and `phone` patterns are
  approximations, and a legitimate value can sit outside one.

Only the entries in the call are fatal. A pre-existing bad entry elsewhere in the
model is reported but does not block your save.

Array items are validated by the same rules as a scalar of that type, so
`items: { type: 'string', max: 50 }` means what it looks like it means.

::: warning What MCP does not enforce
`maxSize` is the one constraint MCP accepts but cannot check — it stores a path and
never sees the file. Your media provider enforces it at ingest, and `model_save`
returns a `schema_warnings` entry saying so. `accept` **is** checked, but against the
file extension only, which is why it warns rather than errors.
:::

`model_save` rejects a constraint declared where it cannot apply — `options` on a
non-select, `items` on a non-array, `accept` on a non-media field, `unique` on a
singleton, `min > max`, an uncompilable `pattern` — instead of storing it and doing
nothing. Unknown keys are rejected too, so a typo'd `requird: true` is an error
rather than a silent no-op.

### Publish status

Entry status lives in `.contentrain/meta/`, not in content, and it decides CDN
delivery: a collection entry is served only when its status is `published`.

- **`contentrain_content_save` never changes status.** Editing a field is not a
  publish decision — an existing entry keeps its `status`, `approved_by`, and
  `version`. Only a brand-new entry starts at `draft`.
- **`contentrain_bulk update_status` is the only way to publish.** Pass
  `entry_ids` for collections; omit them for singletons and dictionaries, which
  have one meta record per locale. Pass `locale` to scope the change, or every
  supported locale is rewritten.
- **`contentrain_validate` flags publish-state drift** — drafts sitting beside
  published entries in one collection — as a notice. It never auto-fixes it:
  publishing is a content decision, and MCP does not make those.

::: tip Non-i18n models
A model with `i18n: false` keeps all content in one `data.json`, so it has
exactly one meta record — at the **default locale**, never `data.json`.

- **A locale is meaningless here, so it is rejected, not guessed.**
  `contentrain_content_delete` refuses a `locale`-scoped delete on an
  `i18n: false` model: the locale would otherwise map onto `data.json` and the
  default-locale meta, deleting the shared content and the wrong meta while a
  stray per-locale meta stayed behind. Omit `locale` to delete the entry.
- **`contentrain_validate` warns about stray per-locale meta** left by older
  versions, and **`fix: true` cleans it up deterministically**: when the
  default-locale meta is authoritative it prunes the extras (no status is
  merged, so a `published` record is never downgraded); when only a stray
  exists it is migrated to the default path so the record is preserved. Several
  strays with no default is ambiguous — it is left for you to resolve by hand.
:::

### Media Tools (Provider Media Facet)

A deterministic passthrough to the provider's optional media stack (`RepoProvider.media`) — registered **only when the provider exposes one** (e.g. Studio MCP Cloud). The flow: list assets → pick a `media/...` path → reference it via `contentrain_content_save` (normalized to absolute delivery URLs when `mediaBaseUrl` is set).

| Tool | Purpose | Description |
|------|---------|-------------|
| `contentrain_media_list` | Discover assets | Search, tag filter, cursor pagination — returns storage paths + delivery URLs |
| `contentrain_media_get` | Inspect one asset | Path, URL, mime, size, alt, tags, provider metadata |
| `contentrain_media_ingest` | Add from URL | Provider fetches the URL server-side under its own SSRF/MIME/size policy (MCP never fetches; the only `openWorldHint: true` tool) |
| `contentrain_media_update` | Edit metadata | Alt text, tags, filename — never touches the binary |
| `contentrain_media_delete` | Remove asset | Destructive; content references are NOT rewritten |

## Key Principles

### 1. Deterministic Infrastructure

MCP is infrastructure, not intelligence. It does not decide what content to write — the agent does. MCP guarantees:

- **Canonical JSON** — sorted keys, 2-space indent, trailing newline
- **Consistent file paths** — locale strategy determines where files live
- **Atomic git transactions** — every write is committed to a branch
- **Schema enforcement** — content is validated against model definitions

### 2. Dry-Run First

Every write operation supports `dry_run: true`. The pattern is always:

1. Run with `dry_run: true` to preview changes
2. Review the output
3. Run with `dry_run: false` to commit

::: warning Never Skip Preview
Always call write tools with `dry_run: true` first. This is not optional — it prevents accidental schema changes, content overwrites, and branch pollution.
:::

### 3. Git-Native Workflow

All write operations create or update `cr/*` branches:

- Content changes go to isolated branches (`cr/{scope}/{target}[/{locale}]/{timestamp}-{suffix}`)
- Humans review via `contentrain diff` or the serve UI
- Approved changes merge into the `contentrain` branch, baseBranch is advanced via update-ref
- Merging (or deleting) a branch also removes its copy on the remote, so merged branches don't pile up as phantom pending reviews — best-effort, opt out with `remoteBranchCleanup: false` in `config.json`. Drain an existing backlog with `contentrain prune`
- Merged-branch detection survives base-history rewrites (ancestry check with a patch-id fallback)
- Branch health is tracked and surfaced via `contentrain_status` (warning at 50, blocked at 80 active branches); `contentrain_doctor` adds a remote `cr/*` count
- Legacy `contentrain/*` branches are auto-migrated on first init

### 4. Local-First by Default, Remote Providers Opt-In

The default shape — stdio transport + `LocalProvider` — operates entirely on the local filesystem. No GitHub API, no cloud service, no external dependency.

Remote providers (`GitHubProvider` via `@octokit/rest`, `GitLabProvider` via `@gitbeaker/rest`) are **optional peer dependencies**. They are installed only when Studio, CI, or a remote agent needs to drive MCP over an HTTP transport against a hosted git repo. A session that uses `LocalProvider` never loads these SDKs.

That means:

- Default install works offline and needs no API keys
- Optional remote backends ship on the same tool contract — see [Providers and transports](/guides/providers) for the full capability matrix
- Normalize, scan, and apply always need a `LocalProvider` — they return a `capability_required` error on remote providers

### 5. Capability Gates

Every tool declares the capabilities it needs. Tools that require `astScan`, `sourceRead`, `sourceWrite`, or `localWorktree` reject on providers that do not expose them with a uniform error:

```json
{
  "error": "contentrain_scan requires local filesystem access.",
  "capability_required": "astScan",
  "hint": "This tool is unavailable when MCP is driven by a remote provider. Use a LocalProvider or the stdio transport."
}
```

Agent drivers treat `capability_required` as a retry signal. See [Providers & Transports](/guides/providers) for the full capability matrix.

## Transports

- **stdio** — `contentrain serve --stdio` or `npx contentrain-mcp`. IDE agents (Claude Code, Cursor, Windsurf) connect over stdin/stdout.
- **HTTP** — `contentrain serve --mcpHttp --authToken $TOKEN` or the programmatic `startHttpMcpServer({...})` / `startHttpMcpServerWith({ provider })` exports. Streamable HTTP at `POST /mcp` with secure-by-default Bearer auth. See the [HTTP Transport guide](/guides/http-transport).

Both transports serve the same tool surface and the same JSON response shapes.

## Providers

`@contentrain/mcp` ships three `RepoProvider` implementations behind a single contract:

- **`LocalProvider`** — simple-git + temporary worktree on your disk
- **`GitHubProvider`** — Octokit over the Git Data + Repos APIs (no clone)
- **`GitLabProvider`** — gitbeaker over the GitLab REST API (no clone; supports self-hosted)

Bitbucket is on the roadmap. See [Providers & Transports](/guides/providers) for the capability matrix and [RepoProvider Reference](/reference/providers) for the interface definitions.

## Studio Bridge

`@contentrain/mcp` is the local execution layer for the ecosystem. It is where agents do deterministic work such as init, schema changes, validation, and normalize.

When a project moves from solo or IDE-led work into team review and delivery, [Contentrain Studio](/studio) becomes the authenticated web surface on top of the same `.contentrain/` contract:

- MCP keeps local writes deterministic and git-safe
- Studio adds team roles, review UI, media, forms, APIs, and CDN delivery
- both surfaces should describe the same models, locales, and branch semantics

Use the [Ecosystem Map](/ecosystem) when you need the full package-to-product relationship, or jump to the Studio docs for the team-facing workflow:

- [Studio Overview](/studio)
- [Studio AI Chat](https://docs.contentrain.io/guide/ai-chat)
- [Studio Branches & Review](https://docs.contentrain.io/guide/branches-and-review)

## Usage Examples

### Check Project Status

Ask your agent: *"What's the current state of my Contentrain project?"* — triggers `contentrain_status`. Returns config, models list, branch health, pending changes, validation state.

### Run Health Checks

Ask your agent: *"Is my Contentrain setup healthy?"* — triggers `contentrain_doctor`. Returns structured checks (env, structure, models, orphans, branches, SDK freshness). With `usage: true`, also analyzes unused keys, duplicates, missing translations.

### Create a Model

```ts
// Agent calls contentrain_model_save with dry_run: true first
{
  "id": "blog-post",
  "name": "Blog Posts",
  "kind": "collection",
  "domain": "content",
  "i18n": true,
  "fields": {
    "title": { "type": "string", "required": true },
    "excerpt": { "type": "text" },
    "author": { "type": "relation", "relation": "team-members" },
    "published": { "type": "boolean" }
  }
}
```

Ask your agent: *"Create a blog post model with title, excerpt, author relation, and published flag"*

### Save Content

```ts
// Agent calls contentrain_content_save
{
  "model": "blog-post",
  "entries": [{
    "locale": "en",
    "data": {
      "title": "Getting Started with Contentrain",
      "excerpt": "Learn how to set up AI-powered content management",
      "published": true
    }
  }]
}
```

Ask your agent: *"Add a new blog post about getting started"*

::: tip Media in cloud mode
For `image`/`video`/`file` fields (and `media/...` references in markdown bodies), pass either the media-library storage path (`media/...`) or a URL. When the server runs in cloud mode with a delivery base (Studio's MCP Cloud supplies one per project), `contentrain_content_save` normalizes those references to absolute public delivery URLs on save, so committed content renders anywhere with no SDK. In local mode the relative path is kept verbatim, and external URLs always pass through untouched.
:::

### Normalize Flow (Scan + Extract + Reuse)

```ts
// Phase 1: Scan for hardcoded strings
// Agent calls contentrain_scan → gets candidates

// Phase 2: Extract content
// Agent calls contentrain_apply with mode: "extract"
// Creates models, writes content entries, tracks sources (cr/normalize/extract/*)

// Phase 3: Reuse in source
// Agent calls contentrain_apply with mode: "reuse"
// Patches source files with i18n function calls (cr/normalize/reuse/*)
```

Ask your agent: *"Scan my landing page for hardcoded strings and extract them"*

## Agent Configuration

The fastest way to connect your IDE agent:

```bash
npx contentrain setup claude-code   # or: cursor, vscode, windsurf, copilot
```

This auto-creates the correct MCP config file and installs AI rules/skills.

<details>
<summary>Manual configuration (all IDEs use the same JSON)</summary>

```json
{
  "mcpServers": {
    "contentrain": {
      "command": "npx",
      "args": ["contentrain", "serve", "--stdio"]
    }
  }
}
```

| IDE | Config file |
|-----|-------------|
| Claude Code | `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` |
| Windsurf | `.windsurf/mcp.json` |

</details>

Once connected, the agent has access to the full MCP tool surface and can manage your content through natural language.

### OpenAI Codex

Codex uses `~/.codex/config.toml` or a trusted project-scoped `.codex/config.toml`.

```bash
codex mcp add contentrain -- npx -y contentrain serve --stdio
```

Equivalent `config.toml`:

```toml
[mcp_servers.contentrain]
command = "npx"
args = ["-y", "contentrain", "serve", "--stdio"]
```

For Studio MCP Cloud, configure a Streamable HTTP server with the project endpoint and Bearer token:

```toml
[mcp_servers.contentrain]
url = "https://studio.contentrain.io/api/mcp/v1/{projectId}/mcp"
http_headers = { Authorization = "Bearer <mcp-cloud-key>" }
```

### Claude Desktop

Claude Desktop reads `claude_desktop_config.json`. For a local checkout:

```json
{
  "mcpServers": {
    "contentrain": {
      "command": "npx",
      "args": ["-y", "contentrain", "serve", "--stdio"]
    }
  }
}
```

For Studio MCP Cloud:

```json
{
  "mcpServers": {
    "contentrain": {
      "type": "http",
      "url": "https://studio.contentrain.io/api/mcp/v1/{projectId}/mcp",
      "headers": {
        "Authorization": "Bearer <mcp-cloud-key>"
      }
    }
  }
}
```

### Claude Code

Claude Code can use the project `.mcp.json` generated by `contentrain setup claude-code`, or add the hosted endpoint directly:

```bash
claude mcp add --transport http contentrain \
  https://studio.contentrain.io/api/mcp/v1/{projectId}/mcp \
  --header "Authorization: Bearer <mcp-cloud-key>"
```

## Trust Model

| Trust Level | Tools | Risk | Notes |
|-------------|-------|------|-------|
| **HIGH** (read-only) | `status`, `describe`, `describe_format`, `doctor`, `content_list` | None | Safe to call anytime, no side effects |
| **MEDIUM** (git-isolated writes) | `model_save`, `content_save`, `content_delete`, `model_delete`, `validate`, `scaffold`, `bulk` | Low | Changes isolated to `cr/*` branches, reviewable |
| **LOW** (source modification) | `scan`, `apply` | Medium | Normalize touches source files — always use dry_run first |
| **MEDIUM** (remote push) | `submit`, `merge` | Medium | Pushes branches to remote or merges — requires network access and review |

::: danger Source Modifications
The `contentrain_apply` tool with `mode: "reuse"` modifies your source code files. Always run with `dry_run: true` first, review the patches carefully, and use the review workflow before merging.
:::

## Typical Agent Workflow

```
1. contentrain_status          → understand project state
2. contentrain_doctor          → validate setup health
3. contentrain_init            → bootstrap if needed
4. contentrain_describe_format → understand storage contract
5. contentrain_model_save      → define content schemas
6. contentrain_content_save    → write content entries
7. contentrain_validate        → check everything is valid
8. contentrain_submit          → push for review
```

## Core Exports

For advanced integrations, the package exports low-level modules:

```ts
import { createServer } from '@contentrain/mcp/server'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = createServer(process.cwd())
const transport = new StdioServerTransport()
await server.connect(transport)
```

Available subpath exports:

- `@contentrain/mcp/server` — MCP server factory and stdio setup
- `@contentrain/mcp/server/http` — HTTP transport server factory
- `@contentrain/mcp/core/config` — Config manager
- `@contentrain/mcp/core/context` — Context JSON manager
- `@contentrain/mcp/core/model-manager` — Model CRUD
- `@contentrain/mcp/core/content-manager` — Content CRUD
- `@contentrain/mcp/core/validator` — Validation engine
- `@contentrain/mcp/core/scanner` — Source code scanner
- `@contentrain/mcp/core/graph-builder` — Component graph
- `@contentrain/mcp/core/apply-manager` — Normalize apply
- `@contentrain/mcp/core/doctor` — Health check engine
- `@contentrain/mcp/core/contracts` — RepoProvider interface types
- `@contentrain/mcp/core/ops` — Git operation utilities
- `@contentrain/mcp/core/overlay-reader` — Overlay file reading
- `@contentrain/mcp/core/scan-config` — Scan configuration
- `@contentrain/mcp/git/transaction` — Git transaction flow
- `@contentrain/mcp/git/branch-lifecycle` — Branch health tracking
- `@contentrain/mcp/templates` — Scaffold templates
- `@contentrain/mcp/tools/annotations` — Tool metadata (TOOL_NAMES, TOOL_ANNOTATIONS)
- `@contentrain/mcp/util/detect` — Framework detection
- `@contentrain/mcp/util/fs` — File system utilities
- `@contentrain/mcp/providers/local` — LocalProvider implementation
- `@contentrain/mcp/providers/github` — GitHubProvider implementation
- `@contentrain/mcp/providers/gitlab` — GitLabProvider implementation

## Related Pages

- [CLI](/packages/cli) — Human-facing companion for local operations
- [Query SDK](/packages/sdk) — Generated runtime client for consuming content
- [Rules & Skills](/packages/rules) — Agent behavior policies and workflow playbooks
- [Contentrain Studio](/studio) — Hosted workspace, review, chat-first operations, and content CDN
