---
title: Framework Integration
description: "Setup and usage patterns for Nuxt, Next.js, Astro, SvelteKit, Vue, React, Expo, and any platform that reads JSON"
order: 2
slug: frameworks
---

# Framework & Platform Integration

Contentrain content is plain JSON and Markdown — **any platform that reads files can consume it**. The `@contentrain/query` SDK adds TypeScript type safety and a query API as an optional convenience layer. This guide covers setup patterns for popular frameworks and platforms.

## Starter Templates

Each framework has production-ready starter templates with content models, generated SDK client, and best practices pre-configured:

| Framework | Starters |
|---|---|
| **Astro** | [Blog](https://github.com/Contentrain/contentrain-starter-astro-blog), [Landing Page](https://github.com/Contentrain/contentrain-starter-astro-landing) |
| **Next.js** | [Commerce](https://github.com/Contentrain/contentrain-starter-next-commerce), [Multi-Surface SaaS](https://github.com/Contentrain/contentrain-starter-next-multi-surface-saas), [SaaS Dashboard](https://github.com/Contentrain/contentrain-starter-next-saas-dashboard), [White-Label Portal](https://github.com/Contentrain/contentrain-starter-next-white-label-portal) |
| **Nuxt** | [SaaS Marketing](https://github.com/Contentrain/contentrain-starter-nuxt-saas), [Admin Console](https://github.com/Contentrain/contentrain-starter-nuxt-admin-console) |
| **SvelteKit** | [Editorial](https://github.com/Contentrain/contentrain-starter-sveltekit-editorial) |
| **VitePress** | [Documentation](https://github.com/Contentrain/contentrain-starter-vitepress-docs) |

Each is a GitHub template — click **"Use this template"** to create your own repo.

## Universal Setup

Every framework follows the same initial steps:

### Step 1. Install the SDK

```bash
pnpm add @contentrain/query
```

### Step 2. Generate the typed client

```bash
npx contentrain generate
```

This reads `.contentrain/models/` and produces a typed client in `.contentrain/client/`. The generator automatically adds the subpath import to your `package.json`:

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

### Step 3. Import and query

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

::: tip
All SDK queries are synchronous. Content is bundled as static generated modules — no runtime API calls, no `await` needed.
:::

### Step 4. Run in watch mode during development

```bash
npx contentrain generate --watch
```

Any model or content change under `.contentrain/` triggers client regeneration automatically.

## Nuxt 3

### Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

Restart the Nuxt dev server after initial generation. Run watch mode alongside dev:

```bash
npx contentrain generate --watch &
npx nuxt dev
```

### Server-only imports

Treat `#contentrain` as **server-only** in Nuxt. Use it in Nitro server routes, server utilities, and route middleware. Do not import it directly in client-rendered Vue components.

### Page data loading

Load content through a server route, consume with `useAsyncData`:

```ts
// server/api/blog-posts.get.ts
import { query } from '#contentrain'
import { getQuery } from 'h3'

export default defineEventHandler((event) => {
  const locale = getQuery(event).locale?.toString() ?? 'en'
  return query('blog-post').locale(locale).sort('publishedAt', 'desc').all()
})
```

```vue
<script setup lang="ts">
const { data: posts } = await useAsyncData('blog-posts', () => $fetch('/api/blog-posts'))
</script>
```

### Dynamic routes

```ts
// server/api/blog-post/[slug].get.ts
import { document } from '#contentrain'
import { getRouterParam } from 'h3'

export default defineEventHandler((event) => {
  const slug = getRouterParam(event, 'slug')
  return document('blog-article').locale('en').bySlug(slug ?? '')
})
```

### i18n with @nuxtjs/i18n

```vue
<script setup lang="ts">
const { locale } = useI18n()
const { data: posts } = await useAsyncData(
  `posts-${locale.value}`,
  () => $fetch('/api/blog-posts', { query: { locale: locale.value } }),
  { watch: [locale] }
)
</script>
```

### Build and deploy

```bash
npx nuxt generate
```

All SDK calls resolve to static JSON reads — no runtime API calls during generation.

## Next.js (App Router)

### Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

Restart the Next.js dev server after initial generation.

```bash
npx contentrain generate --watch &
npx next dev
```

### React Server Components

SDK calls work directly in Server Components — no hooks, no client-side fetching:

```tsx
// app/blog/page.tsx
import { query } from '#contentrain'

export default async function BlogPage() {
  const posts = query('blog-post').locale('en').sort('publishedAt', 'desc').all()

  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### Dynamic routes with locale

```tsx
// app/[locale]/blog/[slug]/page.tsx
import { document } from '#contentrain'

interface Props {
  params: Promise<{ locale: string; slug: string }>
}

export default async function PostPage({ params }: Props) {
  const { locale, slug } = await params
  const post = document('blog-article').locale(locale).bySlug(slug)

  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.body}</div>
    </article>
  )
}
```

### Static params generation

```tsx
import { query } from '#contentrain'

export async function generateStaticParams() {
  const posts = query('blog-post').locale('en').all()
  return posts.map(post => ({ slug: post.slug }))
}
```

### Client Components

Client Components cannot import `#contentrain` directly. Fetch data in a Server Component and pass as props:

```tsx
// Server Component
import { singleton } from '#contentrain'
import HeroClient from './HeroClient'

export default async function HeroSection() {
  const hero = singleton('hero').locale('en').get()
  return <HeroClient data={hero} />
}
```

### Build and deploy

```bash
npx next build
```

For full static export, set `output: 'export'` in `next.config.js`.

## Astro

### Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

```bash
npx contentrain generate --watch &
npx astro dev
```

### Page components

SDK calls go in the frontmatter:

```astro
---
import { query } from '#contentrain'

const posts = query('blog-post').locale('en').sort('publishedAt', 'desc').all()
---

<ul>
  {posts.map(post => (
    <li><a href={`/blog/${post.slug}`}>{post.title}</a></li>
  ))}
</ul>
```

### Dynamic routes

```astro
---
import { query } from '#contentrain'

export function getStaticPaths() {
  const posts = query('blog-post').locale('en').all()
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post }
  }))
}

const { post } = Astro.props
---

<article>
  <h1>{post.title}</h1>
</article>
```

### i18n with Astro built-in routing

```astro
---
import { dictionary } from '#contentrain'

const locale = Astro.currentLocale ?? 'en'
const t = dictionary('ui-labels').locale(locale).get()
---

<button>{t.submit_button}</button>
<p>{t.welcome_message}</p>
```

### Islands architecture

Content fetched in static Astro component, passed to interactive islands:

```astro
---
import { query } from '#contentrain'
import SearchWidget from '../components/SearchWidget.tsx'

const posts = query('blog-post').locale('en').all()
---

<h1>Blog</h1>
<SearchWidget client:load posts={posts} />
```

### Build and deploy

```bash
npx astro build
```

Output goes to `dist/`. Content is baked into the HTML — zero runtime dependencies.

## SvelteKit

### Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

```bash
npx contentrain generate --watch &
npx vite dev
```

### Server load functions

Content loading belongs in `+page.server.ts` or `+layout.server.ts`:

```ts
// src/routes/blog/+page.server.ts
import { query } from '#contentrain'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = () => {
  const posts = query('blog-post').locale('en').sort('publishedAt', 'desc').all()
  return { posts }
}
```

```svelte
<!-- src/routes/blog/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types'
  export let data: PageData
</script>

<ul>
  {#each data.posts as post}
    <li><a href="/blog/{post.slug}">{post.title}</a></li>
  {/each}
</ul>
```

### Dynamic routes

```ts
// src/routes/blog/[slug]/+page.server.ts
import { document } from '#contentrain'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ params }) => {
  const post = document('blog-article').locale('en').bySlug(params.slug)
  if (!post) throw error(404, 'Post not found')
  return { post }
}
```

### Prerendering

```ts
// src/routes/blog/[slug]/+page.server.ts
import { query } from '#contentrain'

export const prerender = true

export function entries() {
  const posts = query('blog-post').locale('en').all()
  return posts.map(post => ({ slug: post.slug }))
}
```

### Build and deploy

```bash
npx vite build
```

Use the appropriate SvelteKit adapter for your platform.

## Vue 3 + Vite (SPA)

### Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

Restart the Vite dev server after generation.

### SFC usage

In a Vue SPA, direct imports work in any component:

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

## React + Vite (SPA)

### Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

Restart Vite after generation.

### Component usage

```tsx
import { query, singleton, dictionary } from '#contentrain'

export function HomePage() {
  const hero = singleton('hero').locale('en').get()
  const labels = dictionary('ui-labels').locale('en').get()
  const posts = query('blog-post').locale('en').all()

  return (
    <main>
      <h1>{hero.title}</h1>
      <button>{labels.cta_primary}</button>
      <ul>
        {posts.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </main>
  )
}
```

## Expo / React Native

### Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

### Bootstrap pattern

Expo uses a CJS bootstrap with async initialization:

```ts
// app/content.ts
let clientPromise: Promise<any> | null = null

export function getContentrainClient() {
  if (!clientPromise) {
    clientPromise = require('#contentrain').init()
  }
  return clientPromise
}
```

```tsx
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { getContentrainClient } from './content'

export function HomeScreen() {
  const [title, setTitle] = useState('')

  useEffect(() => {
    getContentrainClient().then((client) => {
      setTitle(client.singleton('hero').locale('en').get().title)
    })
  }, [])

  return (
    <View>
      <Text>{title}</Text>
    </View>
  )
}
```

::: info
Cache the client promise. Do not initialize on every render. Re-run `contentrain generate` after content or model changes.
:::

## tsconfig.json Paths

The `#contentrain` import uses Node.js native subpath imports (defined in `package.json`). No tsconfig paths are needed for runtime resolution.

For TypeScript IDE support, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16"
  }
}
```

Or with bundler resolution:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

Both resolve `#contentrain` from the `imports` field in `package.json` automatically.

## SSR Considerations

::: warning
**Server-side only.** The SDK reads from the file system. In SSR frameworks (Nuxt, Next.js, SvelteKit), use it only in server contexts:

- **Nuxt:** Nitro server routes, server middleware
- **Next.js:** React Server Components, route handlers, `generateStaticParams`
- **SvelteKit:** `+page.server.ts`, `+layout.server.ts`, `+server.ts`
- **Astro:** Component frontmatter (server by default)

For client components, fetch data server-side and pass it as props.
:::

## Build Verification

After setting up any framework, verify the build works:

::: code-group

```bash [Nuxt]
npx contentrain generate && npx nuxt build
```

```bash [Next.js]
npx contentrain generate && npx next build
```

```bash [Astro]
npx contentrain generate && npx astro build
```

```bash [SvelteKit]
npx contentrain generate && npx vite build
```

```bash [Vue/React Vite]
npx contentrain generate && npx vite build
```

:::

If the build succeeds with no import errors, the integration is working correctly.

## Type Safety

The generated client includes full TypeScript types for every model:

```ts
import { query } from '#contentrain'

// Fully typed — IDE autocomplete for field names and return types
const posts = query('blog-post').locale('en').all()
posts[0].title    // string
posts[0].author   // Author type when using .include('author')
```

Keep the generator running in watch mode during development to stay in sync with model changes.

## Deployment Flow

All frameworks share the same deployment pattern:

1. Content changes are committed to Git via MCP tools
2. Push triggers platform rebuild (Vercel, Netlify, Cloudflare Pages)
3. Build runs, SDK reads `.contentrain/` content
4. Static or server output is produced with embedded content

No external API dependency. No database. Content lives in Git.

::: info Non-Web Platforms
For mobile (React Native, Expo, Flutter) and desktop apps that can't read from Git at build time, [Contentrain Studio](/studio) publishes merged content to a CDN — same JSON, delivered over HTTP.
:::
