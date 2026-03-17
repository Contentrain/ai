# `@contentrain/query`

[![npm version](https://img.shields.io/npm/v/%40contentrain%2Fquery?label=%40contentrain%2Fquery)](https://www.npmjs.com/package/@contentrain/query)
[![GitHub source](https://img.shields.io/badge/source-Contentrain%2Fai-181717?logo=github)](https://github.com/Contentrain/ai/tree/main/packages/sdk/js)

**Optional** type-safe generated query SDK for Contentrain.

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
- `where(field, value)`
- `sort(field, order?)`
- `limit(n)`
- `offset(n)`
- `include(...fields)`
- `first()`
- `all()`

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
- `where(field, value)`
- `include(...fields)`
- `bySlug(slug)`
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

- `QueryBuilder`
- `SingletonAccessor`
- `DictionaryAccessor`
- `DocumentQuery`
- `createContentrainClient`

## 🧩 CommonJS Usage

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

- `@contentrain/query`

Generator entry:

- `@contentrain/query/generate`

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
