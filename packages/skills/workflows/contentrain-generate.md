# Skill: Generate SDK Client

> Generate the typed Contentrain query client from model definitions using the Prisma-pattern codegen.

---

## When to Use

The user wants to generate or regenerate the SDK client, or says something like "generate client", "regenerate types", "set up contentrain imports", "run contentrain generate", "update SDK types".

---

## Steps

### 1. Check Project State

Call `contentrain_status` to verify:

- `.contentrain/` directory exists with `config.json`.
- At least one model exists in `.contentrain/models/`.
- Content files exist for the configured locales.

If the project is not initialized, stop and suggest running `/contentrain-init` first. If no models exist, suggest `/contentrain-content` to create content first.

### 2. Verify Prerequisites

Check that the required packages are available:

- `@contentrain/query` must be installed in the project's `package.json` (as a dependency).
- The `contentrain` CLI must be available (via `npx contentrain` or globally installed).

If `@contentrain/query` is not installed, install it using the project's package manager:

```bash
# Use whichever package manager the project uses
pnpm add @contentrain/query
# or: npm install @contentrain/query
# or: yarn add @contentrain/query
```

### 3. Run the Generator

Execute the generation command:

```bash
npx contentrain generate
```

If the project uses a non-standard root directory, specify it:

```bash
npx contentrain generate --root .
```

This reads `.contentrain/models/` and `.contentrain/content/` to produce:

```
.contentrain/client/
  index.mjs          — ESM entry (query runtime + re-exports)
  index.cjs          — CJS entry (NestJS, Express, legacy tooling)
  index.d.ts         — Generated types (from model schemas)
  data/
    {model}.{locale}.mjs   — Static data modules per model/locale
```

### 4. Verify package.json Imports

The generator should have added `#contentrain` subpath imports to `package.json`. Verify the full import map:

```json
{
  "imports": {
    "#contentrain": {
      "types": "./.contentrain/client/index.d.ts",
      "import": "./.contentrain/client/index.mjs",
      "require": "./.contentrain/client/index.cjs",
      "default": "./.contentrain/client/index.mjs"
    },
    "#contentrain/*": {
      "types": "./.contentrain/client/*.d.ts",
      "import": "./.contentrain/client/*.mjs",
      "require": "./.contentrain/client/*.cjs",
      "default": "./.contentrain/client/*.mjs"
    }
  }
}
```

If the imports entry is missing or incomplete, update `package.json` manually to match the full structure above.

### 5. Verify TypeScript Configuration

Ensure `tsconfig.json` does not block the generated client:

- `paths` should not conflict with `#contentrain`.
- `rootDir` or `include` should not exclude `.contentrain/client/`.
- If using `moduleResolution: "bundler"` or `"node16"`, subpath imports resolve natively.

### 5.5. Configure Bundler Alias

The `#contentrain` subpath import works natively in Node.js 22+ but **does NOT resolve in browser bundlers**. If the project uses a bundler, configure an alias so `#contentrain` resolves to the generated client.

#### Vite (Vue, React, Svelte, Astro)

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

#### Next.js (webpack)

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

#### Nuxt 3

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

#### SvelteKit

SvelteKit uses Vite internally. Add the alias in `vite.config.ts` as shown in the Vite section above.

#### Expo / React Native (Metro)

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

#### Pure Node.js / SSR-only

No alias needed. Node.js 22+ resolves `#contentrain` from `package.json` imports natively.

### 6. Verify Imports Work

Run a quick verification that the imports resolve correctly.

**Node.js / SSR-only projects:**

```bash
node -e "import('#contentrain').then(m => console.log('OK:', Object.keys(m)))"
```

**Browser / bundler projects:** run the framework's build command instead, since the Node.js check does not exercise the bundler alias:

```bash
# Vite-based (Vue, React, Svelte, Astro)
npx vite build

# Next.js
npx next build

# Nuxt 3
npx nuxi build

# Expo
npx expo export
```

A successful build confirms the `#contentrain` alias resolves correctly through the bundler pipeline.

If verification fails, check:
- Node.js version >= 22 (required for native subpath imports).
- `package.json` has `"type": "module"` (for ESM projects).
- The `.contentrain/client/` directory was generated successfully.
- The bundler alias is configured (see Step 5.5) for browser projects.

### 7. Show Usage Examples

Based on the detected stack and available models, show relevant examples using actual model IDs and field names from the project — not generic placeholders.

#### Complete SDK API Reference

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

**QueryBuilder (for collection models) -- SYNC, no await needed:**

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

**SingletonAccessor (for singleton models):**

```ts
const hero = singleton('hero')
  .locale('en')
  .include('featured_post')   // resolve relations on singletons too
  .get()                      // --> T (single object)
```

**DictionaryAccessor (for dictionary models):**

```ts
const allLabels = dictionary('ui-labels').locale('en').get()       // --> Record<string, string>
const oneLabel = dictionary('ui-labels').locale('en').get('key')   // --> string | undefined
```

**DocumentQuery (for document models -- markdown + frontmatter):**

```ts
const article = document('blog-article')
  .locale('en')
  .where('category', 'tech')
  .include('author')          // resolve relations in frontmatter
  .bySlug('getting-started')  // --> T | undefined (find by slug)

const docs = document('doc-page').locale('en').all()    // --> T[]
const first = document('doc-page').locale('en').first()  // --> T | undefined
```

**DOES NOT EXIST -- never use these:**
- `.filter()` -- use `.where(field, value)` instead
- `.byId()` -- use `.where('id', value).first()` instead
- `.count()` -- use `.all().length` instead
- `dictionary().all()` -- use `.get()` instead
- Queries are SYNC -- do not use `await` with `query()`, `singleton()`, `dictionary()`, or `document()`
- `.where('field', 'eq', value)` -- just `.where('field', value)`
- `.get()` on QueryBuilder -- use `.all()` or `.first()`

#### With Relations

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

#### Framework-Specific Patterns

| Stack | Usage Pattern | Alias Setup |
|---|---|---|
| Nuxt 3 | `useAsyncData(() => singleton('hero').locale(locale).get())` | `nuxt.config.ts` alias (Step 5.5) |
| Next.js | In RSC: `const data = singleton('hero').locale('en').get()` | `next.config.js` webpack alias (Step 5.5) |
| Astro | In frontmatter: `const posts = query('blog-post').locale('en').all()` | `vite.config.ts` alias (Step 5.5) |
| SvelteKit | In `+page.server.ts`: `export const load = () => ({ hero: singleton('hero').locale('en').get() })` | `vite.config.ts` alias (Step 5.5) |
| Expo / RN | `const hero = singleton('hero').locale('en').get()` | `metro.config.js` resolver (Step 5.5) |
| Node.js / SSR | Direct import — no alias needed | Native subpath imports |

### 8. Offer Watch Mode

Suggest setting up watch mode for development:

```bash
npx contentrain generate --watch
```

This re-generates the client automatically whenever models or content change under `.contentrain/`. Recommend running it alongside the framework's dev server.

For convenience, suggest adding a script to `package.json`:

```json
{
  "scripts": {
    "contentrain:watch": "contentrain generate --watch"
  }
}
```

### 9. Final Summary

Report to the user:

- Models processed: list each model and its kind.
- Generated files: list the `.contentrain/client/` contents.
- Locales included: list data files per locale.
- Import path: `#contentrain` is ready to use.
- TypeScript types: available via `index.d.ts`.
- Next steps: import `query` from `#contentrain` and start querying content.
- Reminder: re-run `contentrain generate` after model or content changes.
