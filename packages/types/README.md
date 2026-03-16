# `@contentrain/types`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Ftypes?label=%40contentrain%2Ftypes)](https://www.npmjs.com/package/@contentrain/types)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/types)

Shared TypeScript types for the Contentrain ecosystem.

This package is the common schema layer used by:

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/rules`

It defines the stable type vocabulary for models, config, metadata, validation, scanning, and context files.

## ✨ When To Use It

Use `@contentrain/types` when you are:

- building tooling on top of Contentrain packages
- sharing model/config types between packages in a workspace
- authoring framework integrations or SDK extensions
- consuming Contentrain JSON structures directly in TypeScript

## 🚀 Install

```bash
pnpm add @contentrain/types
```

## 📦 What It Exports

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
- `SingletonMeta`
- `CollectionMeta`
- `DocumentMeta`
- `DictionaryMeta`

## 🧭 Stability

This package is intended to be the shared public contract across the Contentrain ecosystem.

In practice that means:

- types exported from the package root are the public surface
- packages should depend on these shared definitions instead of redefining domain types
- breaking changes here should be treated as ecosystem-level breaking changes

## 🧪 Quick Example

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

## 📝 Import Style

Type-only usage:

```ts
import type { ModelDefinition, ContentrainConfig } from '@contentrain/types'
```

Runtime-safe mixed usage:

```ts
import type { FieldDef } from '@contentrain/types'
```

## 🧠 Design Role

`@contentrain/types` exists so every package in the monorepo speaks the same domain language.

Examples:

- MCP validates and writes `ModelDefinition`
- CLI reads `ContextJson`
- SDK codegen consumes `ModelDefinition` and `FieldDef`
- AI rules align with the same model and workflow vocabulary

This package should stay:

- small
- dependency-light
- stable
- free of package-specific behavior

## 🛠 Development

From the monorepo root:

```bash
pnpm --filter @contentrain/types build
pnpm --filter @contentrain/types test
pnpm --filter @contentrain/types typecheck
```

## 🔗 Related Packages

- `@contentrain/mcp`
- `contentrain`
- `@contentrain/query`
- `@contentrain/rules`

## 📄 License

MIT
