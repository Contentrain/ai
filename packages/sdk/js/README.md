# `@contentrain/query`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Fquery?label=%40contentrain%2Fquery)](https://www.npmjs.com/package/@contentrain/query)
[![Agent Skills](https://img.shields.io/badge/Agent_Skill-contentrain--query-8B5CF6)](https://agentskills.io)
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

### `media(value)`

Resolves a stored `media/...` path to its absolute delivery URL. Emitted **only** when a CDN base is configured — set `cdn.url` in `.contentrain/config.json` or run `contentrain generate --cdnBaseUrl <base>`:

```ts
import { media } from '#contentrain'

media('media/original/hero.webp')          // → '{cdn.url}/media/original/hero.webp'
media('https://images.unsplash.com/x.jpg') // → unchanged (external pass-through)
```

Idempotent — external URLs (`http(s)://`, `//`, `data:`) and already-absolute delivery URLs pass through untouched. It is the local-mode counterpart of CDN mode's `MediaAccessor.url()`. For Studio-CDN content, media fields already carry absolute URLs, so no resolution is needed.

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
- `ConversationClient` — Conversation API client
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

### ⚠️ `document()` on the CDN: `all()` has no bodies

`all()` and `bySlug()` return different things, because the CDN stores documents
in two places:

| Call | Reads | Returns |
|---|---|---|
| `all()` / `first()` | `documents/{model}/_index/{locale}.json` | `DocumentIndexEntry<T>` — frontmatter only, **no `body`** |
| `bySlug(slug)` | `documents/{model}/{slug}/{locale}.json` | `{ frontmatter: T, body, html }` |

Reading `.body` off an `all()` result is a compile error. Fetch bodies explicitly:

```ts
const q = client.document<GuideSection>('guide-sections').locale('tr')

// Listing: frontmatter is all you need — one request.
const index = await q.sort('order', 'asc').all()
index.map(s => s.title)

// Need the prose? One request per document.
const full = await Promise.all(index.map(s => q.bySlug(s.slug)))
full.map(d => renderMarkdown(d!.body))
```

Note the **bundled** client's `document(...).all()` *does* include bodies — it
reads the content files directly. The two delivery modes genuinely differ here,
so they no longer share a return type. Code written against bundled delivery
will not silently render empty on CDN; it will fail to compile instead.

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

The browser side of Studio's public `/api/forms/v1` — no API key travels with
these requests (the endpoints are unauthenticated by design, and a page cannot
keep a secret; Studio's CORS for them allows only `Content-Type`):

```ts
const form = client.form()

// Public form config: exposed fields keyed by id, captcha, honeypot
const config = await form.config('contact')
// config.locale          → 'en'  (what the submission is validated against)
// config.fields          → { name: { type: 'string', required: true }, email: { type: 'email', … } }
// config.captcha         → 'turnstile' | null   (mount the widget with config.captchaSiteKey)
// config.honeypotField   → '_hp' | null         (render a hidden input with that name, leave it empty)

// Submit: values under `data`; captcha token and honeypot value beside it
const result = await form.submit('contact', {
  name: 'Alice',
  email: 'alice@example.com',
  message: 'Hello!',
}, { captchaToken: 'tok_xxx', honeypot: '' })
// → { success: true, message: 'Thank you!' }
// → { success: false, errors: [{ field: 'email', message }] }   (a verdict, not an exception)
// 403 / 404 / 429 reject with ContentrainError { status, message }
```

### Comments

The browser side of Studio's public `/api/comments/v1`. Only approved comments
come back, nested under their roots; email, IP, user agent and referrer never
leave the server. `body` is plain text — render it escaped.

```ts
const comments = client.comments()

const thread = await comments.thread('posts', entryId, { locale: 'en', page: 1, limit: 20, sort: 'oldest' })
// thread.config   → { closed, requireApproval, requireEmail, maxDepth, maxBodyLength, captcha, captchaSiteKey, honeypotField }
// thread.comments → [{ id, parentId, depth, author: { name, url, isModerator }, body, type, createdAt, replies: [...] }]
// thread.total    → root comments in total (pagination is over roots)

const result = await comments.submit('posts', entryId, {
  author: { name: 'Ada', email: 'ada@example.com', url: 'https://ada.dev' },
  body: 'Great post',
  parentId: thread.comments[0]?.id,   // reply; omit for a root comment
  captchaToken: 'tok_xxx',
  honeypot: '',
}, { locale: 'en' })
// → { success: true, status: 'pending' | 'approved', comment }   (pending is only echoed to its author)
// → { success: false, errors: [{ field: 'author.name' | 'author.email' | 'author.url' | 'body' | 'parentId' | 'captcha', message }] }
// 403 (thread closed) / 404 / 429 reject with ContentrainError
```

### Conversation API

Send messages to the AI content agent and manage conversation history:

```ts
const conv = client.conversation()

// Send a message — returns complete response with tool results
const response = await conv.send('Create a new blog post about Vue 4')
response.conversationId   // 'conv-abc123'
response.message          // 'I created the blog post...'
response.toolResults      // [{ id: 't-1', name: 'save_content', result: {...} }]
response.usage            // { inputTokens: 150, outputTokens: 80 }

// Continue a conversation
const followUp = await conv.send('Now translate it to Turkish', {
  conversationId: response.conversationId,
})

// Provide UI context
await conv.send('Update the hero section', {
  context: { activeModelId: 'hero', activeLocale: 'en' },
})

// Fetch conversation history
const history = await conv.history('conv-abc123', { limit: 50 })
history.messages  // [{ id, role, content, createdAt }, ...]
```

### Metadata Endpoints

```ts
const manifest = await client.manifest()
const models   = await client.models()
const model    = await client.model('faq')
```

### Bundle Preload

Opt-in mode that collapses per-render fetch waterfalls (N content requests + include resolution) into a single conditional GET. The transport fetches `_bundle/{locale}.json` — one artifact containing every JSON model for that locale — and serves all content/document-index/dictionary reads from memory:

```ts
const client = createContentrain({
  projectId: '350696e8-...',
  apiKey: 'crn_live_xxx',
  bundle: true,                        // or { revalidateMs: 30_000 }
})

// Optional eager warmup (e.g. SSR boot) — resolves true when a bundle was found
await client.preload('en')

// Zero network: served from the primed bundle
const posts = await client.collection('faq').locale('en').all()
const t     = await client.dictionary('ui').locale('en').get()
```

Behavior:

- **Coverage** — all JSON models (collections, singletons, dictionaries, document indexes) are served from the bundle. Document bodies (`bySlug()`), entry metadata (`withMeta()`), and media manifests keep using per-path fetch.
- **Revalidation** — the bundle is re-checked after `revalidateMs` (default `60_000`) with a conditional request; an unchanged bundle answers `304` at negligible cost.
- **Fallback** — if the bundle is missing (`404`), invalid, or the request fails, the transport transparently falls back to per-path fetching and retries the bundle after `revalidateMs`. With `bundle` unset, behavior is byte-for-byte identical to previous versions.
- **Non-i18n paths** — `content/{model}/data.json` entries ship in every locale bundle and are resolved via `defaultLocale` (default `'en'`).

### CDN vs Local

| Aspect | Local (`#contentrain`) | CDN (`createContentrain()`) |
|--------|----------------------|---------------------------|
| Data source | Bundled `.mjs` files | HTTP fetch from CDN |
| Return type | Sync (`T[]`) | Async (`Promise<T[]>`) |
| Auth | None | API key required |
| Caching | In-memory (embedded) | ETag-based HTTP cache + optional bundle preload |
| Use case | SSG, build-time | SSR, client-side, serverless |

## 🚀 Astro Content Layer

`contentrain generate` gives application code a typed client. Astro would
rather own the content itself, so pages can use `getCollection()`, `getEntry()`,
`reference()` and render documents with `<Content />`. `@contentrain/query/astro`
reads the same `.contentrain` files the generator reads — one project, one
answer about what its content is.

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content'
import { contentrainLoader } from '@contentrain/query/astro'

export const collections = {
  posts: defineCollection({
    loader: contentrainLoader({ model: 'blog-post', locale: 'en' }),
    schema: z.object({ title: z.string(), publishedAt: z.string() }).passthrough(),
  }),
  articles: defineCollection({ loader: contentrainLoader({ model: 'blog-article' }) }),
}
```

```astro
---
import { getCollection, getEntry, render } from 'astro:content'
const posts = await getCollection('posts')
const article = await getEntry('articles', 'en/welcome-post')
const { Content } = await render(article)
---
<ul>{posts.map((p) => <li>{p.data.title}</li>)}</ul>
<Content />
```

| Model kind | Becomes |
|---|---|
| `collection` | One entry per record; `data.id` is the entry id |
| `document` | One entry per file — frontmatter in `data`, markdown in `body`, rendered so `<Content />` works |
| `dictionary` | One entry per key (`{ key, value }`) — a key is a semantic address, and a single blob would make `getEntry()` useless on it |
| `singleton` | One entry, id `<model>` (or the locale) |

`locale` picks one language; omit it on an i18n model and every supported locale
loads with ids prefixed (`en/my-post`) — Astro ids are unique per collection, so
without the prefix one language would overwrite the other. `root` points at the
project holding `.contentrain` (default: `process.cwd()`).

Astro is not a dependency, not even a peer: the loader is structurally what
`defineCollection` accepts, so any Astro 5 version works and non-Astro consumers
of this package carry nothing extra.

## CommonJS Usage

Generated clients support CommonJS through `init()`:

```js
const clientModule = require('#contentrain')
const client = await clientModule.init()

const hero = client.singleton('hero').get()
```

## 🛠 Generation Commands

**Via the `contentrain` CLI (recommended for most users):**

```bash
contentrain generate                # Generate once
contentrain generate --watch        # Regenerate on model/content changes
contentrain generate --json         # Machine-readable JSON for CI
```

**Via `contentrain-query` (programmatic / build tool flows):**

```bash
npx contentrain-query generate
npx contentrain-query generate --watch
npx contentrain-query generate --root /path/to/project
```

Or from TypeScript:

```ts
import { generate } from '@contentrain/query/generate'

const result = await generate({ projectRoot: process.cwd() })
console.log(result.generatedFiles.length)
```

## 📤 Package Exports

Main package:

- `@contentrain/query` — runtime classes + `createContentrain()` CDN factory

Generator entry:

- `@contentrain/query/generate` — programmatic generation API

CDN transport:

- `@contentrain/query/cdn` — CDN client with `HttpTransport`, async query classes, `MediaAccessor`, `FormsClient`, `ConversationClient`

Astro content layer:

- `@contentrain/query/astro` — `contentrainLoader()` for `defineCollection({ loader })`

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

## Agent Skill (embedded)

This package ships an embedded [Agent Skill](https://agentskills.io) at `skills/contentrain-query/SKILL.md`. AI coding agents can discover and load it for type-safe SDK usage guidance, including:

- QueryBuilder, SingletonAccessor, DictionaryAccessor, DocumentQuery APIs
- Local mode vs CDN mode differences
- Framework-specific bundler configuration (Vite, Next.js, Nuxt, SvelteKit, Metro)

The skill is available via the `@contentrain/query/skills/*` subpath export.

## 🔗 Related Packages

- `contentrain` — CLI that runs project initialization, validation, serve, and generation flows
- `@contentrain/mcp` — local-first MCP server and core content workflow engine
- `@contentrain/types` — shared schema and model definitions
- `@contentrain/rules` — agent rules and prompts

## 📚 Documentation

Full documentation at **[ai.contentrain.io/packages/sdk](https://ai.contentrain.io/packages/sdk)**.

## 📄 License

MIT


### Public builds and scheduled publication

Editorial generation keeps all content by default. For a deployed static site,
use `contentrain-query generate --published` (or `contentrain generate --published`).
Only published entries inside their `publish_at`/`expire_at` window are included.
Legacy entries without metadata remain visible, matching Studio CDN behavior.
Invalid schedule values are excluded; malformed metadata stops the build.

`--at 2026-10-01T12:00:00Z` fixes the clock for a reproducible public build and
implies `--published`. The programmatic equivalents are
`generate({ projectRoot, publishedOnly: true })` and
`generate({ projectRoot, at: '2026-10-01T12:00:00Z' })`.

Astro content collections use the same filter:

```ts
contentrainLoader({ model: 'posts', locale: 'en', publishedOnly: true })
```

Publication begins exactly at `publish_at` and ends exactly at `expire_at`.
All four model kinds read canonical `.contentrain/meta` files, including content
stored at custom paths. Metadata is not copied into public content fields.
Watch mode reacts to metadata edits. Time passing alone does not redeploy a
static site: schedule a build and deployment at each deadline, with retries.
Use a fixed `at` for testing/reproduction, not a permanent deployment clock.
