---
title: Model Kinds
description: Complete specification of the four model kinds: collection, singleton, dictionary, and document — including storage formats, locale strategies, and decision criteria
order: 1
slug: model-kinds
---

# Model Kinds

Contentrain organizes content into four distinct **model kinds**, each optimized for a specific content pattern. Every model definition includes a `kind` field that determines how content is stored, accessed, and localized.

```ts
type ModelKind = 'singleton' | 'collection' | 'document' | 'dictionary'
```

## Decision Table

Use this table to choose the right kind for your content:

| Question | Collection | Singleton | Dictionary | Document |
|---|---|---|---|---|
| Multiple entries? | Yes | No | Yes (keys) | Yes |
| Typed fields? | Yes | Yes | No (all strings) | Yes (frontmatter) |
| Has ID/slug? | Auto hex ID | N/A | No (key = identity) | Slug (required) |
| Rich body content? | No | No | No | Yes (Markdown) |
| Typical use case | Blog posts, products, team members | Site settings, hero section | i18n translations, labels | Documentation, articles |
| Storage format | JSON object-map | JSON object | JSON flat key-value | Markdown + frontmatter |

## Collection

Collections store **multiple typed entries** as a JSON object-map keyed by auto-generated hex IDs.

### Storage Format

```json
{
  "a1b2c3": {
    "title": "Getting Started",
    "slug": "getting-started",
    "category": "tutorial",
    "published": true
  },
  "d4e5f6": {
    "title": "Advanced Usage",
    "slug": "advanced-usage",
    "category": "guide",
    "published": false
  }
}
```

### Key Characteristics

- **Object-map storage** — entries keyed by ID, not an array
- **Auto-generated hex IDs** — alphanumeric, 1-40 characters, hyphens/underscores allowed
- **Typed fields** — each field has a defined `FieldType` with validation
- **Sorted keys** — canonical serialization sorts entry IDs alphabetically
- **Per-locale files** — each locale gets its own JSON file

### Model Definition Example

```json
{
  "id": "blog-posts",
  "name": "Blog Posts",
  "kind": "collection",
  "domain": "blog",
  "i18n": true,
  "fields": {
    "title": { "type": "string", "required": true },
    "slug": { "type": "slug", "required": true, "unique": true },
    "excerpt": { "type": "text", "max": 300 },
    "cover": { "type": "image" },
    "published": { "type": "boolean", "default": false }
  }
}
```

### MCP content_save Call

```json
{
  "model": "blog-posts",
  "entries": [
    {
      "locale": "en",
      "data": {
        "title": "My First Post",
        "slug": "my-first-post",
        "excerpt": "An introduction to Contentrain.",
        "published": true
      }
    }
  ]
}
```

::: tip
The `id` field is auto-generated when omitted. You can provide your own ID if needed, but it must be unique within the collection.
:::

## Singleton

Singletons store a **single entry** per locale — ideal for one-off content like site settings or hero sections.

### Storage Format

```json
{
  "site_name": "My Website",
  "tagline": "Build faster with AI",
  "logo": "/images/logo.svg",
  "social_links": ["https://twitter.com/example"]
}
```

### Key Characteristics

- **Single object** — no ID, no slug, just field key-value pairs
- **Typed fields** — same field system as collections
- **One file per locale** — `en.json`, `tr.json`, etc.
- **No entry multiplicity** — exactly one entry per model per locale

### Model Definition Example

```json
{
  "id": "site-settings",
  "name": "Site Settings",
  "kind": "singleton",
  "domain": "system",
  "i18n": true,
  "fields": {
    "site_name": { "type": "string", "required": true },
    "tagline": { "type": "string" },
    "logo": { "type": "image" },
    "social_links": { "type": "array", "items": "string" }
  }
}
```

### MCP content_save Call

```json
{
  "model": "site-settings",
  "entries": [
    {
      "locale": "en",
      "data": {
        "site_name": "My Website",
        "tagline": "Build faster with AI"
      }
    }
  ]
}
```

## Dictionary

Dictionaries store **flat key-value string maps** — the primary kind for i18n translations and UI labels.

### Storage Format

```json
{
  "auth.login.title": "Sign In",
  "auth.login.submit": "Log In",
  "auth.login.forgot": "Forgot your password?",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "greeting": "Hello, {name}!"
}
```

### Key Characteristics

- **Flat key-value** — all values are strings, no nested objects
- **No fields definition** — dictionaries do not use the `fields` property
- **No ID, no slug** — the key itself is the identity (semantic address)
- **Semantic keys** — use dot notation for namespacing (e.g., `auth.login.title`)
- **Parameterized templates** — values can include `{param}` placeholders
- **All values must be strings** — numbers, booleans, etc. must be string-encoded

::: warning
Dictionary models must NOT have `fields` defined. The keys in the data object are the content identifiers. Do not pass `id` or `slug` — they are ignored.
:::

### Model Definition Example

```json
{
  "id": "ui-labels",
  "name": "UI Labels",
  "kind": "dictionary",
  "domain": "system",
  "i18n": true,
  "content_path": "locales"
}
```

### MCP content_save Call

```json
{
  "model": "ui-labels",
  "entries": [
    {
      "locale": "en",
      "data": {
        "auth.login.title": "Sign In",
        "auth.login.submit": "Log In",
        "common.save": "Save"
      }
    },
    {
      "locale": "tr",
      "data": {
        "auth.login.title": "Giriş Yap",
        "auth.login.submit": "Oturum Aç",
        "common.save": "Kaydet"
      }
    }
  ]
}
```

## Document

Documents store **Markdown files with frontmatter** — ideal for long-form content like documentation, articles, and blog posts with rich body text.

### Storage Format

```markdown
---
title: Getting Started
description: Learn how to set up Contentrain in your project
order: 1
---

# Getting Started

Welcome to Contentrain. This guide walks you through...
```

### Key Characteristics

- **Markdown + frontmatter** — structured metadata above, rich content below
- **Slug-based** — each document has a required `slug` that determines the file path
- **`body` key** — the markdown content below the frontmatter delimiter
- **Frontmatter delimiters** — `---` on its own line
- **Auto-parsed values** — `true`/`false` become booleans, integers become numbers
- **Typed fields** — frontmatter fields are defined in the model schema

### Model Definition Example

```json
{
  "id": "docs-guide",
  "name": "Documentation Guides",
  "kind": "document",
  "domain": "docs",
  "i18n": false,
  "content_path": "docs/guides",
  "fields": {
    "title": { "type": "string", "required": true },
    "description": { "type": "text" },
    "order": { "type": "integer" }
  }
}
```

### MCP content_save Call

```json
{
  "model": "docs-guide",
  "entries": [
    {
      "slug": "getting-started",
      "data": {
        "title": "Getting Started",
        "description": "Learn how to set up Contentrain",
        "order": 1,
        "body": "# Getting Started\n\nWelcome to Contentrain..."
      }
    }
  ]
}
```

::: tip
The `slug` field is required for documents. It determines the file name and URL path. The `body` key inside `data` is reserved for the markdown content.
:::

## Locale Strategies

Each model can specify how localized content files are organized using the `locale_strategy` field:

```ts
type LocaleStrategy = 'file' | 'suffix' | 'directory' | 'none'
```

| Strategy | JSON Pattern | Markdown Pattern | Best For |
|---|---|---|---|
| `file` (default) | `{dir}/{locale}.json` | `{dir}/{slug}/{locale}.md` | Most projects |
| `suffix` | `{dir}/{model}.{locale}.json` | `{dir}/{slug}.{locale}.md` | Nuxt Content style |
| `directory` | `{dir}/{locale}/{model}.json` | `{dir}/{locale}/{slug}.md` | Directory-first projects |
| `none` | `{dir}/{model}.json` | `{dir}/{slug}.md` | Single-language projects |

### When i18n is Disabled

When a model has `i18n: false`, locale is ignored entirely:

- **JSON models:** stored as `{dir}/data.json`
- **Document models:** stored as `{dir}/{slug}.md`

## content_path Override

By default, content files are stored in `.contentrain/content/{domain}/{model-id}/`. The `content_path` field overrides this to store content in framework-specific directories:

```json
{
  "id": "blog-posts",
  "kind": "collection",
  "content_path": "content/blog"
}
```

This writes files to `{project-root}/content/blog/` instead of `.contentrain/content/blog/blog-posts/`.

**Common content_path patterns:**

| Framework | content_path | Purpose |
|---|---|---|
| Nuxt Content | `content/blog` | Nuxt reads from `content/` |
| Astro | `src/content/blog` | Astro content collections |
| Next.js | `content/posts` | Custom content directory |
| i18n libraries | `locales` | Translation files |
| VitePress | `docs/guide` | Documentation pages |

## Meta Files

Every model has corresponding meta files in `.contentrain/meta/{model-id}/` that track lifecycle state:

```json
{
  "status": "published",
  "source": "agent",
  "updated_by": "contentrain-mcp",
  "approved_by": null,
  "version": "1.0.0",
  "publish_at": "2026-01-15T00:00:00Z",
  "expire_at": "2026-12-31T23:59:59Z"
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `ContentStatus` | `draft` \| `in_review` \| `published` \| `rejected` \| `archived` |
| `source` | `ContentSource` | `agent` \| `human` \| `import` |
| `updated_by` | `string` | Author identifier |
| `approved_by` | `string?` | Approver identifier (optional) |
| `version` | `string?` | Version string (optional) |
| `publish_at` | `string?` | ISO 8601 scheduled publish date (optional) |
| `expire_at` | `string?` | ISO 8601 scheduled expiry date (optional) |

**Meta file structure by kind:**

| Kind | Meta Structure |
|---|---|
| Collection | Object-map: `{ "entry-id": { status, source, ... } }` |
| Singleton | Single object: `{ status, source, ... }` |
| Document | Single object: `{ status, source, ... }` |
| Dictionary | Single object: `{ status, source, ... }` |

## Collection ID vs Dictionary Key

This is a common source of confusion. Here is a detailed comparison:

| Aspect | Collection ID | Dictionary Key |
|---|---|---|
| **Purpose** | Unique entry identifier | Semantic content address |
| **Format** | Auto-generated hex (`a1b2c3`) | Dot-notation path (`auth.login.title`) |
| **Generation** | Automatic by MCP | Manual by agent/human |
| **Mutability** | Immutable after creation | Key is the identity, can be renamed |
| **Typed fields** | Yes — each entry has typed fields | No — all values are strings |
| **Nested data** | Supports complex field types | Flat key-value only |
| **Use case** | Structured entities (posts, products) | Translation strings, labels |
| **ID in data** | Added on output (`{ id, ...fields }`) | Key IS the data address |
