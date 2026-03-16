---
title: Configuration
description: Complete reference for config.json, context.json, vocabulary.json, and the .contentrain directory layout
order: 3
slug: config
---

# Configuration

Contentrain uses a set of JSON configuration files stored in the `.contentrain/` directory at your project root. This page covers every configuration file, its schema, and how they interact.

## Directory Layout

The `.contentrain/` directory is the central hub for all Contentrain data:

```
.contentrain/
├── config.json          # Project configuration
├── context.json         # Last operation metadata (auto-written by MCP)
├── vocabulary.json      # Shared terms for consistency (optional)
├── models/
│   ├── blog-posts.json  # Model schema definitions
│   ├── site-settings.json
│   └── ui-labels.json
├── content/
│   ├── blog/            # Domain directory
│   │   └── blog-posts/  # Model content directory
│   │       ├── en.json  # English entries
│   │       └── tr.json  # Turkish entries
│   └── system/
│       ├── site-settings/
│       │   ├── en.json
│       │   └── tr.json
│       └── ui-labels/
│           ├── en.json
│           └── tr.json
└── meta/
    ├── blog-posts/
    │   ├── en.json      # Entry metadata per locale
    │   └── tr.json
    ├── site-settings/
    │   ├── en.json
    │   └── tr.json
    └── ui-labels/
        ├── en.json
        └── tr.json
```

::: info
Models with a `content_path` override store their content files outside `.contentrain/content/` — for example, directly in `content/blog/` or `locales/`. The meta files always remain in `.contentrain/meta/`.
:::

## config.json

The primary project configuration file. Created by `contentrain init` and updated by MCP tools.

### Full Schema

```ts
interface ContentrainConfig {
  version: number          // Config version (currently 1)
  platform?: Platform      // Target platform
  stack: StackType         // Framework/stack identifier
  workflow: WorkflowMode   // Content workflow mode
  repository?: {           // Git repository info (optional)
    provider: 'github'
    owner: string
    name: string
    default_branch: string
  }
  locales: {
    default: string        // Default locale code (e.g., "en")
    supported: string[]    // All supported locale codes
  }
  domains: string[]        // Content domain names
  assets_path?: string     // Path for media assets
  branchRetention?: number // Auto-cleanup branch count
}
```

### Example

```json
{
  "version": 1,
  "platform": "web",
  "stack": "nuxt",
  "workflow": "review",
  "repository": {
    "provider": "github",
    "owner": "my-org",
    "name": "my-website",
    "default_branch": "main"
  },
  "locales": {
    "default": "en",
    "supported": ["en", "tr", "de"]
  },
  "domains": ["marketing", "blog", "system"],
  "assets_path": "public/uploads",
  "branchRetention": 10
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | `number` | Yes | Config schema version. Currently `1`. |
| `platform` | `Platform` | No | Target platform: `web`, `mobile`, `api`, `desktop`, `static`, `other` |
| `stack` | `StackType` | Yes | Framework identifier. See [Supported Stacks](#supported-stacks) below. |
| `workflow` | `WorkflowMode` | Yes | `auto-merge` or `review`. See [Workflow Modes](#workflow-modes). |
| `repository` | `object` | No | GitHub repository connection details. |
| `locales.default` | `string` | Yes | Default locale code (e.g., `en`). |
| `locales.supported` | `string[]` | Yes | All supported locale codes. Must include `default`. |
| `domains` | `string[]` | Yes | Content domain names for organizing models. |
| `assets_path` | `string` | No | Directory for media assets relative to project root. |
| `branchRetention` | `number` | No | Number of merged content branches to keep before auto-cleanup. |

### Supported Stacks

Contentrain supports a wide range of frameworks and platforms:

| Category | Stack Types |
|---|---|
| **Meta-frameworks** | `nuxt`, `next`, `astro`, `sveltekit`, `remix`, `analog` |
| **Frontend frameworks** | `vue`, `react`, `svelte`, `solid`, `angular` |
| **Mobile** | `react-native`, `expo`, `flutter` |
| **Backend** | `node`, `express`, `fastify`, `nestjs`, `django`, `rails`, `laravel`, `go`, `rust`, `dotnet` |
| **Static site generators** | `hugo`, `jekyll`, `eleventy` |
| **Desktop** | `electron`, `tauri` |
| **Catch-all** | `other` |

### Workflow Modes

The `workflow` field controls how content changes are integrated:

| Mode | Behavior | Best For |
|---|---|---|
| `auto-merge` | Content branches are automatically merged to the default branch after commit | Development, single-author projects, rapid iteration |
| `review` | Content branches remain open for human review before merging | Production, multi-author teams, quality gates |

::: warning
Normalize operations (extraction and reuse) always use the `review` workflow regardless of this setting. This ensures human oversight for code-modifying changes.
:::

## context.json

Automatically maintained by MCP after every write operation. This file provides last-operation tracking for IDE integrations and the Serve UI.

### Full Schema

```ts
interface ContextJson {
  version: string
  lastOperation: {
    tool: string           // MCP tool name that performed the operation
    model: string          // Model ID that was affected
    locale: string         // Locale of the operation
    entries?: string[]     // Entry IDs affected (collection only)
    timestamp: string      // ISO 8601 timestamp
    source: ContextSource  // Who triggered: 'mcp-local' | 'mcp-studio' | 'studio-ui'
  }
  stats: {
    models: number         // Total number of models
    entries: number        // Total number of content entries
    locales: string[]      // Active locale codes
    lastSync: string       // ISO 8601 timestamp of last sync
  }
}
```

### Example

```json
{
  "version": "1.0.0",
  "lastOperation": {
    "tool": "contentrain_content_save",
    "model": "blog-posts",
    "locale": "en",
    "entries": ["a1b2c3", "d4e5f6"],
    "timestamp": "2026-03-15T10:30:00Z",
    "source": "mcp-local"
  },
  "stats": {
    "models": 5,
    "entries": 42,
    "locales": ["en", "tr"],
    "lastSync": "2026-03-15T10:30:00Z"
  }
}
```

::: tip
Do not manually edit `context.json`. It is auto-written by MCP after every write operation. IDE extensions and the Serve UI read this file to stay synchronized.
:::

### Context Sources

| Source | Description |
|---|---|
| `mcp-local` | Operation triggered via local MCP (CLI/IDE) |
| `mcp-studio` | Operation triggered via Contentrain Studio MCP |
| `studio-ui` | Operation triggered via the Studio web UI |

## vocabulary.json

An optional file for maintaining shared terms across all content. Ensures consistency when multiple agents or authors work on the same project.

### Full Schema

```ts
interface Vocabulary {
  version: number
  terms: Record<string, Record<string, string>>
  // terms[term_key][locale] = translated_value
}
```

### Example

```json
{
  "version": 1,
  "terms": {
    "product_name": {
      "en": "Contentrain",
      "tr": "Contentrain"
    },
    "company_name": {
      "en": "Contentrain Inc.",
      "tr": "Contentrain A.Ş."
    },
    "cta_primary": {
      "en": "Get Started",
      "tr": "Başla"
    },
    "support_email": {
      "en": "support@contentrain.io",
      "tr": "support@contentrain.io"
    }
  }
}
```

### Usage

- **Agents** reference vocabulary terms to ensure brand names, CTAs, and product terminology are consistent across all content.
- **Validation** can flag content that deviates from established vocabulary.
- **Terms are locale-aware** — each term has translations for all supported locales.

::: info
Vocabulary is optional but recommended for projects with multiple content authors or AI agents. It prevents inconsistencies like "Get Started" vs "Start Now" vs "Begin Here" across different pages.
:::

## Model Definition Files

Stored in `.contentrain/models/{model-id}.json`. Each file defines one model's schema.

### Full Schema

```ts
interface ModelDefinition {
  id: string                      // Unique model identifier
  name: string                    // Human-readable name
  kind: ModelKind                 // 'collection' | 'singleton' | 'document' | 'dictionary'
  domain: string                  // Organizational domain
  i18n: boolean                   // Whether content is localized
  description?: string            // Optional description
  fields?: Record<string, FieldDef> // Field definitions (not used for dictionary)
  content_path?: string           // Framework-relative path override
  locale_strategy?: LocaleStrategy // How locale is encoded in file paths
}
```

See the [Model Kinds](/reference/model-kinds) page for detailed kind-specific documentation and the [Field Types](/reference/field-types) page for field definition details.

## Meta Files

Stored in `.contentrain/meta/{model-id}/{locale}.json`. Track the lifecycle state of content entries.

### Entry Metadata Schema

```ts
interface EntryMeta {
  status: ContentStatus    // 'draft' | 'in_review' | 'published' | 'rejected' | 'archived'
  source: ContentSource    // 'agent' | 'human' | 'import'
  updated_by: string       // Author identifier
  approved_by?: string     // Approver identifier (optional)
  version?: string         // Version string (optional)
  publish_at?: string      // ISO 8601 scheduled publish (optional)
  expire_at?: string       // ISO 8601 scheduled expiry (optional)
}
```

### Content Status Lifecycle

| Status | Description | Transitions To |
|---|---|---|
| `draft` | Initial state, work in progress | `in_review`, `published` |
| `in_review` | Submitted for review | `published`, `rejected` |
| `published` | Live and active | `archived`, `draft` |
| `rejected` | Review rejected | `draft` |
| `archived` | No longer active | `draft` |

### Content Sources

| Source | Description |
|---|---|
| `agent` | Created or modified by an AI agent via MCP |
| `human` | Created or modified by a human via Studio UI or direct edit |
| `import` | Imported from an external system |

### Scheduled Publishing

Use `publish_at` and `expire_at` for time-based content lifecycle:

```json
{
  "status": "draft",
  "source": "agent",
  "updated_by": "contentrain-mcp",
  "publish_at": "2026-04-01T00:00:00Z",
  "expire_at": "2026-06-30T23:59:59Z"
}
```

::: warning
`expire_at` must be after `publish_at`. The MCP validation tool will flag invalid date ranges.
:::

## Domain Organization

Domains group related models and are declared in `config.json`'s `domains` array.

### Common Patterns

| Domain | Typical Models | Description |
|---|---|---|
| `marketing` | Landing pages, CTAs, testimonials, pricing | Public-facing marketing content |
| `blog` | Blog posts, authors, categories, tags | Blog and editorial content |
| `system` | Site settings, navigation, footer, labels | System-level configuration |
| `docs` | Guides, reference, tutorials | Documentation content |
| `product` | Features, changelog, roadmap | Product-related content |
| `legal` | Privacy policy, terms of service | Legal documents |

### Adding a Domain

Domains are declared in `config.json` and used as the `domain` field in model definitions:

```json
// config.json
{
  "domains": ["marketing", "blog", "system", "docs"]
}

// .contentrain/models/blog-posts.json
{
  "id": "blog-posts",
  "domain": "blog",
  "kind": "collection"
}
```

Content files for this model would be stored at `.contentrain/content/blog/blog-posts/` (unless `content_path` is set).

## Locale Configuration

### Default Locale

The `locales.default` value determines:
- Which locale is used when no locale is specified in MCP calls
- The fallback locale for missing translations
- The primary locale for the content editing experience

### Supported Locales

The `locales.supported` array lists all active locale codes:

```json
{
  "locales": {
    "default": "en",
    "supported": ["en", "tr", "de", "fr", "es"]
  }
}
```

::: tip
The `supported` array must include the `default` locale. Use standard BCP 47 locale codes (e.g., `en`, `tr`, `de`, `fr`, `pt-BR`).
:::

### Per-Model i18n

Each model independently controls whether it uses localization:

| `i18n` Value | File Pattern | Use Case |
|---|---|---|
| `true` | Separate file per locale (`en.json`, `tr.json`) | Translatable content |
| `false` | Single `data.json` file | Language-independent content (e.g., color codes, API keys) |

## Canonical Serialization

All JSON files written by Contentrain follow strict serialization rules for clean git diffs:

| Rule | Description |
|---|---|
| **Sorted keys** | Object keys are sorted alphabetically |
| **2-space indent** | Consistent indentation |
| **Trailing newline** | Every file ends with `\n` |
| **No trailing commas** | Standard JSON format |
| **UTF-8 encoding** | Universal character support |

This ensures that content changes produce minimal, reviewable git diffs — critical for the review workflow.
