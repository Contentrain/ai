---
title: Serve UI
description: Use the local review UI for monitoring content, approving changes, reviewing normalize plans, and managing branches
order: 4
slug: serve-ui
---

# Serve UI

Contentrain Serve is a local web UI that acts as the bridge between your AI agent and your review process. It provides monitoring, approval, and prompt surfaces for all content operations.

## What Serve UI Is

Serve UI is a **monitoring + approval surface**, not an editor. The philosophy:

- **Monitoring:** Browse models, content, validation results, history, and branches — read-only
- **Approval:** Approve or reject normalize plans, merge or delete branches — human decisions
- **Agent prompts:** Every page shows copyable prompts that you paste into your AI agent to trigger actions

::: info
All mutations (create, edit, delete, scan, normalize, fix) are **agent-driven via MCP tools**. The UI never triggers these directly. You review what the agent produced and approve or reject it.
:::

## Starting Serve

From your project root (where `.contentrain/` lives):

```bash
npx contentrain serve
```

The server starts on `http://localhost:3333` by default.

### Options

| Flag | Default | Description |
|---|---|---|
| `--port` | `3333` | Port number |
| `--host` | `localhost` | Host address |
| `--open=false` | `true` | Prevent auto-opening browser |
| `--demo` | disabled | Temporary demo project (no setup required) |
| `--stdio` | disabled | MCP stdio transport for IDE integration (no web UI) |
| `--mcpHttp` | disabled | MCP HTTP transport at `POST /mcp` (secure-by-default Bearer auth) |
| `--authToken` | — | Bearer token required on non-localhost HTTP binds |

### Check if already running

Before starting a new instance:

```bash
lsof -ti:3333
```

If a process is running, serve is already up — navigate directly to the URL.

## Pages Overview

### Dashboard (`/`)

The landing page shows a project overview:

- Total models and entries
- Content status breakdown (draft, published, in review)
- Recent agent activity from `context.json`
- Pending branches waiting for review
- Quick links to each section

**Agent prompt hint shown in UI:**

> "Show me the project status and any pending changes"

### Models (`/models`)

Browse all model definitions:

- Model list with kind badges (collection, singleton, dictionary, document)
- Field schema details per model
- Content path and locale strategy
- Entry count per locale

### Content (`/content`)

Browse and inspect content entries:

- Filter by model, locale, and status
- View entry details with all field values
- See metadata (status, source, timestamps)
- Locale switcher to compare translations side by side

::: tip
The content page is read-only. To edit content, copy the agent prompt from the UI and paste it into your AI agent.
:::

### Validate (`/validate`)

Inspect validation results:

- Schema compliance errors
- i18n completeness warnings (missing keys, untranslated values)
- Duplicate entry detection
- Vocabulary alignment checks

### Branches (`/branches`)

Manage content branches:

- List all `cr/*` branches
- See diff summary for each branch
- **Merge** approved branches
- **Delete** rejected branches
- View commit history per branch
- Click a branch to see a detailed preview with merge conflict detection

### Branch Detail (`/branches/:name`)

When you click a branch in the list, you see a detailed **merge preview** fetched from `/api/preview/merge`:

- Fast-forward status (can the branch merge cleanly?)
- Already-merged check (is this branch already in the content-tracking branch?)
- Conflict detection (best-effort list of conflicting paths via `git merge-tree`)
- Diff summary and file-by-file changes
- Sync-warning panel surfacing any files the last selective sync skipped

This preview is generated without running the actual merge — a safe way to answer "what happens if I approve this?" before committing to the action.

### Doctor (`/doctor`)

Project health dashboard wrapping the `contentrain_doctor` MCP tool:

- Environment checks (Node ≥22, git available)
- `.contentrain/` structure validation
- Model definition parsing
- Orphan content detection
- Branch pressure (warning at 50 `cr/*`, blocked at 80)
- SDK client freshness (comparing mtimes)
- Optional **usage analysis** toggle: unused keys, duplicate dictionary values, missing locale keys

Each check renders with severity (error / warning / info). The "Run" button re-fetches `/api/doctor?usage=...`.

**Agent prompt hint:**

> "Run a full project health check and fix any errors"

### Format Reference (`/format`)

A read-only reference of how Contentrain stores content — renders the output of the `contentrain_describe_format` tool via `/api/describe-format`:

- Models schema (JSON structure of `.contentrain/models/`)
- Content layout (directory and file structure)
- Metadata organization (SEO, entry-level metadata)
- Vocabulary format
- Locale strategies

Useful as a living spec for developers and integrators who need the physical file format without reading docs.

### Normalize (`/normalize`)

The normalize page is active when a normalize plan exists (`.contentrain/normalize-plan.json`):

- **Extraction review panel:** Candidates grouped by model with field mappings
- **Source trace panel:** Click any extraction to see its original file and line number
- **Patch preview panel:** See the exact source file changes that will happen in Phase 2
- **Approve & Apply** button: Executes the extraction
- **Reject** button: Deletes the plan

This page appears only during the [normalize flow](/guides/normalize). When no plan exists, it shows a prompt to start normalization.

## WebSocket Real-time Updates

Serve UI uses WebSocket connections for real-time updates. You do not need to manually refresh the page.

### WebSocket Events

The serve server broadcasts the following events over the WebSocket connection:

| Event | Emitted when | Payload |
|---|---|---|
| `connected` | Client connects | (none) |
| `config:changed` | `.contentrain/config.json` changes | (none) |
| `context:changed` | `.contentrain/context.json` changes | `{ context }` |
| `model:changed` | A model definition is created/updated | `{ modelId }` |
| `content:changed` | Content entries are created/updated | `{ modelId, locale }` |
| `meta:changed` | SEO or model metadata is written | `{ modelId, entryId?, locale }` |
| `normalize:plan-updated` | Normalize plan is created/updated/deleted | (none) |
| `validation:updated` | Validation results change | (none) |
| `branch:created` | A new `cr/*` branch is created | `{ branch }` |
| `branch:merged` | A branch is merged into `contentrain` | `{ branch }` |
| `branch:rejected` | A branch is deleted | `{ branch }` |
| `branch:merge-conflict` | Branch merge fails | `{ branch, message }` |
| `sync:warning` | Merge succeeds but skips dirty working-tree files | `{ branch, skippedCount }` |
| `file-watch:error` | chokidar file watcher encounters an error | `{ message, timestamp }` |

## HTTP API Surface

The serve backend exposes REST endpoints at `http://localhost:3333/api/*`. Key routes:

| Route | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Wraps `contentrain_status` |
| `/api/capabilities` | GET | Provider + transport + branch health in one call |
| `/api/doctor?usage=...` | GET | Wraps `contentrain_doctor` (optional usage analysis) |
| `/api/describe-format` | GET | Wraps `contentrain_describe_format` |
| `/api/describe/:modelId` | GET | Wraps `contentrain_describe` |
| `/api/content/:modelId` | GET | List content entries |
| `/api/content/:modelId/:entryId` | GET | Single entry read |
| `/api/content/:modelId/:entryId/fix` | POST | Quick fix (content save) |
| `/api/validate?fix=true` | GET | Wraps `contentrain_validate` |
| `/api/branches` | GET | List `cr/*` branches |
| `/api/branches/diff?name=cr/...` | GET | Branch diff against `contentrain` |
| `/api/branches/approve` | POST | Approve & merge a branch |
| `/api/branches/reject` | POST | Delete a branch |
| `/api/branches/:name/sync-status` | GET | Cached sync warnings from last merge |
| `/api/preview/merge?branch=cr/...` | GET | Side-effect-free merge preview (FF / conflicts / already-merged) |
| `/api/history` | GET | Recent contentrain-related commits |
| `/api/context` | GET | `.contentrain/context.json` |
| `/api/normalize/*` | various | Scan / plan / approve / reject / apply / approve-branch |

Every write route validates its body through Zod schemas (`parseOrThrow`) before reaching the MCP tool layer.

## Approval Flow

The typical workflow between agent and developer:

1. **Agent creates content** via `contentrain_content_save` (or similar write tool), landing on a `cr/*` branch.
2. **Developer reviews in UI** at `/branches/:name` — sees the merge preview, per-file diff, sync warnings if any.
3. **Approve or Reject** — click **Merge** or **Delete**.
4. **Agent detects the decision** by re-reading the filesystem/context state.

::: warning
For normalize operations, the workflow always uses review mode. Even if the project is configured for auto-merge, normalize branches require explicit approval.
:::

## Workflow Configuration

The approval flow behavior is controlled by the workflow setting in `.contentrain/config.json`:

```json
{
  "workflow": "review"
}
```

| Mode | Behavior |
|---|---|
| `review` | All content changes create branches for review |
| `auto-merge` | Content changes merge into `contentrain` branch, baseBranch is advanced via update-ref |

::: info
Normalize operations always use review mode regardless of this setting.
:::

## IDE Integration (stdio mode)

For IDE-embedded use (VS Code, Cursor, Claude Code), serve can run in stdio mode:

```bash
npx contentrain serve --stdio
```

This starts the MCP server with stdio transport instead of the web UI.

## HTTP MCP Transport

For Studio, CI, or remote agents, serve can expose MCP over Streamable HTTP:

```bash
npx contentrain serve --mcpHttp --authToken $(openssl rand -hex 32)
```

**Secure-by-default:** binding to a non-localhost address (`0.0.0.0` / specific IPs) without `--authToken` (or `CONTENTRAIN_AUTH_TOKEN` env var) is a hard error — the HTTP MCP endpoint exposes full project write access.

See the [HTTP Transport guide](/guides/http-transport) for deployment patterns.

## Troubleshooting

### Port already in use

```bash
lsof -ti:3333 | xargs kill
# or
npx contentrain serve --port 4444
```

### UI not updating

1. Check that the serve process is still running
2. Look for a `file-watch:error` banner at the top of the UI — this indicates the chokidar watcher stopped (e.g. OS inotify limit). Restart `contentrain serve` to reattach.
3. Verify that `.contentrain/` files are being written (check `context.json` timestamp)

### Content not appearing

If content created by the agent does not appear:

1. Check if the content is on a feature branch (not yet merged into the `contentrain` branch)
2. Navigate to the Branches page to see pending branches
3. Click the branch for a detailed merge preview
4. Merge the branch to make content visible on the Content page

### Merge conflicts when approving

When clicking **Merge** on a branch, the UI performs a real merge using the MCP `mergeBranch` helper. Conflicts can occur when:

1. The branch and `contentrain` branch have diverged
2. You've made manual edits to `.contentrain/` files outside the agent workflow

The UI surfaces the conflict message. Resolve it manually or ask the agent to create a fresh branch from the current `contentrain` state.

## Beyond Local: Contentrain Studio

`contentrain serve` is designed for single-developer, local workflows. When your team grows, [Contentrain Studio](/studio) extends this with:

- **GitHub-connected review** — PRs created from agent branches, reviewable in a web UI
- **Team roles** — invite editors and reviewers with scoped permissions
- **Chat-first agent** — talk to your agent through a web interface with full MCP access
- **Content CDN** — publish approved content for mobile and non-web platforms
- **Audit trail** — track who created, reviewed, and approved every content change

Connect your local project to Studio with [`contentrain studio connect`](/packages/cli#connecting-a-repository) — it detects your repo, installs the GitHub App, and creates the project in one interactive flow.
