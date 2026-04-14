---
name: contentrain-sdk
description: "Use the @contentrain/query SDK to query Contentrain content with type safety. Use when importing from #contentrain, using QueryBuilder, SingletonAccessor, DictionaryAccessor, or DocumentQuery."
metadata:
  author: Contentrain
  version: "1.0.0"
---

# Contentrain Query SDK

## Overview

`@contentrain/query` is a Prisma-pattern generated client that provides type-safe access to Contentrain content. Generated output lives in `.contentrain/client/` — never edit it manually.

## Quick Start

```bash
npx contentrain generate     # Generate client from models
```

```typescript
import { query, singleton, dictionary, document } from '#contentrain'

// Collection
const posts = query('blog-post').where('category', 'eq', 'engineering').sort('published_at', 'desc').limit(10).all()

// Singleton
const hero = singleton('hero').get()

// Dictionary
const t = dictionary('ui-texts').get()
const loginLabel = t['auth.login.button']

// Document
const doc = document('blog-post').bySlug('getting-started')
```

## Runtime API

### QueryBuilder (collections)

| Method | Description |
|--------|-------------|
| `.all()` | Get all entries |
| `.first()` | Get first entry |
| `.count()` | Return count of matching entries |
| `.where(field, value)` | Equality filter (shorthand for `eq`) |
| `.where(field, op, value)` | Operator filter: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains` |
| `.sort(field, direction?)` | Sort (`asc`/`desc`, default `asc`) |
| `.limit(n)` | Limit results |
| `.offset(n)` | Skip results |
| `.include(relation)` | Resolve relation (1 level deep) |

### SingletonAccessor

| Method | Description |
|--------|-------------|
| `.get()` | Get the singleton data |
| `.include(relation)` | Resolve relation fields |

### DictionaryAccessor

| Method | Description |
|--------|-------------|
| `.get()` | Get all key-value pairs |
| `.get(key)` | Get single value by key |
| `.get(key, params)` | Get with interpolation: `{placeholder}` → value |

### DocumentQuery

| Method | Description |
|--------|-------------|
| `.all()` | Get all documents |
| `.bySlug(slug)` | Get document by slug |
| `.first()` | Get first document |
| `.count()` | Return count of matching documents |
| `.where(field, value)` | Equality filter (shorthand) |
| `.where(field, op, value)` | Operator filter (same ops as QueryBuilder) |
| `.include(relation)` | Resolve relation fields |

## CDN Mode (Remote Data)

For server-side or client-side apps that fetch content from Contentrain Studio CDN:

```typescript
import { createContentrain } from '@contentrain/query/cdn'

const client = createContentrain({
  projectId: '350696e8-...',
  apiKey: 'crn_live_xxx',
  // baseUrl: 'https://studio.contentrain.io/api/cdn/v1'  (default)
})

// All CDN queries are async (return Promise)
const posts = await client.collection('faq').locale('en').all()
const hero = await client.singleton('hero').locale('en').get()
const t = await client.dictionary('ui').locale('en').get()
const doc = await client.document('docs').locale('en').bySlug('intro')
```

### CDN Collection Query Operators

| Operator | Example | Description |
|----------|---------|-------------|
| `eq` | `.where('status', 'eq', 'published')` | Equals |
| `ne` | `.where('status', 'ne', 'draft')` | Not equals |
| `gt` | `.where('order', 'gt', 5)` | Greater than |
| `gte` | `.where('order', 'gte', 5)` | Greater than or equal |
| `lt` | `.where('price', 'lt', 100)` | Less than |
| `lte` | `.where('price', 'lte', 100)` | Less than or equal |
| `in` | `.where('category', 'in', ['a','b'])` | In array |
| `contains` | `.where('tags', 'contains', 'vue')` | String/array contains |

### CDN Entry Metadata, Media & Forms

```typescript
// Entry metadata (status, publish_at, expire_at)
const posts = await client.collection('blog').locale('en').withMeta().all()

// Media manifest & variant URLs
const media = client.media()
const asset = await media.asset('hero.jpg')
const url = media.url(asset, 'thumb')

// Forms (config fetch + submit)
const form = client.form()
const config = await form.config('contact')
const result = await form.submit('contact', { name: 'Alice' })

// Conversation API (external AI content operations)
const conv = client.conversation()
const response = await conv.send('Create a blog post about Vue 4')
const history = await conv.history(response.conversationId)
```

### CDN vs Local

| Aspect | Local (`#contentrain`) | CDN (`createContentrain()`) |
|--------|----------------------|---------------------------|
| Data source | Bundled `.mjs` files | HTTP fetch from CDN |
| Return type | Sync (`T[]`) | Async (`Promise<T[]>`) |
| Auth | None | API key required |
| Caching | In-memory (embedded) | ETag-based HTTP cache |
| Use case | SSG, build-time | SSR, client-side, serverless |

## Key Rules

- **Local mode** queries are **synchronous** — no `await` needed
- **CDN mode** queries are **async** — always `await`
- Relation resolution is **1 level deep** — no recursive resolution
- Locale fallback chain: explicit → config default → first available
- Generated files in `.contentrain/client/` are **immutable** — always regenerate, never edit
- Run `contentrain generate` after any model change

## Framework Integration

| Framework | Import | Notes |
|-----------|--------|-------|
| Nuxt 3 | `import { query } from '#contentrain'` | Server-only (server routes, plugins) |
| Next.js | `import { query } from '#contentrain'` | Works in RSC and API routes |
| Astro | `import { query } from '#contentrain'` | Works in `.astro` frontmatter |
| SvelteKit | `import { query } from '#contentrain'` | Works in `+page.server.ts` |
| Vue + Vite | `import { query } from '#contentrain'` | Requires Vite alias config |
| React + Vite | `import { query } from '#contentrain'` | Requires Vite alias config |
| Node.js | `import { query } from '#contentrain'` | ESM with subpath imports |

## References

| Reference | Description |
|-----------|-------------|
| [Bundler Configuration](references/bundler-config.md) | Vite, Next.js, Nuxt, SvelteKit, Metro alias setup |

## Related Skills

- **contentrain-generate** — Generate the SDK client before using it
- **contentrain-quality** — Content quality rules for entries you query
- **contentrain** — Core architecture and MCP tool catalog
