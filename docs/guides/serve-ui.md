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
| `--stdio` | disabled | MCP stdio transport for IDE integration (no web UI) |

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

**Agent prompt hint:**

> "Create a new collection model for team members with name, role, and avatar fields"

### Content (`/content`)

Browse and inspect content entries:

- Filter by model, locale, and status
- View entry details with all field values
- See metadata (status, source, timestamps)
- Locale switcher to compare translations side by side

**Agent prompt hint:**

> "Add a new blog post about our latest feature release"

::: tip
The content page is read-only. To edit content, copy the agent prompt from the UI and paste it into your AI agent.
:::

### Validate (`/validate`)

Inspect validation results:

- Schema compliance errors
- i18n completeness warnings (missing keys, untranslated values)
- Duplicate entry detection
- Vocabulary alignment checks

After reviewing issues, ask the agent to fix them:

> "Fix all validation errors in the blog-post model"

The agent calls `contentrain_validate` to get the error list, then `contentrain_content_save` to fix each issue.

**Agent prompt hint:**

> "Validate all content and fix any errors"

### Branches (`/branches`)

Manage content branches:

- List all `contentrain/*` branches
- See diff summary for each branch
- **Merge** approved branches
- **Delete** rejected branches
- View commit history per branch

This is where you approve or reject agent-created content:

1. Agent creates content on a branch via MCP tools
2. You review the changes in the Branches page
3. Click **Merge** to accept or **Delete** to reject
4. The agent detects your decision and proceeds accordingly

**Agent prompt hint:**

> "Submit the current changes for review"

### Normalize (`/normalize`)

The normalize page is active when a normalize plan exists (`.contentrain/normalize-plan.json`):

- **Extraction review panel:** Candidates grouped by model with field mappings
- **Source trace panel:** Click any extraction to see its original file and line number
- **Patch preview panel:** See the exact source file changes that will happen in Phase 2
- **Approve & Apply** button: Executes the extraction
- **Reject** button: Deletes the plan

This page appears only during the [normalize flow](./normalize). When no plan exists, it shows a prompt to start normalization:

> "Scan my project and extract hardcoded strings into Contentrain"

## WebSocket Real-time Updates

Serve UI uses WebSocket connections for real-time updates:

- **File watcher:** When `.contentrain/` files change (from agent operations), the UI updates automatically
- **Context updates:** After every MCP write operation, `context.json` is updated and the UI reflects the latest state
- **Branch events:** New branches, merges, and deletions appear instantly
- **Normalize plan:** Plan file creation and status changes trigger UI refresh

You do not need to manually refresh the page. Changes made by the agent appear in real time.

## Approval Flow

The typical workflow between agent and developer:

### Step 1. Agent creates content

You ask the agent to create or update content:

> "Create 5 testimonials for the landing page"

The agent calls `contentrain_content_save`, which creates entries on a branch and commits to Git.

### Step 2. Developer reviews in UI

The agent tells you to review:

> "I've created 5 testimonials on branch `contentrain/content/testimonials/...`. Review them at `http://localhost:3333/branches`"

In the UI, you see the branch with a diff of all new entries. You can inspect each testimonial's content, check for quality, and verify the data.

### Step 3. Approve or reject

- **Approve:** Click **Merge** — the branch merges into the `contentrain` branch, baseBranch is advanced, content is live
- **Reject:** Click **Delete** — the branch is removed, content is discarded

### Step 4. Agent detects the decision

The agent reads the filesystem state:

- Branch merged → content is on main, agent confirms success
- Branch deleted → agent asks what to change and iterates

::: warning
For normalize operations, the workflow always uses review mode. Even if the project is configured for auto-merge, normalize branches require explicit approval.
:::

## Agent Prompt Hints in UI

Every page in Serve UI includes context-aware agent prompts. These are copyable text blocks that you paste directly into your AI agent (Claude Code, Cursor, Copilot, etc.).

Examples by page:

| Page | Prompt |
|---|---|
| Dashboard | "Show me project status and pending changes" |
| Models | "Create a new singleton model for the pricing section" |
| Content | "Update the hero section title to ..." |
| Validate | "Fix all validation errors" |
| Branches | "Submit current changes for review" |
| Normalize | "Scan my project and extract hardcoded strings" |

This design keeps the UI as a monitoring surface while the agent handles all actions.

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
Normalize operations always use review mode regardless of this setting. Only standard content operations (create, update, delete) respect the auto-merge setting.
:::

## IDE Integration (stdio mode)

For IDE-embedded use (VS Code, Cursor), serve can run in stdio mode:

```bash
npx contentrain serve --stdio
```

This starts the MCP server with stdio transport instead of the web UI. The IDE connects directly to the MCP tools without a browser.

Both modes (web UI and stdio) use the same MCP tools underneath. The difference is the transport layer:

- **Web UI:** HTTP + WebSocket, human reviews in browser
- **stdio:** Direct MCP protocol, IDE handles the interaction

## Troubleshooting

### Port already in use

```bash
# Find and kill the existing process
lsof -ti:3333 | xargs kill

# Or use a different port
npx contentrain serve --port 4444
```

### UI not updating

If real-time updates stop:

1. Check that the serve process is still running
2. Refresh the browser page to re-establish the WebSocket connection
3. Verify that `.contentrain/` files are being written (check `context.json` timestamp)

### Content not appearing

If content created by the agent does not appear:

1. Check if the content is on a feature branch (not yet merged into the `contentrain` branch)
2. Navigate to the Branches page to see pending branches
3. Merge the branch to make content visible on the Content page

## Beyond Local: Contentrain Studio

`contentrain serve` is designed for single-developer, local workflows. When your team grows, [Contentrain Studio](/studio) extends this with:

- **GitHub-connected review** — PRs created from agent branches, reviewable in a web UI
- **Team roles** — invite editors and reviewers with scoped permissions
- **Chat-first agent** — talk to your agent through a web interface with full MCP access
- **Content CDN** — publish approved content for mobile and non-web platforms
- **Audit trail** — track who created, reviewed, and approved every content change

Connect your local project to Studio with [`contentrain studio connect`](/packages/cli#connecting-a-repository) — it detects your repo, installs the GitHub App, and creates the project in one interactive flow.
