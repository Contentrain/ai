# `@contentrain/query`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Fquery?label=%40contentrain%2Fquery)](https://www.npmjs.com/package/@contentrain/query)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/sdk/js)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io/packages/sdk)

**Optional** type-safe generated query SDK for Contentrain.

Start here:

- [2-minute product demo](https://ai.contentrain.io/demo)
- [SDK docs](https://ai.contentrain.io/packages/sdk)
- [Framework integration guide](https://ai.contentrain.io/guides/frameworks)

Contentrain stores content as plain JSON and Markdown in a git-backed `.contentrain/` directory. Any platform that reads JSON can consume this content directly. This package adds a TypeScript convenience layer that turns content models into a generated JS/TS client with:

- exact TypeScript types from your models
- zero-dependency query runtime
- Node `#contentrain` subpath imports
- ESM and CommonJS output
- framework-agnostic usage across app and server environments

## 🚀 Install

```bash
pnpm add @contentrain/query
```

Requirements:

- Node.js `22+`
- a Contentrain project with `.contentrain/config.json`

## ✨ What This Package Provides

`@contentrain/query` has two roles:

1. **Generator**
   - reads `.contentrain/config.json`, models, and content files
   - writes `.contentrain/client/`
   - injects `#contentrain` imports into your `package.json`

2. **Base runtime**
   - exports low-level runtime classes for framework SDK authors
   - exports `createContentrainClient(projectRoot?)` for loading a generated client module

## 🚀 Quick Start

Generate a client:

```bash
npx contentrain-query generate
```

This writes:

```text
.contentrain/client/
  index.mjs
  index.cjs
  index.d.ts
  data/*
```

It also updates your `package.json` with:

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

Then use the generated client in your app:

```ts
import { query, singleton, dictionary, document } from '#contentrain'

const posts = query('blog-post')
  .locale('en')
  .where('status', 'published')
  .sort('title')
  .all()

const hero = singleton('hero').locale('en').get()
const messages = dictionary('error-messages').locale('en').get()
const article = document('blog-article').locale('en').bySlug('welcome-post')
```

## 📦 Generated Client API

The generated client exposes four entry points:

### `query(model)`

For collection models.

Supported methods:

- `locale(lang)`
- `where(field, value)` — equality shorthand
- `where(field, op, value)` — operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`
- `sort(field, order?)`
- `limit(n)`
- `offset(n)`
- `include(...fields)`
- `count()`
- `first()`
- `all()`

Where operator examples:

```ts
query('plans').where('slug', 'ne', 'free').all()
query('plans').where('price', 'gte', 10).where('price', 'lte', 50).all()
query('starters').where('framework', 'in', ['nuxt', 'next']).all()
query('blog').where('title', 'contains', 'Guide').count()
```

### `singleton(model)`

For singleton models.

Supported methods:

- `locale(lang)`
- `include(...fields)`
- `get()`

### `dictionary(model)`

For dictionary models.

Supported methods:

- `locale(lang)`
- `get()`
- `get(key)`

### `document(model)`

For markdown/document models.

Supported methods:

- `locale(lang)`
- `where(field, value)` — equality shorthand
- `where(field, op, value)` — same operators as `query()`
- `include(...fields)`
- `bySlug(slug)`
- `count()`
- `first()`
- `all()`

## 🔗 Relations

Generated clients support relation resolution via `include(...)`.

Examples:

```ts
const posts = query('blog-post')
  .locale('en')
  .include('author', 'tags')
  .all()

const settings = singleton('site-settings')
  .locale('en')
  .include('featured_post')
  .get()
```

## 🧱 Framework SDK Authors

The package root exports runtime primitives and an async loader:

```ts
import { createContentrainClient } from '@contentrain/query'

const client = await createContentrainClient(process.cwd())
const posts = client.query('blog-post').locale('en').all()
```

Public root exports:

- `QueryBuilder`, `SingletonAccessor`, `DictionaryAccessor`, `DocumentQuery` — runtime classes
- `createContentrainClient` — local generated client loader
- `createContentrain` — CDN client factory
- `MediaAccessor` — CDN media manifest reader
- `FormsClient` — CDN forms API client
- `ContentrainError` — HTTP error class for CDN mode
- `applyWhere` — shared where filter helper

## CDN Transport

For apps that fetch content from Contentrain Studio CDN (SSR, serverless, mobile):

```ts
import { createContentrain } from '@contentrain/query/cdn'

const client = createContentrain({
  projectId: '350696e8-...',
  apiKey: 'crn_live_xxx',
  // baseUrl: 'https://studio.contentrain.io/api/cdn/v1'  (default)
})

// All CDN queries are async
const posts = await client.collection('faq').locale('en').all()
const hero  = await client.singleton('hero').locale('en').get()
const t     = await client.dictionary('ui').locale('en').get()
const doc   = await client.document('docs').locale('en').bySlug('intro')
```

CDN collection queries support extended operators:

```ts
const filtered = await client.collection('faq')
  .locale('en')
  .where('order', 'gt', 5)
  .where('category', 'in', ['general', 'billing'])
  .sort('order', 'desc')
  .limit(10)
  .all()
```

CDN collection queries support `count()` and entry metadata:

```ts
const total = await client.collection('faq').locale('en').count()

// Enrich entries with _meta (status, publish_at, expire_at)
const posts = await client.collection('blog')
  .locale('en')
  .withMeta()
  .all()
// posts[0]._meta → { status: 'published', publish_at: '...', ... }
```

### Media

Access the media manifest and resolve asset variant URLs:

```ts
const media = client.media()
const assets = await media.list()           // All assets with paths
const asset  = await media.asset('hero.jpg') // Single asset

// Resolve variant URL
const thumbUrl = media.url(asset, 'thumb')  // Full CDN URL
const original = media.url(asset)           // Original URL

// Asset metadata
asset.meta.width      // 1920
asset.meta.blurhash   // 'LEHV6nWB...'
asset.meta.alt        // 'Hero image'
```

### Forms

Fetch form schema and submit data from external sites:

```ts
const form = client.form()

// Get form field configuration
const config = await form.config('contact')
// config.fields → [{ id: 'name', type: 'string', required: true }, ...]

// Submit form data
const result = await form.submit('contact', {
  name: 'Alice',
  email: 'alice@example.com',
  message: 'Hello!',
}, { captchaToken: 'tok_xxx' })
// result → { success: true, message: 'Thank you!' }
```

### Metadata Endpoints

```ts
const manifest = await client.manifest()
const models   = await client.models()
const model    = await client.model('faq')
```

### CDN vs Local

| Aspect | Local (`#contentrain`) | CDN (`createContentrain()`) |
|--------|----------------------|---------------------------|
| Data source | Bundled `.mjs` files | HTTP fetch from CDN |
| Return type | Sync (`T[]`) | Async (`Promise<T[]>`) |
| Auth | None | API key required |
| Caching | In-memory (embedded) | ETag-based HTTP cache |
| Use case | SSG, build-time | SSR, client-side, serverless |

## CommonJS Usage

Generated clients support CommonJS through `init()`:

```js
const clientModule = require('#contentrain')
const client = await clientModule.init()

const hero = client.singleton('hero').get()
```

## 🛠 CLI

Generate once:

```bash
npx contentrain-query generate
```

Generate in watch mode:

```bash
npx contentrain-query generate --watch
```

Use a different project root:

```bash
npx contentrain-query generate --root /path/to/project
```

## 📤 Package Exports

Main package:

- `@contentrain/query` — runtime classes + `createContentrain()` CDN factory

Generator entry:

- `@contentrain/query/generate` — programmatic generation API

CDN transport:

- `@contentrain/query/cdn` — CDN client with `HttpTransport`, async query classes, `MediaAccessor`, `FormsClient`

## 🧠 Design Constraints

This package intentionally:

- generates into `.contentrain/client/` instead of `node_modules`
- uses `package.json#imports` instead of custom alias plugins
- ships zero-dependency runtime classes
- keeps the runtime framework-agnostic
- treats generated client output as the primary consumer surface

## 🛠 Development

From the monorepo root:

```bash
pnpm --filter @contentrain/query build
pnpm --filter @contentrain/query test
pnpm --filter @contentrain/query typecheck
pnpm exec oxlint packages/sdk/js/src packages/sdk/js/tests
```

## 🔗 Related Packages

- `contentrain` — CLI that runs project initialization, validation, serve, and generation flows
- `@contentrain/mcp` — local-first MCP server and core content workflow engine
- `@contentrain/types` — shared schema and model definitions
- `@contentrain/rules` — agent rules and prompts

## 📚 Documentation

Full documentation at **[ai.contentrain.io/packages/sdk](https://ai.contentrain.io/packages/sdk)**.

## 📄 License

MIT
