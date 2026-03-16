---
title: Core Concepts
description: "Understand the architecture: models, content kinds, domains, locales, and the agent-driven workflow"
order: 2
category: getting-started
slug: concepts
---

# Core Concepts

## The Big Idea

Most content tools ask you to learn their system — their dashboard, their API, their markup syntax. Contentrain inverts this: **your AI agent already understands your codebase**, so let it manage your content. Contentrain provides the deterministic infrastructure (MCP tools, validation, Git transactions) while the agent provides the intelligence (what to extract, how to structure, where to replace).

The result is a content pipeline where the agent generates, the system standardizes, and the human approves.

## The Agent-Driven Content Model

Contentrain AI inverts the traditional CMS workflow:

| Traditional CMS | Contentrain AI |
|---|---|
| Human opens dashboard | Human talks to AI agent |
| Human creates schema manually | Agent creates models via MCP |
| Human types content in forms | Agent writes content to Git |
| Content stored in database | Content stored as files in `.contentrain/` |
| API calls to read content | Generated SDK client with type-safe imports |
| Deploys need API availability | Static files — works offline, zero runtime deps |

## Three Layers

### 1. MCP (Infrastructure)

13 tools that AI agents call to manage content:

- **Read:** `contentrain_status`, `contentrain_describe`, `contentrain_content_list`, `contentrain_scan`
- **Write:** `contentrain_model_save`, `contentrain_content_save`, `contentrain_apply`, `contentrain_bulk`
- **Workflow:** `contentrain_validate`, `contentrain_submit`

MCP is **deterministic infrastructure** — it doesn't make content decisions. The agent decides what to create; MCP executes it.

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

The SDK resolves locale automatically:

```ts
singleton('hero').locale('tr').get()  // Turkish content
```

## Git Workflow

Every write operation creates a Git commit on a namespaced branch:

```
contentrain/model/hero-section        ← model changes
contentrain/content/blog-post         ← content changes
contentrain/normalize/extract/...     ← normalize extraction
contentrain/normalize/reuse/...       ← source patching
```

Branches are auto-merged or held for review depending on your workflow config.

## How It Compares

| | Contentrain AI | Headless CMS (Sanity, Strapi) | Git CMS (Tina, Decap) |
|---|---|---|---|
| **Content source** | Your existing codebase | External dashboard | Markdown/JSON in repo |
| **AI integration** | Native (MCP tools) | Manual API calls | None |
| **Extract from code** | Yes (normalize flow) | No | No |
| **Vendor lock-in** | None (plain files + Git) | API dependency | Editor dependency |
| **Type safety** | Generated SDK | Manual types | Manual types |
| **i18n** | Built-in (per-locale files) | Plugin/addon | Plugin/addon |
| **Review workflow** | Git branches + local UI | Dashboard roles | PR-based |
| **Runtime dependency** | Zero (static files) | API availability | Build-time |

::: tip No Lock-In
Contentrain stores everything as plain JSON and Markdown files in your Git repo. If you stop using Contentrain tomorrow, your content is still there — readable, portable, yours.
:::
