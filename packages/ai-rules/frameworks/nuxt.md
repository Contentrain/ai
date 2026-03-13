# Contentrain + Nuxt 3

> Framework guide for consuming Contentrain-managed content in Nuxt 3 applications.

---

## 1. Setup

### 1.1 SDK Installation

```bash
npm install @contentrain/query
npx contentrain-query generate
```

The generator reads `.contentrain/models/` and produces a typed client in `.contentrain/client/`. Your `package.json` must include the subpath import:

```json
{
  "imports": {
    "#contentrain": "./.contentrain/client/index.mjs"
  }
}
```

The generator adds this automatically. After generation, restart the Nuxt dev server to pick up the new import map.

### 1.2 Watch Mode

Run the generator in watch mode alongside Nuxt dev:

```bash
npx contentrain-query generate --watch &
npx nuxt dev
```

Any model or content change under `.contentrain/` triggers client regeneration automatically.

---

## 2. Imports

All SDK functions are imported from the `#contentrain` subpath:

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

This import works in server routes, composables, plugins, and `<script setup>` blocks. The SDK reads JSON files at build time — there is no runtime API dependency.

---

## 3. Querying Content

### 3.1 Collections

Collections return arrays. The SDK converts the internal object-map storage to arrays automatically.

```ts
const posts = query('blog-post').locale('en').all()
const featured = query('blog-post').locale('en').filter({ featured: true }).all()
const sorted = query('blog-post').locale('en').sort('publishedAt', 'desc').all()
```

Single entry by ID:

```ts
const post = query('blog-post').locale('en').byId('abc-123')
```

### 3.2 Singletons

Singletons return a single object. Use `.get()` instead of `.all()`.

```ts
const hero = singleton('hero').locale('en').get()
```

### 3.3 Dictionaries

Dictionaries provide key-value access for UI strings.

```ts
const labels = dictionary('ui-labels').locale('en').get('submit_button')
const allLabels = dictionary('ui-labels').locale('en').all()
```

### 3.4 Documents

Documents are long-form content with metadata and a body field (markdown or MDX).

```ts
const article = document('blog-article').locale('en').bySlug('getting-started')
const docs = document('doc-page').locale('en').all()
```

### 3.5 Relations

Resolve relation fields to full objects with `.include()`:

```ts
const posts = query('blog-post').locale('en').include('author', 'tags').all()
// post.author → full author object instead of just the ID
// post.tags → array of full tag objects
```

---

## 4. Nuxt Integration Patterns

### 4.1 Page Data Loading

Use `useAsyncData` or direct calls in `<script setup>`:

```vue
<script setup lang="ts">
import { query } from '#contentrain'

const { data: posts } = await useAsyncData('blog-posts', () =>
  query('blog-post').locale('en').sort('publishedAt', 'desc').all()
)
</script>
```

### 4.2 Dynamic Routes

For `pages/blog/[slug].vue`:

```vue
<script setup lang="ts">
import { document } from '#contentrain'

const route = useRoute()
const { data: post } = await useAsyncData(`post-${route.params.slug}`, () =>
  document('blog-article').locale('en').bySlug(route.params.slug as string)
)
</script>
```

### 4.3 Server Routes

Content is also accessible in Nuxt server routes (`server/api/`):

```ts
// server/api/posts.get.ts
import { query } from '#contentrain'

export default defineEventHandler(() => {
  return query('blog-post').locale('en').all()
})
```

---

## 5. i18n Integration

### 5.1 With @nuxtjs/i18n

Use the `useI18n()` composable to get the current locale, then pass it to SDK calls:

```vue
<script setup lang="ts">
import { query } from '#contentrain'

const { locale } = useI18n()
const { data: posts } = await useAsyncData(
  `posts-${locale.value}`,
  () => query('blog-post').locale(locale.value).all(),
  { watch: [locale] }
)
</script>
```

### 5.2 Dictionary Strings as i18n Source

Contentrain dictionaries can serve as the i18n message source. Export dictionary content and feed it to `@nuxtjs/i18n` via a custom loader, or use SDK calls directly in components for content-driven strings.

---

## 6. Markdown and Document Content

### 6.1 Nuxt Content Module

If using `@nuxt/content`, point it to `.contentrain/content/` for markdown files:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  content: {
    sources: {
      contentrain: {
        driver: 'fs',
        base: '.contentrain/content'
      }
    }
  }
})
```

### 6.2 Rendering Document Bodies

For document-kind entries, the `body` field contains markdown. Render it with `@nuxt/content` or any markdown renderer:

```vue
<template>
  <ContentRenderer :value="parsedBody" />
</template>
```

---

## 7. Static Generation and Deployment

### 7.1 Static Generation

Contentrain content is file-based. `nuxt generate` reads all content at build time:

```bash
npx nuxt generate
```

All SDK calls resolve to static JSON reads — no runtime API calls during generation.

### 7.2 Deployment

Content lives in Git. The deployment flow:

1. Author or agent creates/updates content via MCP tools.
2. Changes are committed to a branch and reviewed.
3. After merge, push triggers platform rebuild (Vercel, Netlify, Cloudflare Pages).
4. `nuxt generate` runs, SDK reads `.contentrain/` content, static site is produced.

### 7.3 Hybrid Rendering

For SSR pages, SDK calls execute on the server at request time. Content is still read from the file system — no external API dependency.

---

## 8. Type Safety

The generated client includes full TypeScript types for every model:

```ts
import { query } from '#contentrain'

// Fully typed — IDE autocomplete for field names, return types
const posts = query('blog-post').locale('en').all()
// posts[0].title — string
// posts[0].author — Author (when using .include('author'))
```

Type definitions are regenerated whenever models change. Keep the generator running in watch mode during development.
