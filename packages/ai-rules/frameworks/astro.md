# Contentrain + Astro

> Framework guide for consuming Contentrain-managed content in Astro projects.

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

The generator adds this automatically. Restart the Astro dev server after initial generation.

### 1.2 Watch Mode

Run the generator alongside Astro dev:

```bash
npx contentrain-query generate --watch &
npx astro dev
```

---

## 2. Imports

All SDK functions are imported from the `#contentrain` subpath:

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

This import works in `.astro` component frontmatter, API routes, and any server-side script. The SDK reads JSON files from the file system — no runtime API calls.

---

## 3. Querying Content

### 3.1 Collections

```ts
const posts = query('blog-post').locale('en').all()
const featured = query('blog-post').locale('en').where('featured', true).all()
const sorted = query('blog-post').locale('en').sort('publishedAt', 'desc').all()
const post = query('blog-post').locale('en').where('id', 'abc-123').first()
```

### 3.2 Singletons

```ts
const hero = singleton('hero').locale('en').get()
```

### 3.3 Dictionaries

```ts
const label = dictionary('ui-labels').locale('en').get('submit_button')
const allLabels = dictionary('ui-labels').locale('en').get()
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

## 4. Astro Integration Patterns

### 4.1 Page Components

SDK calls go in the frontmatter (the `---` fenced section):

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

### 4.2 Dynamic Routes

For `src/pages/blog/[slug].astro`:

```astro
---
import { query, document } from '#contentrain'

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

### 4.3 Layout Data

Provide global content (navigation, footer) from layouts:

```astro
---
import { singleton, dictionary } from '#contentrain'

const nav = singleton('navigation').locale('en').get()
const footerLabels = dictionary('footer-labels').locale('en').get()
---

<nav>
  {nav.items.map(item => <a href={item.url}>{item.label}</a>)}
</nav>
<slot />
<footer>
  <!-- footer content -->
</footer>
```

---

## 5. i18n Integration

### 5.1 Astro Built-in i18n

Astro provides built-in i18n routing. Combine it with Contentrain locale support:

```astro
---
// src/pages/[locale]/blog/[slug].astro
import { document } from '#contentrain'

export function getStaticPaths() {
  const locales = ['en', 'tr', 'de']
  const paths = []
  for (const locale of locales) {
    const posts = document('blog-article').locale(locale).all()
    for (const post of posts) {
      paths.push({
        params: { locale, slug: post.slug },
        props: { post, locale }
      })
    }
  }
  return paths
}

const { post } = Astro.props
---

<article>
  <h1>{post.title}</h1>
</article>
```

### 5.2 Current Locale Access

Use `Astro.currentLocale` (available when i18n is configured in `astro.config.mjs`) to pass the locale to SDK calls:

```astro
---
import { query } from '#contentrain'

const locale = Astro.currentLocale ?? 'en'
const posts = query('blog-post').locale(locale).all()
---
```

### 5.3 Dictionary Strings

Contentrain dictionaries can serve as the translation source for UI strings:

```astro
---
import { dictionary } from '#contentrain'

const locale = Astro.currentLocale ?? 'en'
const t = dictionary('ui-labels').locale(locale).get()
---

<button>{t.submit_button}</button>
<p>{t.welcome_message}</p>
```

---

## 6. Content Collections Integration

### 6.1 Astro Content Collections

Astro's content collections can coexist with Contentrain. Define a collection that points to `.contentrain/content/`:

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content'

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.string()
  })
})

export const collections = { blog }
```

Symlink or copy `.contentrain/content/blog/` to `src/content/blog/` if using Astro's content layer, or use the SDK directly for simpler setups.

### 6.2 Markdown Rendering

For document-kind entries with markdown bodies, render them using Astro's built-in markdown support or a markdown component:

```astro
---
import { document } from '#contentrain'

const article = document('blog-article').locale('en').bySlug('getting-started')
---

<article>
  <h1>{article.title}</h1>
  <Fragment set:html={article.bodyHtml} />
</article>
```

---

## 7. Islands Architecture

### 7.1 Static Parent, Dynamic Child

Content data is fetched in the static Astro component and passed to interactive island components as props:

```astro
---
import { query } from '#contentrain'
import SearchWidget from '../components/SearchWidget.tsx'

const posts = query('blog-post').locale('en').all()
---

<!-- Static content -->
<h1>Blog</h1>

<!-- Interactive island with content data -->
<SearchWidget client:load posts={posts} />
```

The content is embedded in the static HTML. The island component receives it as serialized props — no client-side data fetching required.

---

## 8. Build and Deployment

### 8.1 Static Output (Default)

Astro builds static HTML by default. All SDK calls resolve at build time:

```bash
npx astro build
```

Output goes to `dist/`. Content is baked into the HTML — zero runtime dependencies.

### 8.2 SSR Mode

With SSR enabled (`output: 'server'` or `output: 'hybrid'` in `astro.config.mjs`), SDK calls execute on the server at request time. Content is still file-based.

### 8.3 Deployment Flow

1. Content changes are committed to Git via MCP tools.
2. Push triggers platform rebuild (Vercel, Netlify, Cloudflare Pages).
3. `astro build` runs, SDK reads `.contentrain/` content.
4. Static pages are generated with embedded content.

---

## 9. Type Safety

The generated client provides full TypeScript types:

```ts
import { query } from '#contentrain'

// Fully typed — autocomplete for all fields
const posts = query('blog-post').locale('en').all()
posts[0].title    // string
posts[0].author   // Author type when using .include('author')
```

Keep the generator running in watch mode during development to stay in sync with model changes.
