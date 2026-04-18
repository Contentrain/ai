# `@contentrain/types`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Ftypes?label=%40contentrain%2Ftypes)](https://www.npmjs.com/package/@contentrain/types)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/types)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/reference/config)

Shared TypeScript types for the Contentrain ecosystem.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [Config and format reference](https://ai.contentrain.io/reference/config)

This package is the common schema layer used by:

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/rules`

It defines the stable type vocabulary for models, config, metadata, validation, scanning, context files, and provider contracts (enabling third-party RepoProvider implementations).

## When To Use It

Use `@contentrain/types` when you are:

- building tooling on top of Contentrain packages
- sharing model/config types between packages in a workspace
- authoring framework integrations or SDK extensions
- consuming Contentrain JSON structures directly in TypeScript
- implementing a custom `RepoProvider` for a new git backend

## Install

```bash
pnpm add @contentrain/types
```

## What It Exports

Core unions:

- `FieldType`
- `ModelKind`
- `ContentStatus`
- `ContentSource`
- `WorkflowMode`
- `StackType`
- `Platform`
- `ContextSource`
- `CollectionRuntimeFormat`
- `LocaleStrategy`

Core interfaces:

- `FieldDef`
- `ModelDefinition`
- `ModelSummary`
- `ContentrainConfig`
- `Vocabulary`
- `EntryMeta`
- `AssetEntry`
- `ValidationError`
- `ValidationResult`
- `ScaffoldTemplate`
- `ScanCandidate`
- `DuplicateGroup`
- `GraphNode`
- `ProjectGraph`
- `ScanCandidatesResult`
- `ScanSummaryResult`
- `ContextJson`

Storage/runtime helper types:

- `SingletonContentFile`
- `CollectionContentFile`
- `DictionaryContentFile`
- `CollectionEntry`
- `CollectionContentOutput`
- `DocumentEntry`
- `DocumentContentOutput`
- `SingletonMeta`
- `CollectionMeta`
- `DocumentMeta`
- `DictionaryMeta`

Normalize/plan types:

- `NormalizePlan`
- `NormalizePlanModel`
- `NormalizePlanExtraction`
- `NormalizePlanPatch`

Provider contracts (re-exported from `provider.ts` — implement these to add a new git backend):

- `RepoProvider`
- `RepoReader`
- `RepoWriter`
- `ProviderCapabilities`
- `FileChange`
- `CommitAuthor`
- `Commit`
- `ApplyPlanInput`
- `Branch`
- `FileDiff`
- `MergeResult` (includes optional `sync?: SyncResult` for local-worktree providers)
- `LOCAL_CAPABILITIES` (const — capability set for LocalProvider)

Git transaction types:

- `SyncResult`
- `ContentrainError`

Validate functions (pure, dependency-free):

- `validateSlug(slug)` — kebab-case slug validation
- `validateEntryId(id)` — entry ID format validation
- `validateLocale(locale, config)` — locale format + config support check
- `detectSecrets(value)` — detect potential secrets in field values
- `validateFieldValue(value, fieldDef)` — full field schema validation (type, required, min/max, pattern, select)

Serialize functions (pure, dependency-free):

- `sortKeys(obj, fieldOrder?)` — recursive key sorting for canonical output
- `canonicalStringify(data, fieldOrder?)` — deterministic JSON serialization
- `generateEntryId()` — 12-char hex ID generation
- `parseMarkdownFrontmatter(content)` — parse YAML frontmatter + body from markdown
- `serializeMarkdownFrontmatter(data, body)` — serialize data + body into markdown frontmatter

Constants:

- `CONTENTRAIN_DIR` — default `.contentrain` folder name
- `CONTENTRAIN_BRANCH` — default `contentrain` branch name for content tracking
- `PATH_PATTERNS` — file path conventions for models, content, meta
- `SLUG_PATTERN` — regex for valid slugs
- `ENTRY_ID_PATTERN` — regex for valid entry IDs
- `LOCALE_PATTERN` — regex for valid locale codes
- `CANONICAL_JSON` — serialization rules (indent, encoding, trailing newline, key sort)
- `SECRET_PATTERNS` — regex patterns for secret detection

## Stability

This package is intended to be the shared public contract across the Contentrain ecosystem.

In practice that means:

- types exported from the package root are the public surface
- packages should depend on these shared definitions instead of redefining domain types
- breaking changes here should be treated as ecosystem-level breaking changes
- the `RepoProvider` contract enables third-party implementations without depending on `@contentrain/mcp` internals

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

## Import Style

Type-only usage:

```ts
import type { ModelDefinition, ContentrainConfig } from '@contentrain/types'
```

Mixed usage (types + runtime functions):

```ts
import type { FieldDef, ValidationError } from '@contentrain/types'
import {
  validateFieldValue,
  validateSlug,
  detectSecrets,
  canonicalStringify,
  parseMarkdownFrontmatter,
} from '@contentrain/types'
```

Provider contract usage (for custom RepoProvider implementations):

```ts
import type { RepoProvider, ProviderCapabilities } from '@contentrain/types'

export class MyCustomProvider implements RepoProvider {
  readonly capabilities: ProviderCapabilities = {
    localWorktree: false,
    sourceRead: true,
    sourceWrite: true,
    pushRemote: true,
    branchProtection: true,
    pullRequestFallback: true,
    astScan: false,
  }
  // ...implement RepoProvider methods
}
```

## Studio Integration

Studio (Nuxt 4, web) cannot import `@contentrain/mcp` directly because MCP depends on Node.js-only packages (`simple-git`, `@modelcontextprotocol/sdk`). The validate and serialize functions in this package are **pure, dependency-free, and browser-compatible** — designed for Studio to share the same validation contract as MCP.

### What Studio gets from `@contentrain/types`

| Function | Use case |
|---|---|
| `validateSlug(slug)` | Form validation for document slugs |
| `validateEntryId(id)` | Validate collection entry IDs |
| `validateLocale(locale, config)` | Locale picker validation |
| `detectSecrets(value)` | Content editor secret detection warnings |
| `validateFieldValue(value, fieldDef)` | Full field-level validation in content forms |
| `canonicalStringify(data, fieldOrder?)` | Preview canonical JSON output |
| `parseMarkdownFrontmatter(content)` | Document editor frontmatter parsing |
| `serializeMarkdownFrontmatter(data, body)` | Document editor serialization |
| `generateEntryId()` | Client-side entry ID generation |
| `SECRET_PATTERNS` | Extend or customize secret detection |

### What stays in MCP (not available to Studio directly)

These require file system I/O or Node.js dependencies:

- `checkRelation()` — validates relation references against actual content files on disk
- `validateProject()` — full project validation with file reading
- `writeContent()` / `deleteContent()` — content persistence with git worktree
- `resolveContentDir()` / `resolveJsonFilePath()` — path resolution with `node:path`

### Unique constraints and relation validation

`validateFieldValue` handles schema-level checks. Two things require external state:

- **Unique constraints** — need to check across all entries (Studio should query its API/store)
- **Relation references** — need to verify target entries exist (Studio should query its content API)

These are left to Studio's server-side or API layer to implement on top of the pure validation.

## Design Role

`@contentrain/types` exists so every package in the monorepo speaks the same domain language.

Examples:

- MCP validates and writes `ModelDefinition`
- CLI reads `ContextJson`
- SDK codegen consumes `ModelDefinition` and `FieldDef`
- AI rules align with the same model and workflow vocabulary
- Studio uses the same validation functions in the browser
- Third-party providers implement `RepoProvider` to plug into MCP

This package should stay:

- small
- zero runtime dependencies
- browser + Node.js compatible
- stable
- free of package-specific behavior

## Development

From the monorepo root:

```bash
pnpm --filter @contentrain/types build
pnpm --filter @contentrain/types test
pnpm --filter @contentrain/types typecheck
```

## Related Packages

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/rules`

## License

MIT
