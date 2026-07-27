---
name: architecture
description: "Contentrain schema and type architecture overview including design principles, type system, model definitions, and storage patterns."
---

# Contentrain Architecture

## Design Principles

1. **Token-efficient:** Flat type system with single keywords. No `format` sub-layer. `type: "email"` is the complete specification.
2. **AI-first:** Easy to produce, cheap to read, fast to validate. Minimal properties, omit defaults.
3. **Platform-agnostic:** MCP tools are framework-agnostic. Agent provides stack-specific intelligence.
4. **Git-native:** All content is Git-tracked. Object-map storage with sorted keys for clean diffs.
5. **Deterministic:** Canonical serialization ensures identical data always produces identical files.

## Type System Overview

Contentrain uses a **flat type system** with 27 types organized into 7 families. Each type is a single keyword.

| Family | Types | Count |
|--------|-------|-------|
| String | `string`, `text`, `email`, `url`, `slug`, `color`, `phone`, `code`, `icon`, `markdown`, `richtext` | 11 |
| Number | `number`, `integer`, `decimal`, `percent`, `rating` | 5 |
| Primitives | `boolean`, `date`, `datetime` | 3 |
| Media | `image`, `video`, `file` | 3 |
| Relations | `relation`, `relations` | 2 |
| Structural | `select`, `array`, `object` | 3 |

**Total: 27 types**

See [Schema Types](schema-types.md) for the complete catalog with validation rules and JSON Schema exports.

## Field Definition

A field definition describes one field in a model. Include only properties that apply -- omit all defaults.

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

### Key Properties

| Property | Applicable Types | Description |
|----------|-----------------|-------------|
| `type` | ALL | **Required.** One of the 27 types |
| `required` | ALL | Mark field as mandatory. Default: `false`. Omit if `false` |
| `unique` | `string`, `email`, `slug`, `integer` | Enforce uniqueness. Default: `false`. Omit if `false` |
| `default` | ALL | Default value. Omit if `null` |
| `min` / `max` | strings (chars), numbers (value), arrays (elements) | Constraints |
| `pattern` | `string`, `text`, `code` | Regex validation |
| `options` | `select` ONLY | Fixed choices array |
| `model` | `relation`, `relations` ONLY | Target model ID (string or string array for polymorphic) |
| `items` | `array` ONLY | Element type definition |
| `fields` | `object` ONLY | Nested field definitions |
| `accept` | `image`, `video`, `file` | Allowed MIME types |
| `maxSize` | `image`, `video`, `file` | Max file size in bytes |
| `description` | ALL | Human-readable hint |

### Omission Rules

- `required: false` (default) --> do NOT include
- `unique: false` (default) --> do NOT include
- `default: null` --> do NOT include
- Fewer properties = fewer tokens = faster agent processing

## Model Definition

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

### Model Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier, **kebab-case** |
| `name` | string | Yes | Human-readable display name |
| `kind` | string | Yes | `singleton`, `collection`, `document`, `dictionary` |
| `domain` | string | Yes | Organizational group (maps to content subdirectory) |
| `i18n` | boolean | Yes | Whether model supports multiple locales |
| `description` | string | No | Model description for docs and agent context |
| `fields` | object | Yes (except dictionary) | Field definitions. Dictionary has NO fields |
| `content_path` | string | No | Framework-relative path. When set, content writes here instead of `.contentrain/content/` |
| `locale_strategy` | string | No | How locale is encoded: `"file"` (default), `"suffix"`, `"directory"`, `"none"` |

## The Four Kinds

### Singleton
One instance per locale. JSON object.
```json
{ "cta": "Get Started", "title": "Build faster" }
```
Path: `content/{domain}/{model-id}/{locale}.json`

### Collection
Multiple entries. Object-map with entry ID as key, sorted lexicographically.
```json
{
  "a1b2c3d4e5f6": { "name": "Ahmet", "role": "CEO" },
  "f6e5d4c3b2a1": { "name": "Jane", "role": "CTO" }
}
```
Path: `content/{domain}/{model-id}/{locale}.json`
MCP tools return collections as **arrays** with `id` injected.

### Document
Markdown with YAML frontmatter. One file per slug per locale.
```markdown
---
title: Getting Started
slug: getting-started
---
# Getting Started with Contentrain
```
Path: `content/{domain}/{model-id}/{slug}/{locale}.md`

### Dictionary
Flat key-value. All values are strings. No `fields` property in model definition.
```json
{ "auth.expired": "Session expired", "auth.failed": "Authentication failed" }
```
Path: `content/{domain}/{model-id}/{locale}.json`

## Entry ID Generation

- **Format:** 12-character hexadecimal string (e.g., `a1b2c3d4e5f6`)
- **Scope:** Collection entries only
- **Generation:** Auto-generated by MCP tools. Agents never create IDs manually
- **Usage:** Object-map key on disk, injected as `id` field in MCP tool output
- **Locale-agnostic:** Same ID used across all locale files for the same entry

## Object-Map Rationale

Collections use object-map storage (`{ entryId: { fields } }`) instead of arrays because:

1. **Sorted keys produce predictable diffs** -- adding entries at deterministic positions
2. **Minimizes Git merge conflicts** -- two branches adding different entries rarely conflict (~0.3% chance for 350-entry collection)
3. **No ID duplication** -- key IS the ID, no redundant `id` field inside entries
4. **Consistent with metadata files** -- same structure in `.contentrain/meta/`

## Locale Strategy Rules

The `locale_strategy` property controls how locale is encoded in file paths:

| Strategy | i18n:true JSON path | i18n:true Document path | i18n:false path |
|----------|---------------------|------------------------|-----------------|
| `file` (default) | `{dir}/{locale}.json` | `{dir}/{slug}/{locale}.md` | `{dir}/data.json` |
| `suffix` | `{dir}/{model}.{locale}.json` | `{dir}/{slug}.{locale}.md` | `{dir}/data.json` |
| `directory` | `{dir}/{locale}/{model}.json` | `{dir}/{locale}/{slug}.md` | `{dir}/data.json` |
| `none` | **INVALID** | **INVALID** | `{dir}/{model}.json` or `{dir}/{slug}.md` |

- `locale_strategy: "none"` requires `i18n: false`
- When `content_path` is set, `{dir}` is the content_path. Otherwise `{dir}` is `.contentrain/content/{domain}/{model-id}`

## Nesting Limits

**Maximum nesting depth: 2 levels.**

An `object` inside an `object` is allowed. An `object` inside an `object` inside an `object` is NOT.

```json
"address": {
  "type": "object",
  "fields": {
    "city": { "type": "string", "required": true },
    "coordinates": {
      "type": "object",
      "fields": {
        "lat": { "type": "decimal" },
        "lng": { "type": "decimal" }
      }
    }
  }
}
```

- Prefer flat types over deeply nested structures
- Use relations to model complex data relationships instead of nesting
- If you need deeper nesting, create a separate model and use a `relation` field

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Model ID | kebab-case | `blog-post`, `team-members` |
| Field key | snake_case | `hero_image`, `cta_url` |
| Domain | lowercase, single word or kebab-case | `blog`, `marketing`, `system` |
| Dictionary key | dot-notation | `auth.failed`, `validation.required` |
| Slug | lowercase, kebab-case | `getting-started` |
| Locale | ISO 639-1 | `en`, `tr`, `de` |
