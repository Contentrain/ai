---
title: Types
description: Complete reference for @contentrain/types — the shared TypeScript type vocabulary used by every package in the Contentrain ecosystem
order: 5
slug: types
---

# Types

[![npm version](https://img.shields.io/npm/v/@contentrain/types)](https://www.npmjs.com/package/@contentrain/types) [![npm downloads](https://img.shields.io/npm/dm/@contentrain/types)](https://www.npmjs.com/package/@contentrain/types)

`@contentrain/types` is the shared type contract for the Contentrain ecosystem. Every package — MCP, CLI, SDK, Rules — imports its domain types from here instead of redefining them. If you are building tooling on top of Contentrain or authoring a framework integration, this is the package you depend on.

## Why a Shared Types Package?

Without a single source of truth, each package would define its own `ModelDefinition`, `FieldDef`, or `ContentrainConfig` — and they would inevitably drift. `@contentrain/types` ensures:

- **One vocabulary** — every package speaks the same domain language
- **Breaking changes are visible** — a type change here is an ecosystem-level change
- **Zero runtime cost** — most exports are `type`-only, tree-shaken away in production

::: tip Ecosystem Role
- **MCP** validates and writes `ModelDefinition`
- **CLI** reads `ContentrainConfig` and `ContextJson`
- **SDK codegen** consumes `ModelDefinition` and `FieldDef`
- **Rules** align with the same model and workflow vocabulary
- **[Contentrain Studio](/studio)** operates on the same type contract — schemas defined locally work identically in team workflows
:::

## Install

```bash
pnpm add @contentrain/types
```

For type-only usage (no runtime exports needed):

```bash
pnpm add -D @contentrain/types
```

Requirements:
- Node.js 22+
- TypeScript 5.0+

## Quick Example

```ts
import type {
  ContentrainConfig,
  FieldDef,
  ModelDefinition,
  ValidationResult,
} from '@contentrain/types'

const fields: Record<string, FieldDef> = {
  title: { type: 'string', required: true },
  slug: { type: 'slug', required: true, unique: true },
}

const model: ModelDefinition = {
  id: 'blog-post',
  name: 'Blog Post',
  kind: 'collection',
  domain: 'blog',
  i18n: true,
  fields,
}

const config: ContentrainConfig = {
  version: 1,
  stack: 'next',
  workflow: 'review',
  locales: { default: 'en', supported: ['en', 'tr'] },
  domains: ['blog'],
}

const result: ValidationResult = {
  valid: true,
  errors: [],
}
```

## Export Catalog

### Core Unions

| Type | Values | Reference |
|------|--------|-----------|
| `FieldType` | 27 field types (`string`, `number`, `boolean`, `relation`, ...) | [Field Types](/reference/field-types) |
| `ModelKind` | `singleton`, `collection`, `document`, `dictionary` | [Model Kinds](/reference/model-kinds) |
| `ContentStatus` | `draft`, `in_review`, `published`, `rejected`, `archived` | |
| `ContentSource` | `agent`, `human`, `import` | |
| `WorkflowMode` | `auto-merge`, `review` | [Configuration](/reference/config) |
| `StackType` | `nuxt`, `next`, `astro`, `sveltekit`, `remix`, + 20 more | [Configuration](/reference/config) |
| `Platform` | `web`, `mobile`, `api`, `desktop`, `static`, `other` | |
| `ContextSource` | `mcp-local`, `mcp-studio`, `studio-ui` | |
| `CollectionRuntimeFormat` | `map`, `array` | |
| `LocaleStrategy` | `file`, `suffix`, `directory`, `none` | |
| `FileFramework` | `vue`, `svelte`, `jsx`, `astro`, `script` | |

### Core Interfaces

| Interface | Purpose |
|-----------|---------|
| `FieldDef` | Field schema definition (type, required, unique, constraints) |
| `ModelDefinition` | Full model schema (id, kind, domain, fields, i18n, locale strategy) |
| `ContentrainConfig` | Project configuration (stack, workflow, locales, domains) |
| `Vocabulary` | Shared terms for content consistency |
| `EntryMeta` | Per-entry metadata (status, source, timestamps) |
| `AssetEntry` | Asset registry entry (path, type, size, alt) |
| `ValidationError` | Structured validation error with severity and context |
| `ValidationResult` | Validation outcome (valid flag + error list) |
| `ContextJson` | Last operation context written by MCP |
| `ModelSummary` | Lightweight model info for listing operations |

### Provider Contract Types

Third-party developers can implement custom providers by implementing these interfaces:

| Interface / Type | Purpose |
|-----------|---------|
| `RepoProvider` | Full provider contract: read, write, branch, merge, diff operations |
| `RepoReader` | Read-only interface (readFile, listDirectory, fileExists) |
| `RepoWriter` | Write interface (applyPlan for atomic commits) |
| `ProviderCapabilities` | Capability flags (localWorktree, sourceRead, sourceWrite, pushRemote, branchProtection, pullRequestFallback, astScan) |
| `FileChange` | A single file addition, modification, or deletion (`{ path, content: string \| null }`) |
| `ApplyPlanInput` | Input for a single atomic commit (branch, changes, message, author, optional base) |
| `Commit` | Result of a commit operation (sha, message, author, timestamp) |
| `Branch` | Git branch metadata (name, sha, protected) |
| `FileDiff` | File change within a plan (path, status, before, after) |
| `MergeResult` | Merge outcome (merged flag, sha, pullRequestUrl, optional `sync?: SyncResult` for LocalProvider) |
| `SyncResult` | Selective file sync result (synced, skipped, optional warning) |
| `CommitAuthor` | Commit author metadata (name, email) |

Pre-built capability set:

- `LOCAL_CAPABILITIES` — Full capability set for LocalProvider (all seven capabilities enabled). Exported from `@contentrain/types` for custom providers that back onto the local filesystem.

See [RepoProvider Reference](/reference/providers) for the complete interface definitions and a minimum-viable provider recipe.

### Storage Types

These types define the canonical JSON structure for each model kind on disk:

| Type | Model Kind | Shape |
|------|-----------|-------|
| `SingletonContentFile` | Singleton | `Record<string, unknown>` |
| `CollectionContentFile` | Collection | `Record<string, Record<string, unknown>>` (object-map by entry ID) |
| `DictionaryContentFile` | Dictionary | `Record<string, string>` (flat key-value, all strings) |

### Output Types

How MCP and SDK return content to consumers (different from storage format):

| Type | Description |
|------|-------------|
| `CollectionEntry` | `{ id: string } & Record<string, unknown>` |
| `CollectionContentOutput` | `CollectionEntry[]` (array format) |
| `DocumentEntry` | `{ slug, frontmatter, body }` — parsed markdown |
| `DocumentContentOutput` | `DocumentEntry[]` |
| `PolymorphicRelationRef` | `{ model, ref }` — cross-model relation storage |

### Metadata Types

| Type | Description |
|------|-------------|
| `SingletonMeta` | Alias for `EntryMeta` |
| `CollectionMeta` | `Record<string, EntryMeta>` — per-entry metadata map |
| `DocumentMeta` | Alias for `EntryMeta` |
| `DictionaryMeta` | Alias for `EntryMeta` |

### Scan & Graph Types

Used by the normalize flow (scan, extract, reuse):

| Type | Purpose |
|------|---------|
| `ScanCandidate` | Hardcoded string candidate with file, line, column, context |
| `DuplicateGroup` | Group of repeated strings with occurrence locations |
| `GraphNode` | File node in the project graph (category, imports, strings) |
| `ProjectGraph` | Full project structure graph (pages, components, layouts) |
| `ScanCandidatesResult` | Scan output with candidates, duplicates, and stats |
| `ScanSummaryResult` | High-level scan summary (directory breakdown, top repeated) |
| `StringContext` | Where a string appears (`jsx_text`, `template_attribute`, ...) |
| `FileCategory` | File classification (`page`, `component`, `layout`, `other`) |

### Runtime Constants

These are the only non-type exports — used at runtime for path resolution and validation:

```ts
import {
  CONTENTRAIN_DIR,       // '.contentrain'
  CONTENTRAIN_BRANCH,    // 'contentrain'
  PATH_PATTERNS,         // Canonical file path patterns
  SLUG_PATTERN,          // /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  ENTRY_ID_PATTERN,      // /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
  LOCALE_PATTERN,        // /^[a-z]{2}(?:-[A-Z]{2})?$/
  CANONICAL_JSON,        // { indent: 2, encoding: 'utf-8', ... }
} from '@contentrain/types'
```

| Constant | Value | Purpose |
|----------|-------|---------|
| `CONTENTRAIN_DIR` | `'.contentrain'` | Root directory name |
| `CONTENTRAIN_BRANCH` | `'contentrain'` | Dedicated content branch name |
| `PATH_PATTERNS` | Object | Canonical paths for config, models, content, meta |
| `SLUG_PATTERN` | RegExp | Validates slug format |
| `ENTRY_ID_PATTERN` | RegExp | Validates entry IDs |
| `LOCALE_PATTERN` | RegExp | Validates ISO locale codes |
| `CANONICAL_JSON` | Object | Deterministic serialization rules |

### Git Transaction Types

| Type | Purpose |
|------|---------|
| `SyncResult` | Result of selective file sync (synced files, skipped files, warning) |
| `ContentrainError` | Structured error with code, message, agent hint, and developer action |
| `ScaffoldTemplate` | Template definition for project scaffolding |

## Import Style

Type-only imports (recommended for application code):

```ts
import type { ModelDefinition, ContentrainConfig, FieldDef } from '@contentrain/types'
```

Runtime imports (when you need constants):

```ts
import { PATH_PATTERNS, CANONICAL_JSON, CONTENTRAIN_DIR } from '@contentrain/types'
```

## Stability

This package is the shared public contract across the ecosystem:

- Types exported from the package root are the **public surface**
- Packages depend on these shared definitions instead of redefining domain types
- Breaking changes here are **ecosystem-level breaking changes**
- The package should stay small, dependency-light, and stable

## Development

From the monorepo root:

```bash
pnpm --filter @contentrain/types build
pnpm --filter @contentrain/types test
pnpm --filter @contentrain/types typecheck
```

## Related Pages

- [MCP Tools](/packages/mcp) — Validates and writes models using these types
- [CLI](/packages/cli) — Reads config and context using these types
- [Query SDK](/packages/sdk) — Codegen consumes model definitions and field types
- [Rules & Skills](/packages/rules) — Aligns with the same vocabulary
- [Model Kinds](/reference/model-kinds) — Detailed specification of the four model kinds
- [Field Types](/reference/field-types) — Comprehensive field type reference
- [Configuration](/reference/config) — Config file schemas and directory layout
