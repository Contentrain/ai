---
name: mcp-tools
description: "Complete MCP tool parameter tables, entry formats, scan modes, apply parameters, bulk operations, and workflow tools."
---

# MCP Tools Reference

## Context Tools (read-only)

### contentrain_status

Get full project state in one call. No parameters.

Returns:
- `initialized`: whether `.contentrain/` exists with config.json
- `config`: project configuration (stack, workflow, locales, domains)
- `models[]`: summary of all models (id, kind, domain, i18n, field count)
- `context`: last operation and project stats from `context.json`
- `vocabulary_size`: number of terms in vocabulary.json
- `branches`: branch health (total, merged, unmerged counts)
- `branch_warning`: warning message if too many active branches
- `next_steps`: suggested next actions

If not initialized, returns `detected_stack` and a suggestion to run `contentrain_init`.

### contentrain_describe

Get full schema + optional sample for one model.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID |
| `include_sample` | boolean | No | Include a sample entry |
| `locale` | string | No | Locale for sample data |

Returns full schema, all field definitions, entry stats, and stack-aware import snippets.

### contentrain_describe_format

Get the storage and file-format contract for Contentrain content. No parameters.

Returns the complete format specification for all four model kinds, canonical serialization rules, and file path patterns.

## Setup Tools

### contentrain_init

Initialize `.contentrain/` directory structure.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stack` | string | No | Framework: `"nuxt"`, `"next"`, `"astro"`, `"sveltekit"`, `"react"`, `"node"` |
| `locales` | string[] | No | Supported locales |
| `domains` | string[] | No | Content domains |

### contentrain_scaffold

Generate models from a built-in template.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `template` | string | Yes | Template name (see below) |
| `locales` | string[] | No | Override default locales |
| `with_sample_content` | boolean | No | Generate example content (default: true) |

Available templates:

| Template | Models Created | Use Case |
|----------|---------------|----------|
| `blog` | blog-post (document), categories (collection), authors (collection) | Blog/magazine |
| `landing` | hero (singleton), features (singleton), pricing (collection), faq (collection), testimonials (collection) | Landing page |
| `docs` | doc-page (document), doc-categories (collection) | Documentation |
| `ecommerce` | products (collection), categories (collection), brands (collection) | E-commerce |
| `saas` | hero (singleton), features (singleton), pricing (collection), changelog (document), faq (collection) | SaaS site |
| `i18n` | navigation (singleton), form-labels (singleton), error-messages (dictionary), app-strings (dictionary) | Localization |
| `mobile` | app-strings (dictionary), error-messages (dictionary), onboarding (collection) | Mobile app |

## Model Tools

### contentrain_model_save

Create or update a model definition (upsert).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Kebab-case model ID |
| `name` | string | Yes | Human-readable display name |
| `kind` | string | Yes | `singleton`, `collection`, `document`, `dictionary` |
| `domain` | string | Yes | Organizational group |
| `i18n` | boolean | Yes | Whether model supports localization |
| `fields` | object | No | Field definitions (not for dictionary) |
| `description` | string | No | Model description |
| `content_path` | string | No | Framework-relative path for content files |
| `locale_strategy` | string | No | `"file"` (default), `"suffix"`, `"directory"`, `"none"` |

Notes:
- Upserts by model ID: existing model is updated, new model is created
- `locale_strategy: "none"` requires `i18n: false`
- `content_path` overrides default `.contentrain/content/` location

### contentrain_model_delete

Delete a model and its content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID to delete |
| `confirm` | boolean | Yes | Must be `true` |

Performs referential integrity check before deletion. If other models reference the target model via `relation` or `relations` fields, deletion is **BLOCKED**. Remove the referencing fields first.

## Content Tools

### contentrain_content_save

Create or update content entries (upsert).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Target model ID |
| `entries` | array | Yes | Array of entry objects |

#### Entry Format

Each entry in the `entries` array:

```json
{
  "id": "optional-entry-id",
  "slug": "optional-slug",
  "locale": "en",
  "data": { "field_name": "field_value" }
}
```

**Per kind:**

| Kind | Required Fields | Notes |
|------|----------------|-------|
| **Collection** | `locale`, `data` | Provide `id` to update, omit for new (auto-generated) |
| **Document** | `slug`, `locale`, `data` | `slug` is required. Include `"body"` in `data` for markdown content |
| **Singleton** | `locale`, `data` | No `id` or `slug` needed |
| **Dictionary** | `locale`, `data` | `data` is flat key-value: `{ "auth.login": "Log In" }` |

**NEVER include system fields** (`status`, `source`, `updated_by`, `updated_at`, `createdAt`, `updatedAt`) in `data`.

### contentrain_content_delete

Delete a content entry.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID |
| `id` | string | Conditional | Entry ID (for collections) |
| `slug` | string | Conditional | Document slug (for documents) |
| `locale` | string | Conditional | Locale (for singleton/dictionary) |
| `confirm` | boolean | Yes | Must be `true` |

### contentrain_content_list

List content entries for a model (read-only).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model ID |
| `locale` | string | No | Locale filter |
| `filter` | object | No | Field-based filter |
| `resolve` | boolean | No | Resolve relations |
| `limit` | number | No | Max entries to return |
| `offset` | number | No | Pagination offset |

## Normalize Tools

### contentrain_scan

Scan project for structure or content candidates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | No | `"candidates"` (default), `"graph"`, `"summary"` |
| `paths` | string[] | No | Directories to scan (auto-detected if omitted) |
| `include` | string[] | No | File extensions (default: .tsx, .jsx, .vue, .ts, .js, .mjs, .astro, .svelte) |
| `exclude` | string[] | No | Additional directories to exclude |
| `limit` | number | No | Batch size for candidates mode (default: 50) |
| `offset` | number | No | Pagination offset for candidates mode |
| `min_length` | number | No | Min string length filter |
| `max_length` | number | No | Max string length filter |

#### Scan Modes

| Mode | Output | Purpose |
|------|--------|---------|
| `graph` | Import/component dependency graph with string counts | Understand project structure, prioritize files |
| `candidates` | Hardcoded string candidates with file locations, context | Find content to extract (paginated) |
| `summary` | High-level stats by directory, top repeated strings | Quick project overview |

Candidates mode supports pagination via `offset` and `limit`. Response includes `stats.has_more`.

### contentrain_apply

Apply normalize operation (extract or reuse).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mode` | string | Yes | `"extract"` or `"reuse"` |
| `dry_run` | boolean | No | Preview without executing (default: `true`) |
| `extractions` | array | Conditional | For extract mode |
| `scope` | object | Conditional | For reuse mode (requires `model` or `domain`) |
| `patches` | array | Conditional | For reuse mode (max 100 per call) |

#### Extract Mode

```json
{
  "mode": "extract",
  "dry_run": true,
  "extractions": [
    {
      "model": "ui-texts",
      "kind": "dictionary",
      "domain": "system",
      "i18n": true,
      "fields": {},
      "entries": [
        {
          "locale": "en",
          "data": { "nav.home": "Home" },
          "source": { "file": "src/Nav.vue", "line": 5, "value": "Home" }
        }
      ]
    }
  ]
}
```

#### Reuse Mode

```json
{
  "mode": "reuse",
  "dry_run": true,
  "scope": { "model": "ui-texts" },
  "patches": [
    {
      "file": "src/Nav.vue",
      "line": 5,
      "old_value": "Home",
      "new_expression": "{{ $t('nav.home') }}",
      "import_statement": ""
    }
  ]
}
```

- `dry_run` defaults to `true`. ALWAYS preview first, then `dry_run: false` to execute
- `scope` requires at least one of `model` or `domain`
- `patches` max: 100 per call

## Workflow Tools

### contentrain_validate

Validate project content against model schemas.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | No | Validate specific model only (omit for all) |
| `fix` | boolean | No | Auto-fix structural issues (canonical sort, orphan meta, missing locale files). Default: `false` |

### contentrain_submit

Push contentrain/* branches to remote.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `branches` | string[] | No | Specific branches to push (omit for all contentrain/* branches) |
| `message` | string | No | Optional message for the push operation |

## Bulk Tools

### contentrain_bulk

Run git-backed batch operations on existing content entries.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | `"copy_locale"`, `"update_status"`, `"delete_entries"` |
| `model` | string | Yes | Target model ID |
| `source_locale` | string | Conditional | For `copy_locale` |
| `target_locale` | string | Conditional | For `copy_locale` |
| `entry_ids` | string[] | Conditional | For `update_status` and `delete_entries` |
| `status` | string | Conditional | For `update_status` |
| `confirm` | boolean | Conditional | For `delete_entries` (must be `true`) |

#### Operations

| Operation | Applicable Kinds | Required Params |
|-----------|-----------------|-----------------|
| `copy_locale` | collection, singleton, dictionary (i18n only) | `source_locale`, `target_locale` |
| `update_status` | collection only | `entry_ids`, `status` |
| `delete_entries` | collection only | `entry_ids`, `confirm: true` |

#### Rules

- ALWAYS verify the target model with `contentrain_describe` or `contentrain_status` before running bulk
- `copy_locale` MUST NOT be used on non-i18n models
- Bulk operations create branches and commits like other write tools
- Validate afterward when content shape may have changed
