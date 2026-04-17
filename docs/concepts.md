---
title: Core Concepts
description: "Understand the architecture: models, content kinds, domains, locales, and the agent-driven workflow"
order: 2
category: getting-started
slug: concepts
---

# Core Concepts

## The Big Idea

**Governance, not generation.**

Contentrain is not an AI content generator — there are dozens of those. Contentrain is the infrastructure that governs what happens _after_ AI generates content: validation, structure, review, approval, and delivery.

Most content tools ask you to learn their system — their dashboard, their API, their markup syntax. Contentrain inverts this: **your AI agent already understands your codebase**, so let it manage your content. Contentrain provides the deterministic infrastructure (MCP tools, validation, Git transactions) while the agent provides the intelligence (what to extract, how to structure, where to replace).

> Agent generates. Human approves. System standardizes.

The result is a content pipeline with full auditability:

```
Agent generates → MCP validates → Human reviews → Git commits → Content delivered
```

Every step is a git diff. Nothing reaches production without your approval.

## The Agent-Driven Content Model

Contentrain AI inverts the traditional CMS workflow:

| Traditional CMS | Contentrain AI |
|---|---|
| Human opens dashboard | Human talks to AI agent |
| Human creates schema manually | Agent creates models via MCP |
| Human types content in forms | Agent writes content to Git |
| Content stored in database | Content stored as files in `.contentrain/` |
| API calls to read content | Plain JSON files — read from any language, optional typed SDK |
| Deploys need API availability | Static files — works offline, zero runtime deps, any platform |

## Three Layers

### 1. MCP (Infrastructure)

17 tools that AI agents call to manage content:

- **Read:** `contentrain_status`, `contentrain_describe`, `contentrain_describe_format`, `contentrain_doctor`, `contentrain_content_list`
- **Project setup:** `contentrain_init`, `contentrain_scaffold`
- **Content and schema writes:** `contentrain_model_save`, `contentrain_model_delete`, `contentrain_content_save`, `contentrain_content_delete`
- **Normalize:** `contentrain_scan`, `contentrain_apply`
- **Workflow and operations:** `contentrain_validate`, `contentrain_submit`, `contentrain_merge`, `contentrain_bulk`

MCP is **deterministic infrastructure** — it doesn't make content decisions. The agent decides what to create; MCP executes it.

MCP runs over two transports (stdio for IDE agents, HTTP for Studio / CI / remote drivers) and three provider backends: **Local** (simple-git + worktree), **GitHub** (Octokit over the Git Data API), and **GitLab** (gitbeaker over the REST API). The tool surface is identical across all three; some tools require `LocalProvider` — see [Providers and transports](/guides/providers) for the capability matrix.

### 2. Agent (Intelligence)

The AI agent (Claude, GPT, etc.) is the intelligence layer:

- Understands your codebase structure
- Evaluates which strings are user-facing content
- Chooses the right model kind for each content group
- Determines framework-specific replacement patterns
- Manages the review workflow with the developer

### 3. Serve UI (Review Surface)

A local web UI for developers to:

- **Monitor:** browse models, content, validation, history
- **Approve:** review and merge agent-created branches
- **Prompt:** copy pre-built prompts to paste into their agent

The UI never triggers mutations directly — all actions go through the agent.

## Model Kinds

Contentrain supports four content model kinds:

### Collection

Multiple entries with the same field schema. Each entry has an auto-generated ID.

```json
// .contentrain/content/marketing/faq/en.json
{
  "abc123": { "question": "What is Contentrain?", "answer": "..." },
  "def456": { "question": "How does it work?", "answer": "..." }
}
```

**Use for:** blog posts, FAQ items, team members, testimonials, pricing plans.

### Singleton

A single entry per locale with structured fields.

```json
// .contentrain/content/marketing/hero/en.json
{ "title": "Build Faster", "subtitle": "With AI", "cta_text": "Get Started" }
```

**Use for:** hero sections, site settings, navigation config, footer content.

### Dictionary

Flat key-value pairs — all values are strings. No field schema.

```json
// .contentrain/content/system/ui-labels/en.json
{ "nav.home": "Home", "nav.about": "About", "error.required": "This field is required" }
```

**Use for:** UI labels, button text, error messages, validation messages, i18n strings.

::: tip Parameterized Templates
Dictionary values support `{placeholder}` syntax:
```ts
dictionary('ui-labels').locale('en').get('welcome', { name: 'Ahmet' })
// "Hello, {name}!" → "Hello, Ahmet!"
```
:::

### Document

Markdown files with frontmatter metadata.

```markdown
---
title: Getting Started
category: guides
---

# Getting Started

This is the markdown body content...
```

**Use for:** blog articles, documentation pages, changelogs, legal pages.

## Domains

Models are organized by domain — a logical grouping:

```
.contentrain/content/
  marketing/     ← hero, pricing, testimonials
  blog/          ← blog-post, author
  system/        ← navigation, ui-labels
```

Domains are configured in `.contentrain/config.json`.

## Locales & i18n

Every model can be i18n-enabled (`i18n: true`). Content is stored per locale:

```
.contentrain/content/marketing/hero/
  en.json    ← English
  tr.json    ← Turkish
```

Any platform can read the locale files directly. The TypeScript SDK adds convenience:

```ts
// Option 1: Read JSON directly (any language)
// Just read .contentrain/content/marketing/hero/tr.json

// Option 2: TypeScript SDK (optional)
singleton('hero').locale('tr').get()  // typed, with query API
```

## Git Workflow

Every write operation creates a Git commit on a namespaced branch:

```
cr/model/hero-section        ← model changes
cr/content/blog-post         ← content changes
cr/normalize/extract/...     ← normalize extraction
cr/normalize/reuse/...       ← source patching
```

Branches are auto-merged or held for review depending on your workflow config.

## How It Compares

| | Contentrain AI | Headless CMS (Sanity, Strapi) | Git CMS (Tina, Decap) |
|---|---|---|---|
| **Content source** | Your codebase or agent-created from scratch | External dashboard | Markdown/JSON in repo |
| **AI integration** | Native (MCP tools) | Manual API calls | None |
| **Extract from code** | Yes (normalize flow) | No | No |
| **Vendor lock-in** | None (plain files + Git) | API dependency | Editor dependency |
| **Type safety** | Generated SDK (optional) | Manual types | Manual types |
| **i18n** | Built-in (per-locale files) | Plugin/addon | Plugin/addon |
| **Review workflow** | Git branches + local UI | Dashboard roles | PR-based |
| **Runtime dependency** | Zero (static files) | API availability | Build-time |

::: tip No Lock-In
Contentrain stores everything as plain JSON and Markdown files in your Git repo. If you stop using Contentrain tomorrow, your content is still there — readable, portable, yours.
:::

## Beyond Web: Content CDN

Web projects deploy content with `git push` — no extra infrastructure needed. But non-web platforms (iOS, Android, React Native, Flutter, desktop apps, game engines, IoT) can't read from a git repo at runtime.

For these use cases, Contentrain publishes merged content to a CDN (`cdn.contentrain.io`), delivering the same structured JSON your SDK queries — just over HTTP instead of the filesystem.

```
Git repo → merge → CDN publish → iOS/Android/Flutter fetch → typed response
```

This means one content source powers your website, mobile app, and any other platform — all governed by the same review workflow.

## Contentrain Studio

[Contentrain Studio](/studio) is the open-core team operations panel for Git-native structured content. Teams can self-host the AGPL core or use a managed Pro/Enterprise offering on top of the same model.

The local open-source stack gives you:

- MCP tools
- CLI workflows
- local review UI
- generated SDK
- rules and skills

Studio adds the multi-user operating layer on top of that:

- **Workspace and project management** — organize repos, teams, and environments
- **Chat-first operations** — run bounded content workflows through a web app
- **Permissioned collaboration** — owners, admins, editors, reviewers, and viewers
- **Branch and diff review** — inspect, merge, reject, and track content changes
- **Media and submissions** — manage assets and inbound content workflows
- **CDN delivery** — publish merged content to apps that cannot read from Git at runtime

The local tools and Studio share the same Git-native content model. The difference is not the content format — it is the operating surface.
