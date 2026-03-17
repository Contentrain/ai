---
description: Schema Rules — Contentrain content governance
trigger: always_on
---

# Contentrain Schema Rules

> These rules define the Contentrain type system, field definitions, model definitions, and relation system. Follow them exactly when creating or modifying models and content schemas.

---

## 1. Type System Overview

Contentrain uses a **flat type system** with 27 types. Each type is a single keyword -- there is no `format` sub-layer. `type: "email"` is the complete specification.

This design is optimized for AI agents: easy to produce, cheap to read, fast to validate.

---

## 2. Complete Type Reference (27 Types)

### 2.1 String Family (11 types)

| Type | Description | Validation | JSON Schema Export |
|------|-------------|------------|-------------------|
| `string` | Single-line text | -- | `{ "type": "string" }` |
| `text` | Multi-line text | -- | `{ "type": "string" }` |
| `email` | Email address | RFC 5321 | `{ "type": "string", "format": "email" }` |
| `url` | URL | RFC 3986 | `{ "type": "string", "format": "uri" }` |
| `slug` | URL-safe identifier | `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` | `{ "type": "string", "pattern": "..." }` |
| `color` | Hex color code | `/^#[0-9a-fA-F]{6}$/` | `{ "type": "string" }` |
| `phone` | Phone number | E.164 or freeform | `{ "type": "string" }` |
| `code` | Code snippet | -- | `{ "type": "string" }` |
| `icon` | Icon identifier | -- | `{ "type": "string" }` |
| `markdown` | Markdown content | -- | `{ "type": "string" }` |
| `richtext` | HTML rich text | -- | `{ "type": "string" }` |

### 2.2 Number Family (5 types)

| Type | Description | Constraints | JSON Schema Export |
|------|-------------|-------------|-------------------|
| `number` | General number | -- | `{ "type": "number" }` |
| `integer` | Whole number | -- | `{ "type": "integer" }` |
| `decimal` | Decimal number | -- | `{ "type": "number" }` |
| `percent` | Percentage | 0-100 | `{ "type": "number", "minimum": 0, "maximum": 100 }` |
| `rating` | Rating score | 1-5 | `{ "type": "integer", "minimum": 1, "maximum": 5 }` |

### 2.3 Primitives (3 types)

| Type | Storage Format | JSON Schema Export |
|------|---------------|-------------------|
| `boolean` | `true` / `false` | `{ "type": "boolean" }` |
| `date` | `"YYYY-MM-DD"` string | `{ "type": "string", "format": "date" }` |
| `datetime` | ISO 8601 string | `{ "type": "string", "format": "date-time" }` |

### 2.4 Media (3 types)

| Type | Storage | Description |
|------|---------|-------------|
| `image` | Relative path (string) | Image file reference |
| `video` | Relative path (string) | Video file reference |
| `file` | Relative path (string) | Generic file reference |

In v1, media fields store URL/path strings only. Upload and processing are out of scope.

### 2.5 Relations (2 types)

| Type | Cardinality | Storage |
|------|-------------|---------|
| `relation` | One-to-one | `"entry-id"` (string) |
| `relations` | One-to-many | `["id-1", "id-2"]` (string array) |

### 2.6 Structural (3 types)

| Type | Description | Requires |
|------|-------------|----------|
| `select` | Fixed options, pick one | `options` property |
| `array` | Ordered list of items | `items` property |
| `object` | Nested key-value structure | `fields` property |

---

## 3. Field Definition

A field definition describes one field in a model. Include only the properties that apply -- omit all defaults.

```json
{
  "type": "string",
  "required": true,
  "min": 3,
  "max": 100,
  "unique": true,
  "description": "Page title"
}
```

### 3.1 Field Properties

| Property | Applicable Types | Description |
|----------|-----------------|-------------|
| `type` | ALL | **Required.** One of the 27 types. |
| `required` | ALL | Mark field as mandatory. Default: `false`. Omit if `false`. |
| `unique` | `string`, `email`, `slug`, `integer` | Enforce uniqueness within model. Default: `false`. Omit if `false`. |
| `default` | ALL | Default value. Omit if `null`. |
| `min` | string/text: char count; numbers: value; array: element count | Minimum constraint. |
| `max` | Same as `min` | Maximum constraint. |
| `pattern` | `string`, `text`, `code` | Regex validation pattern. |
| `options` | `select` ONLY | Fixed choices: `["draft", "published", "archived"]` |
| `model` | `relation`, `relations` ONLY | Target model ID. String or string array for polymorphic. |
| `items` | `array` ONLY | Element type: `"string"` or `{ "type": "object", "fields": {...} }` |
| `fields` | `object` ONLY | Nested field definitions. |
| `accept` | `image`, `video`, `file` | Allowed MIME types: `"image/png,image/jpeg"` |
| `maxSize` | `image`, `video`, `file` | Maximum file size in bytes. |
| `description` | ALL | Human-readable hint (shown in Studio UI tooltip, used as agent context). |

### 3.2 Omission Rules

These rules produce minimal, clean schema definitions:

- If `required` is `false` (the default), do NOT include it.
- If `unique` is `false` (the default), do NOT include it.
- If `default` is `null`, do NOT include it.
- Only include properties that add information. Fewer properties = fewer tokens = faster agent processing.

---

## 4. Model Definition

Model definitions live at `.contentrain/models/{model-id}.json`. One file per model.

```json
{
  "id": "blog-post",
  "name": "Blog Post",
  "kind": "document",
  "domain": "blog",
  "i18n": true,
  "description": "Blog articles with markdown body",
  "fields": {
    "title": { "type": "string", "required": true, "max": 120 },
    "slug": { "type": "slug", "required": true, "unique": true },
    "author": { "type": "relation", "model": "team-members", "required": true },
    "tags": { "type": "array", "items": "string" }
  }
}
```

### 4.1 Model Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier, **kebab-case**. |
| `name` | `string` | Yes | Human-readable display name. |
| `kind` | `string` | Yes | One of: `singleton`, `collection`, `document`, `dictionary`. |
| `domain` | `string` | Yes | Organizational group (maps to content subdirectory). |
| `i18n` | `boolean` | Yes | Whether the model supports multiple locales. |
| `description` | `string` | No | Model description for documentation and agent context. |
| `fields` | `object` | Yes (except dictionary) | Field definitions. Dictionary kind has NO fields. |
| `content_path` | `string` | No | Framework-relative path for content files (e.g., `"content/blog"`, `"locales"`). When set, content is written here instead of `.contentrain/content/`. |
| `locale_strategy` | `string` | No | How locale is encoded in file names: `"file"` (default), `"suffix"`, `"directory"`, `"none"`. |

### 4.2 System Fields

Do NOT define these in the schema. The platform manages them automatically:

| Field | Kind | Source |
|-------|------|--------|
| `id` | Collection | 12-char hex, used as object-map key |
| `slug` | Document | Directory name in content path |
| `createdAt` / `updatedAt` | All | Derived from Git commit history (not stored) |
| `status`, `source`, `updated_by`, `approved_by` | All | Stored in `.contentrain/meta/` |

---

### 4.3 Locale Strategy Rules

The `locale_strategy` property controls how locale is encoded in file paths:

| Strategy | i18n:true JSON path | i18n:true Document path | i18n:false path |
|----------|---------------------|------------------------|-----------------|
| `file` (default) | `{dir}/{locale}.json` | `{dir}/{slug}/{locale}.md` | `{dir}/data.json` |
| `suffix` | `{dir}/{model}.{locale}.json` | `{dir}/{slug}.{locale}.md` | `{dir}/data.json` |
| `directory` | `{dir}/{locale}/{model}.json` | `{dir}/{locale}/{slug}.md` | `{dir}/data.json` |
| `none` | **INVALID** (requires i18n:false) | **INVALID** | `{dir}/{model}.json` or `{dir}/{slug}.md` |

- `locale_strategy: "none"` requires `i18n: false`. The "none" strategy stores a single file without locale encoding.
- When `content_path` is set, `{dir}` is the content_path. Otherwise `{dir}` is `.contentrain/content/{domain}/{model-id}`.

---

## 5. The Four Model Kinds

### 5.1 Singleton

**One instance per locale.** Use for page sections, site config, navigation.

| Aspect | Detail |
|--------|--------|
| Storage | JSON object (one file per locale) |
| File path | `content/{domain}/{model-id}/{locale}.json` |
| `i18n: false` path | `content/{domain}/{model-id}/data.json` |
| ID management | None (single instance) |
| Relation target | Cannot be referenced by relations |

```json
{
  "cta": "Get Started",
  "title": "Build faster"
}
```

### 5.2 Collection

**Multiple entries.** Use for team members, products, FAQs, categories.

| Aspect | Detail |
|--------|--------|
| Storage | JSON object-map (entry ID as key, sorted lexicographically) |
| File path | `content/{domain}/{model-id}/{locale}.json` |
| Tool output | Array with `id` injected |
| ID management | Auto-generated 12-char hex |
| Relation target | Referenced by entry `id` |

```json
{
  "a1b2c3d4e5f6": { "name": "Ahmet", "role": "CEO" },
  "f6e5d4c3b2a1": { "name": "Jane", "role": "CTO" }
}
```

### 5.3 Document

**Markdown with frontmatter.** Use for blog posts, documentation, changelogs.

| Aspect | Detail |
|--------|--------|
| Storage | `.md` file with YAML frontmatter |
| File path | `content/{domain}/{model-id}/{slug}/{locale}.md` |
| `i18n: false` path | `content/{domain}/{model-id}/{slug}.md` |
| ID management | `slug` field (URL-safe, unique) |
| Relation target | Referenced by `slug` |

```markdown
---
title: Getting Started
slug: getting-started
author: a1b2c3d4e5f6
---
# Getting Started with Contentrain
```

### 5.4 Dictionary

**Flat key-value pairs.** Use for error messages, UI strings, translations.

| Aspect | Detail |
|--------|--------|
| Storage | Flat JSON object (key-value, all values are strings) |
| File path | `content/{domain}/{model-id}/{locale}.json` |
| Fields definition | None -- dictionary models have NO `fields` property |
| ID management | Key is identity |
| Relation target | Cannot be referenced by relations |

```json
{
  "auth.expired": "Session expired",
  "auth.failed": "Authentication failed"
}
```

---

## 6. Relation Rules

### 6.1 Basic Relations

```json
"author": { "type": "relation", "model": "team-members", "required": true }
"categories": { "type": "relations", "model": "categories" }
```

- `relation` (1:1): Value is a single string -- an entry ID or slug.
- `relations` (1:many): Value is a string array of entry IDs or slugs.

### 6.2 Target Model Restrictions

| Target Kind | Reference Key | Can Be Target? |
|-------------|--------------|----------------|
| Collection | Entry `id` | Yes |
| Document | Document `slug` | Yes |
| Singleton | -- | No |
| Dictionary | -- | No |

### 6.3 Polymorphic Relations

When a field can reference multiple model types:

```json
"target": { "type": "relation", "model": ["blog-post", "page"] }
```

Storage for polymorphic references uses a compound value:

```json
{ "model": "blog-post", "ref": "getting-started" }
```

### 6.4 Self-Referencing

Models can reference themselves (e.g., hierarchical categories):

```json
"parent": { "type": "relation", "model": "categories" }
```

### 6.5 Resolution Rules

- Relations are resolved **1 level deep** -- no recursive resolution.
- **Unresolved IDs** (target entry does not exist) are kept as raw strings (graceful degradation).
- **Cascade deletion does not exist.** Deleting a referenced entry produces a broken relation warning.
- **Array order is preserved** for `relations` type.
- **IDs/slugs are locale-agnostic.** The same reference works across all locales.

### 6.6 Validation

- Referenced ID/slug MUST exist in the target model.
- `model` property MUST reference an existing model ID.
- Referential integrity is checked by `contentrain_validate`.
- Deleting a model that is referenced by other models is BLOCKED.

---

## 7. Nesting Limits

### 7.1 Object Type

```json
"address": {
  "type": "object",
  "fields": {
    "city": { "type": "string", "required": true },
    "street": { "type": "string", "required": true },
    "zip": { "type": "string" }
  }
}
```

### 7.2 Array of Objects

```json
"variants": {
  "type": "array",
  "items": {
    "type": "object",
    "fields": {
      "color": { "type": "color", "required": true },
      "price": { "type": "decimal", "required": true },
      "size": { "type": "select", "options": ["S", "M", "L"] }
    }
  },
  "max": 50
}
```

### 7.3 Depth Limit

**Maximum nesting depth: 2 levels.** An object inside an object is allowed. An object inside an object inside an object is NOT.

- Prefer flat types over deeply nested structures.
- Use relations to model complex data relationships instead of nesting.
- If you need deeper nesting, create a separate model and use a `relation` field.

---

## 8. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Model ID | kebab-case | `blog-post`, `team-members` |
| Field key | snake_case | `hero_image`, `cta_url` |
| Domain | lowercase, single word or kebab-case | `blog`, `marketing`, `system` |
| Dictionary key | dot-notation | `auth.failed`, `validation.required` |
| Slug | lowercase, kebab-case | `getting-started` |
| Locale | ISO 639-1 | `en`, `tr`, `de` |
