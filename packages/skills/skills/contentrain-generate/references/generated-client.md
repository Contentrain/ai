---
name: generated-client
description: "Generated client structure, framework bundler configs, and API patterns"
---

# Generated Client Reference

## Bundler Alias Configuration

The `#contentrain` subpath import works natively in Node.js 22+ but **does NOT resolve in browser bundlers**. Configure an alias for your framework.

### Vite (Vue, React, Svelte, Astro)

```ts
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

Also add a `paths` entry to `tsconfig.json` so the TypeScript language server resolves the alias:

```json
{
  "compilerOptions": {
    "paths": {
      "#contentrain": ["./.contentrain/client/index.d.ts"]
    }
  }
}
```

### Next.js (webpack)

```js
// next.config.js
const path = require('path')
module.exports = {
  webpack: (config) => {
    config.resolve.alias['#contentrain'] = path.resolve(__dirname, '.contentrain/client/index.mjs')
    return config
  },
}
```

Add the same `tsconfig.json` paths entry:

```json
{
  "compilerOptions": {
    "paths": {
      "#contentrain": ["./.contentrain/client/index.d.ts"]
    }
  }
}
```

### Nuxt 3

Nuxt provides a top-level `alias` option — no Vite config needed:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  alias: {
    '#contentrain': './.contentrain/client/index.mjs',
  },
})
```

Add the `tsconfig.json` paths entry as above. Nuxt auto-extends `tsconfig.json` via `.nuxt/tsconfig.json`, so ensure the paths entry is in the project root `tsconfig.json`.

### SvelteKit

SvelteKit uses Vite internally. Add the alias in `vite.config.ts` as shown in the Vite section above.

### Expo / React Native (Metro)

```js
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

### Pure Node.js / SSR-only

No alias needed. Node.js 22+ resolves `#contentrain` from `package.json` imports natively.

---

## Complete SDK API Reference

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

### QueryBuilder (for collection models) -- SYNC, no await needed

```ts
const posts = query('blog-post')
  .locale('en')               // set locale
  .where('status', 'published') // exact match filter
  .sort('date', 'desc')       // sort by field
  .limit(10)                  // limit results
  .offset(5)                  // skip results
  .include('author', 'tags')  // resolve relation fields (1 level deep)
  .all()                      // --> T[] (returns array)
  .first()                    // --> T | undefined (first match)
```

### SingletonAccessor (for singleton models)

```ts
const hero = singleton('hero')
  .locale('en')
  .include('featured_post')   // resolve relations on singletons too
  .get()                      // --> T (single object)
```

### DictionaryAccessor (for dictionary models)

```ts
const allLabels = dictionary('ui-labels').locale('en').get()       // --> Record<string, string>
const oneLabel = dictionary('ui-labels').locale('en').get('key')   // --> string | undefined
const withParams = dictionary('ui-labels').locale('en').get('add-entry', { model: 'blog' })  // --> "Add a new entry to blog"
```

Parameterized templates use `{placeholder}` syntax in dictionary values. The `get(key, params)` overload replaces `{name}` with the provided value. Unmatched placeholders are left as-is.

### DocumentQuery (for document models -- markdown + frontmatter)

```ts
const article = document('blog-article')
  .locale('en')
  .where('category', 'tech')
  .include('author')          // resolve relations in frontmatter
  .bySlug('getting-started')  // --> T | undefined (find by slug)

const docs = document('doc-page').locale('en').all()    // --> T[]
const first = document('doc-page').locale('en').first()  // --> T | undefined
```

### DOES NOT EXIST -- never use these

- `.filter()` -- use `.where(field, value)` instead
- `.byId()` -- use `.where('id', value).first()` instead
- `.count()` -- use `.all().length` instead
- `dictionary().all()` -- use `.get()` instead
- Queries are SYNC -- do not use `await` with `query()`, `singleton()`, `dictionary()`, or `document()`
- `.where('field', 'eq', value)` -- just `.where('field', value)`
- `.get()` on QueryBuilder -- use `.all()` or `.first()`

---

## With Relations

```ts
// Relations are resolved 1 level deep via .include()
const posts = query('blog-post')
  .locale('en')
  .include('author', 'tags')
  .all()
// posts[0].author --> { id: '...', name: 'John', ... } (resolved object)

// Without include:
const raw = query('blog-post').locale('en').all()
// raw[0].author --> 'author-id-123' (raw string ID, NOT resolved)

// Singletons support include too:
const hero = singleton('hero').locale('en').include('featured_post').get()

// Documents support include too:
const article = document('blog-article').locale('en').include('author').bySlug('my-post')
```

---

## Framework-Specific Patterns

| Stack | Usage Pattern | Alias Setup |
|---|---|---|
| Nuxt 3 | `useAsyncData(() => singleton('hero').locale(locale).get())` | `nuxt.config.ts` alias |
| Next.js | In RSC: `const data = singleton('hero').locale('en').get()` | `next.config.js` webpack alias |
| Astro | In frontmatter: `const posts = query('blog-post').locale('en').all()` | `vite.config.ts` alias |
| SvelteKit | In `+page.server.ts`: `export const load = () => ({ hero: singleton('hero').locale('en').get() })` | `vite.config.ts` alias |
| Expo / RN | `const hero = singleton('hero').locale('en').get()` | `metro.config.js` resolver |
| Node.js / SSR | Direct import — no alias needed | Native subpath imports |
