# Contentrain + Next.js 14+ (App Router)

> Framework guide for consuming Contentrain-managed content in Next.js applications using the App Router.

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

The generator adds this automatically. Restart the Next.js dev server after initial generation.

### 1.2 Watch Mode

Run the generator alongside Next.js dev:

```bash
npx contentrain-query generate --watch &
npx next dev
```

---

## 2. Imports

All SDK functions are imported from the `#contentrain` subpath:

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

This import works in React Server Components, server actions, route handlers, and `generateStaticParams`. The SDK reads JSON files from the file system — no runtime API calls.

---

## 3. Querying Content

### 3.1 Collections

```ts
const posts = query('blog-post').locale('en').all()
const featured = query('blog-post').locale('en').filter({ featured: true }).all()
const sorted = query('blog-post').locale('en').sort('publishedAt', 'desc').all()
const post = query('blog-post').locale('en').byId('abc-123')
```

### 3.2 Singletons

```ts
const hero = singleton('hero').locale('en').get()
```

### 3.3 Dictionaries

```ts
const label = dictionary('ui-labels').locale('en').get('submit_button')
const allLabels = dictionary('ui-labels').locale('en').all()
```

### 3.4 Documents

```ts
const article = document('blog-article').locale('en').bySlug('getting-started')
```

### 3.5 Relations

```ts
const posts = query('blog-post').locale('en').include('author', 'tags').all()
// post.author → full author object
// post.tags → array of full tag objects
```

---

## 4. App Router Integration

### 4.1 React Server Components

SDK calls work directly in Server Components — no `use` wrapper, no `useEffect`, no client-side fetching:

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

### 4.2 Dynamic Routes with Locale

For `app/[locale]/blog/[slug]/page.tsx`:

```tsx
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

### 4.3 Static Params Generation

Pre-generate all content pages at build time:

```tsx
import { query } from '#contentrain'

export async function generateStaticParams() {
  const posts = query('blog-post').locale('en').all()
  return posts.map(post => ({ slug: post.slug }))
}
```

For multi-locale static generation:

```tsx
import { query } from '#contentrain'

const locales = ['en', 'tr', 'de']

export async function generateStaticParams() {
  const params = []
  for (const locale of locales) {
    const posts = query('blog-post').locale(locale).all()
    for (const post of posts) {
      params.push({ locale, slug: post.slug })
    }
  }
  return params
}
```

### 4.4 Route Handlers

SDK works in route handlers for API-style access:

```ts
// app/api/posts/route.ts
import { query } from '#contentrain'
import { NextResponse } from 'next/server'

export function GET() {
  const posts = query('blog-post').locale('en').all()
  return NextResponse.json(posts)
}
```

### 4.5 Client Components

Client Components cannot import `#contentrain` directly (it reads from the file system). Fetch data in a Server Component and pass it as props:

```tsx
// Server Component
import { singleton } from '#contentrain'
import HeroClient from './HeroClient'

export default async function HeroSection() {
  const hero = singleton('hero').locale('en').get()
  return <HeroClient data={hero} />
}
```

---

## 5. i18n Integration

### 5.1 With next-intl

```tsx
import { query } from '#contentrain'
import { getLocale } from 'next-intl/server'

export default async function BlogPage() {
  const locale = await getLocale()
  const posts = query('blog-post').locale(locale).all()
  // ...
}
```

### 5.2 With Built-in i18n Routing

Use the `[locale]` route segment to determine the active locale, then pass it to SDK calls. Contentrain dictionaries can supplement or replace `next-intl` message files for content-driven strings.

---

## 6. Markdown and MDX

### 6.1 Document Body Rendering

For document-kind entries with markdown bodies, use `next-mdx-remote` or a markdown renderer:

```tsx
import { document } from '#contentrain'
import { MDXRemote } from 'next-mdx-remote/rsc'

export default async function DocPage({ params }: Props) {
  const { slug } = await params
  const doc = document('doc-page').locale('en').bySlug(slug)

  return (
    <article>
      <h1>{doc.title}</h1>
      <MDXRemote source={doc.body} />
    </article>
  )
}
```

### 6.2 Custom Components in MDX

Pass custom component mappings to the MDX renderer to control how markdown elements render in your design system.

---

## 7. Build and Deployment

### 7.1 Static Export

Contentrain content is fully static. Use `output: 'export'` in `next.config.js` for full static generation:

```js
// next.config.js
module.exports = {
  output: 'export'
}
```

### 7.2 ISR and Server Mode

In server mode, SDK calls execute at request time (or at build time for statically generated pages). Content is still file-based — no external API dependency. Redeploy to pick up content changes.

### 7.3 Deployment Flow

1. Content changes are committed to Git via MCP tools.
2. Push triggers platform rebuild (Vercel, Netlify).
3. `next build` runs, SDK reads `.contentrain/` content.
4. Static pages are generated with embedded content.

---

## 8. Type Safety

The generated client provides full TypeScript types:

```tsx
import { query } from '#contentrain'

// Fully typed — autocomplete for all fields
const posts = query('blog-post').locale('en').all()
posts[0].title    // string
posts[0].author   // Author type when using .include('author')
```

Keep the generator running in watch mode during development to stay in sync with model changes.
