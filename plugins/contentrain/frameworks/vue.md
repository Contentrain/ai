# Contentrain + Vue 3 + Vite

> Framework guide for consuming the generated Contentrain client in a Vue SPA.

---

## 1. Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

Restart the Vite dev server after the first generate.

The generated `#contentrain` import resolves to the ESM client under `.contentrain/client/index.mjs`.

---

## 2. SFC Usage

In a Vue SPA, direct SFC imports are valid:

```vue
<script setup lang="ts">
import { query, singleton, dictionary } from '#contentrain'

const hero = singleton('hero').locale('en').get()
const labels = dictionary('ui-labels').locale('en').get()
const posts = query('blog-post').locale('en').sort('publishedAt', 'desc').all()
</script>

<template>
  <main>
    <h1>{{ hero.title }}</h1>
    <button>{{ labels.cta_primary }}</button>

    <ul>
      <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
    </ul>
  </main>
</template>
```

Rules:

- queries are synchronous
- content is bundled as static generated modules
- re-run `contentrain generate` after model/content changes

### Relations

```ts
const posts = query('blog-post').locale('en').include('author', 'tags').all()
```

### Documents

```ts
import { document } from '#contentrain'

const article = document('blog-article').locale('en').bySlug('getting-started')
```

---

## 3. Best Fit

Use this pattern for:

- marketing SPAs
- dashboard/admin SPAs
- static Vite sites

For Nuxt SSR/hybrid projects, use the dedicated Nuxt guide instead.

