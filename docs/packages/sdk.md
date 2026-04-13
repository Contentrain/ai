---
title: Query SDK
description: Complete reference for @contentrain/query — the Prisma-pattern generated client that turns your content models into type-safe JavaScript queries
order: 3
slug: sdk
---

# Query SDK

[![npm version](https://img.shields.io/npm/v/@contentrain/query)](https://www.npmjs.com/package/@contentrain/query) [![npm downloads](https://img.shields.io/npm/dm/@contentrain/query)](https://www.npmjs.com/package/@contentrain/query)

`@contentrain/query` is an **optional** TypeScript convenience layer for consuming Contentrain content. It generates a fully typed client from your model definitions — think Prisma, but for content.

::: tip SDK is optional
Contentrain stores content as plain JSON and Markdown. Any language that reads JSON (Go, Python, Swift, Kotlin, Rust) can consume your content directly. The SDK adds type safety, query API, and relation resolution for TypeScript projects.
:::

## Why a Generated Client?

You could read `.contentrain/content/` files directly — and for non-TypeScript platforms, that's exactly what you should do. But for TypeScript projects, raw file reads give you:

- No TypeScript types
- No query API (filtering, sorting, pagination)
- No relation resolution
- No locale-aware data loading
- Manual JSON parsing for every model

The generated client solves all of this with zero runtime dependencies and exact types from your model schemas.

::: tip Prisma Pattern
`contentrain generate` reads your models and writes a typed client to `.contentrain/client/`. You import it via `#contentrain` — Node.js native subpath imports, no plugin magic.
:::

## Install

```bash
pnpm add @contentrain/query
```

Requirements:
- Node.js 22+
- A Contentrain project with `.contentrain/config.json`

## Quick Start

```bash
# Generate the client
npx contentrain generate
```

This writes:

```
.contentrain/client/
  index.mjs          — ESM entry (query runtime + re-exports)
  index.cjs          — CJS entry (NestJS, Express, legacy tooling)
  index.d.ts         — Generated TypeScript types from model schemas
  data/
    {model}.{locale}.mjs   — Static data modules per model/locale
```

It also updates your `package.json` with subpath imports:

```json
{
  "imports": {
    "#contentrain": {
      "types": "./.contentrain/client/index.d.ts",
      "import": "./.contentrain/client/index.mjs",
      "require": "./.contentrain/client/index.cjs",
      "default": "./.contentrain/client/index.mjs"
    }
  }
}
```

Then import and query:

```ts
import { query, singleton, dictionary, document } from '#contentrain'

const posts = query('blog-post').locale('en').where('status', 'published').all()
const hero = singleton('hero').locale('en').get()
const labels = dictionary('ui-labels').locale('en').get()
const article = document('blog-article').locale('en').bySlug('welcome')
```

## Studio Bridge

`@contentrain/query` is the local typed read surface for TypeScript apps. Studio extends the same content contract into remote delivery workflows:

- local apps can import `#contentrain` for generated, type-safe reads
- Studio adds API keys, CDN publishing, media distribution, and team-facing delivery controls
- both sides should point back to the same model definitions and locale structure

Use [Ecosystem Map](/ecosystem) for the package relationship, and use Studio docs when the same content needs remote delivery:

- [Contentrain Studio](/studio)
- [Studio CDN](https://docs.contentrain.io/guide/cdn)
- [Studio Ecosystem Map](https://docs.contentrain.io/guide/ecosystem)

## API Reference

The generated client exposes four entry points, one for each model kind.

### QueryBuilder — Collections

For collection models (multiple entries, object-map storage).

```ts
import { query } from '#contentrain'

// Full API chain
const posts = query('blog-post')
  .locale('en')                 // Set locale
  .where('status', 'published') // Exact match filter
  .sort('date', 'desc')         // Sort by field, optional order
  .limit(10)                    // Limit results
  .offset(5)                    // Skip results (pagination)
  .include('author', 'tags')    // Resolve relation fields (1 level deep)
  .all()                        // Returns T[]

// Get first match
const latest = query('blog-post')
  .locale('en')
  .sort('date', 'desc')
  .first()                      // Returns T | undefined
```

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `locale` | `locale(lang: string)` | `this` | Set the content locale |
| `where` | `where(field, value)` | `this` | Equality filter (shorthand for `eq`) |
| `where` | `where(field, op, value)` | `this` | Operator filter: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains` |
| `sort` | `sort(field, order?)` | `this` | Sort by field, order is `'asc'` or `'desc'` |
| `limit` | `limit(n: number)` | `this` | Limit number of results |
| `offset` | `offset(n: number)` | `this` | Skip first N results |
| `include` | `include(...fields)` | `this` | Resolve relation fields |
| `count` | `count()` | `number` | Return count of matching entries |
| `all` | `all()` | `T[]` | Execute query, return all matches |
| `first` | `first()` | `T \| undefined` | Execute query, return first match |

Where operator examples:

```ts
query('plans').where('slug', 'ne', 'free').all()
query('plans').where('price', 'gte', 10).where('price', 'lte', 50).all()
query('starters').where('framework', 'in', ['nuxt', 'next']).all()
query('blog').where('title', 'contains', 'Guide').count()
```

### SingletonAccessor — Singletons

For singleton models (single entry, e.g. site settings, hero section).

```ts
import { singleton } from '#contentrain'

const hero = singleton('hero')
  .locale('en')
  .include('featured_post')     // Resolve relations on singletons too
  .get()                        // Returns T
```

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `locale` | `locale(lang: string)` | `this` | Set the content locale |
| `include` | `include(...fields)` | `this` | Resolve relation fields |
| `get` | `get()` | `T` | Get the singleton entry |

### DictionaryAccessor — Dictionaries

For dictionary models (flat key-value string maps, ideal for i18n).

```ts
import { dictionary } from '#contentrain'

// Get all key-value pairs
const allLabels = dictionary('ui-labels')
  .locale('en')
  .get()                        // Returns Record<string, string>

// Get a single value by key
const label = dictionary('ui-labels')
  .locale('en')
  .get('submit_button')         // Returns string | undefined

// Parameterized templates
const message = dictionary('ui-labels')
  .locale('en')
  .get('add-entry', { model: 'blog' })
  // Value: "Add a new entry to {model}"
  // Returns: "Add a new entry to blog"
```

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `locale` | `locale(lang: string)` | `this` | Set the content locale |
| `get` | `get()` | `Record<string, string>` | Get all key-value pairs |
| `get` | `get(key)` | `string \| undefined` | Get a single value by key |
| `get` | `get(key, params)` | `string` | Get value with `{placeholder}` replacement |

::: info Parameterized Templates
Dictionary values can contain `{placeholder}` syntax. The `get(key, params)` overload replaces matched placeholders with provided values. Unmatched placeholders are left as-is.
:::

### DocumentQuery — Documents

For document models (markdown files with frontmatter).

```ts
import { document } from '#contentrain'

// Find by slug
const article = document('blog-article')
  .locale('en')
  .include('author')            // Resolve relations in frontmatter
  .bySlug('getting-started')    // Returns T | undefined

// Query with filters
const techDocs = document('doc-page')
  .locale('en')
  .where('category', 'tech')
  .all()                        // Returns T[]

// Get first match
const latest = document('blog-article')
  .locale('en')
  .first()                      // Returns T | undefined
```

| Method | Signature | Returns | Description |
|--------|-----------|---------|-------------|
| `locale` | `locale(lang: string)` | `this` | Set the content locale |
| `where` | `where(field, value)` | `this` | Equality filter (shorthand) |
| `where` | `where(field, op, value)` | `this` | Operator filter (same operators as QueryBuilder) |
| `include` | `include(...fields)` | `this` | Resolve relation fields |
| `bySlug` | `bySlug(slug)` | `T \| undefined` | Find document by slug |
| `count` | `count()` | `number` | Return count of matching documents |
| `all` | `all()` | `T[]` | Execute query, return all matches |
| `first` | `first()` | `T \| undefined` | Execute query, return first match |

## Relations

All model kinds support relation resolution via `.include()`:

```ts
// Without include: raw relation ID
const raw = query('blog-post').locale('en').all()
// raw[0].author --> 'author-id-123' (string ID)

// With include: resolved object
const resolved = query('blog-post').locale('en').include('author', 'tags').all()
// resolved[0].author --> { id: '...', name: 'John', ... } (full object)
```

Relations are resolved 1 level deep. Nested relations are not expanded.

## Framework Setup

The `#contentrain` subpath import works natively in Node.js 22+. For browser bundlers, you need an alias.

::: code-group

```ts [Vite (Vue, React, Svelte, Astro)]
// vite.config.ts
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '#contentrain': resolve(__dirname, '.contentrain/client/index.mjs'),
    },
  },
})
```

```js [Next.js (webpack)]
// next.config.js
const path = require('path')

module.exports = {
  webpack: (config) => {
    config.resolve.alias['#contentrain'] =
      path.resolve(__dirname, '.contentrain/client/index.mjs')
    return config
  },
}
```

```ts [Nuxt 3]
// nuxt.config.ts
export default defineNuxtConfig({
  alias: {
    '#contentrain': './.contentrain/client/index.mjs',
  },
})
```

```ts [SvelteKit]
// vite.config.ts (SvelteKit uses Vite internally)
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '#contentrain': resolve(__dirname, '.contentrain/client/index.mjs'),
    },
  },
})
```

```js [Expo / React Native (Metro)]
// metro.config.js
const path = require('path')

module.exports = {
  resolver: {
    extraNodeModules: {
      '#contentrain': path.resolve(__dirname, '.contentrain/client/index.mjs'),
    },
  },
}
```

```bash [Node.js / SSR-only]
# No alias needed!
# Node.js 22+ resolves #contentrain from package.json imports natively.
```

:::

For all bundler setups, also add a `paths` entry to `tsconfig.json` so the TypeScript language server resolves the alias:

```json
{
  "compilerOptions": {
    "paths": {
      "#contentrain": ["./.contentrain/client/index.d.ts"]
    }
  }
}
```

## Framework Usage Patterns

| Framework | Pattern | Example |
|-----------|---------|--------|
| Nuxt 3 | `useAsyncData` | `useAsyncData(() => singleton('hero').locale(locale).get())` |
| Next.js RSC | Direct call in server component | `const data = singleton('hero').locale('en').get()` |
| Astro | Frontmatter | `const posts = query('blog-post').locale('en').all()` |
| SvelteKit | `+page.server.ts` load | `export const load = () => ({ hero: singleton('hero').locale('en').get() })` |
| Expo / RN | Direct call | `const hero = singleton('hero').locale('en').get()` |
| Node.js | Direct import | `import { query } from '#contentrain'` |

## TypeScript Types

The generator produces exact TypeScript interfaces from your model schemas. For a model with fields `title: string`, `order: integer`, `published: boolean`:

```ts
// Generated in .contentrain/client/index.d.ts
export interface BlogPost {
  id: string
  title: string
  order: number
  published: boolean
}

// query('blog-post') returns QueryBuilder<BlogPost>
// Fully typed: .where() only accepts BlogPost field names
```

## CommonJS Usage

For legacy environments (NestJS, Express, older tooling):

```js
const clientModule = require('#contentrain')
const client = await clientModule.init()

const hero = client.singleton('hero').get()
```

## DOES NOT EXIST

Common mistakes to avoid:

::: danger These APIs do not exist
- `.filter()` — use `.where(field, value)` or `.where(field, op, value)` instead
- `.byId()` — use `.where('id', value).first()` instead
- `dictionary().all()` — use `.get()` instead
- `await query(...)` — local queries are **synchronous**, do not use `await`
- `.get()` on QueryBuilder — use `.all()` or `.first()`
:::

## CDN Transport

For apps that fetch content from Contentrain Studio CDN instead of local files:

```ts
import { createContentrain } from '@contentrain/query/cdn'

const client = createContentrain({
  projectId: '350696e8-...',
  apiKey: 'crn_live_xxx',
})

// All CDN queries return Promises
const posts = await client.collection('faq').locale('en').all()
const hero  = await client.singleton('hero').locale('en').get()
const t     = await client.dictionary('ui').locale('en').get()
const doc   = await client.document('docs').locale('en').bySlug('intro')
```

### CDN Collection Operators

```ts
await client.collection('products')
  .locale('en')
  .where('price', 'lt', 100)
  .where('category', 'in', ['electronics', 'accessories'])
  .sort('price', 'asc')
  .limit(20)
  .all()
```

Supported operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`.

### CDN Entry Metadata

Enrich collection entries with status, publish/expire dates:

```ts
const posts = await client.collection('blog')
  .locale('en')
  .withMeta()
  .all()
// posts[0]._meta → { status: 'published', publish_at: '...', expire_at: '...' }
```

### CDN Media

Access the media asset manifest and resolve variant URLs:

```ts
const media = client.media()
const assets = await media.list()           // All assets with path + meta
const asset  = await media.asset('hero.jpg') // Single asset
const url    = media.url(asset, 'thumb')    // Full CDN variant URL

asset.meta.width      // 1920
asset.meta.blurhash   // 'LEHV6nWB...'
asset.meta.alt        // 'Hero image'
```

### CDN Forms

Fetch form schema and submit data from external sites:

```ts
const form = client.form()
const config = await form.config('contact')
const result = await form.submit('contact', {
  name: 'Alice', email: 'alice@example.com',
}, { captchaToken: 'tok_xxx' })
```

### CDN Conversation API

Send messages to the AI content agent for external content operations:

```ts
const conv = client.conversation()

// Send a message — returns complete response
const response = await conv.send('Create a blog post about Vue 4')
response.conversationId   // 'conv-abc123'
response.message          // 'I created the blog post...'
response.toolResults      // [{ id, name, result }]
response.usage            // { inputTokens, outputTokens }

// Continue conversation
await conv.send('Translate to Turkish', {
  conversationId: response.conversationId,
})

// Fetch history
const history = await conv.history('conv-abc123', { limit: 50 })
```

::: info Conversation API Keys
Conversation API uses dedicated keys (`crn_conv_*` prefix) with per-key role, tool allowlist, model restrictions, and rate limits. Keys are managed in Studio workspace settings.
:::

### CDN Metadata Endpoints

```ts
const manifest = await client.manifest()   // _manifest.json
const models   = await client.models()     // models/_index.json
const model    = await client.model('faq') // models/faq.json
```

### CDN vs Local Comparison

| Aspect | Local (`#contentrain`) | CDN (`createContentrain()`) |
|--------|----------------------|---------------------------|
| Data source | Bundled `.mjs` files | HTTP fetch from Studio CDN |
| Return type | Sync (`T[]`) | Async (`Promise<T[]>`) |
| Auth | None | API key required |
| Caching | In-memory (embedded) | ETag-based HTTP cache |
| Use case | SSG, build-time | SSR, client-side, serverless, mobile |

### Error Handling

```ts
import { ContentrainError } from '@contentrain/query'

try {
  await client.collection('faq').locale('en').all()
} catch (err) {
  if (err instanceof ContentrainError) {
    console.log(err.status)  // 401, 403, 404, 429
    console.log(err.message)
  }
}
```

## For Framework SDK Authors

The package root exports runtime primitives for building framework-specific SDKs:

```ts
import {
  QueryBuilder,
  SingletonAccessor,
  DictionaryAccessor,
  DocumentQuery,
  createContentrainClient,
} from '@contentrain/query'

// Load the generated client dynamically
const client = await createContentrainClient(process.cwd())
const posts = client.query('blog-post').locale('en').all()
```

The base SDK is framework-agnostic and MIT-licensed. Framework-specific integrations should build on top of these primitives without changing the underlying `.contentrain/` contract.

## Starter Templates

Every starter template comes with a pre-configured SDK client and content models:

| Template | Framework | Use Case |
|---|---|---|
| [astro-blog](https://github.com/Contentrain/contentrain-starter-astro-blog) | Astro | Blog / editorial |
| [next-commerce](https://github.com/Contentrain/contentrain-starter-next-commerce) | Next.js | E-commerce |
| [nuxt-saas](https://github.com/Contentrain/contentrain-starter-nuxt-saas) | Nuxt | SaaS marketing |
| [sveltekit-editorial](https://github.com/Contentrain/contentrain-starter-sveltekit-editorial) | SvelteKit | Editorial |

[See all 10 templates](https://github.com/orgs/Contentrain/repositories?q=contentrain-starter&type=template)

## Related Pages

- [CLI](/packages/cli) — `contentrain generate` command that runs the SDK generator
- [MCP Tools](/packages/mcp) — The tool layer that creates models and content the SDK consumes
- [Rules & Skills](/packages/rules) — Agent guidance for content operations
- [Contentrain Studio](/studio) — Hosted team workflows and CDN delivery for non-web platforms

## Package Exports

| Export Path | Description |
|-------------|-------------|
| `@contentrain/query` | Runtime classes + `createContentrain()` CDN factory + `MediaAccessor` + `FormsClient` + `ConversationClient` |
| `@contentrain/query/cdn` | CDN transport: `HttpTransport`, async queries, `MediaAccessor`, `FormsClient`, `ConversationClient` |
| `@contentrain/query/generate` | Programmatic generation API |
