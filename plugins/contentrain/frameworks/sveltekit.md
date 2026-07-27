# Contentrain + SvelteKit

> Framework guide for consuming Contentrain-managed content in SvelteKit applications.

---

## 1. Setup

### 1.1 SDK Installation

```bash
pnpm add @contentrain/query   # or npm/yarn
npx contentrain generate
```

The generator reads `.contentrain/models/` and produces a typed client in `.contentrain/client/`. Your `package.json` must include the subpath import:

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

The generator adds this automatically. Restart the SvelteKit dev server after initial generation.

### 1.2 Watch Mode

Run the generator alongside SvelteKit dev:

```bash
npx contentrain generate --watch &
npx vite dev
```

---

## 2. Imports

All SDK functions are imported from the `#contentrain` subpath:

```ts
import { query, singleton, dictionary, document } from '#contentrain'
```

This import works in server load functions (`+page.server.ts`, `+layout.server.ts`), API routes (`+server.ts`), and any server-side module. The SDK reads JSON files from the file system — no runtime API calls.

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

## 4. SvelteKit Integration Patterns

### 4.1 Server Load Functions

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

The corresponding page component receives the data:

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

### 4.2 Dynamic Routes

For `src/routes/blog/[slug]/+page.server.ts`:

```ts
import { document } from '#contentrain'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ params }) => {
  const post = document('blog-article').locale('en').bySlug(params.slug)
  if (!post) throw error(404, 'Post not found')
  return { post }
}
```

### 4.3 Layout Data

Provide global content (navigation, footer) from a layout load function:

```ts
// src/routes/+layout.server.ts
import { singleton, dictionary } from '#contentrain'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = () => {
  const nav = singleton('navigation').locale('en').get()
  const footerLabels = dictionary('footer-labels').locale('en').get()
  return { nav, footerLabels }
}
```

### 4.4 API Routes

SDK works in SvelteKit API routes:

```ts
// src/routes/api/posts/+server.ts
import { query } from '#contentrain'
import { json } from '@sveltejs/kit'

export function GET() {
  const posts = query('blog-post').locale('en').all()
  return json(posts)
}
```

---

## 5. i18n Integration

### 5.1 Locale from Route Parameters

For `src/routes/[locale]/blog/+page.server.ts`:

```ts
import { query } from '#contentrain'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ params }) => {
  const posts = query('blog-post').locale(params.locale).sort('publishedAt', 'desc').all()
  return { posts, locale: params.locale }
}
```

### 5.2 Locale from locals

Set locale in a hook and access it via `locals`:

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit'

export const handle: Handle = ({ event, resolve }) => {
  const locale = event.params.locale ?? 'en'
  event.locals.locale = locale
  return resolve(event)
}
```

Then in load functions:

```ts
export const load: PageServerLoad = ({ locals }) => {
  const posts = query('blog-post').locale(locals.locale).all()
  return { posts }
}
```

### 5.3 With sveltekit-i18n or Paraglide

Contentrain dictionaries can supplement i18n libraries. Use `dictionary()` for content-driven strings and the i18n library for app-level translations, or use Contentrain as the single source for all strings.

### 5.4 Dictionary Strings in Components

```svelte
<script lang="ts">
  import type { PageData } from './$types'
  export let data: PageData
</script>

<button>{data.labels.submit_button}</button>
<p>{data.labels.welcome_message}</p>
```

---

## 6. Markdown and Document Content

### 6.1 Rendering Markdown

For document-kind entries with markdown bodies, use `mdsvex` or a markdown renderer:

```svelte
<script lang="ts">
  import type { PageData } from './$types'
  export let data: PageData
</script>

<article>
  <h1>{data.post.title}</h1>
  {@html data.post.bodyHtml}
</article>
```

### 6.2 mdsvex Integration

If using `mdsvex` for `.svelte.md` files, you can point it at Contentrain markdown content or use the SDK to load document metadata and render bodies separately.

---

## 7. Prerendering and Deployment

### 7.1 Static Pages

Mark pages for prerendering:

```ts
// src/routes/blog/+page.server.ts
export const prerender = true
```

Or prerender the entire site:

```ts
// src/routes/+layout.server.ts
export const prerender = true
```

### 7.2 Entry Generator

For dynamic routes, provide all possible parameter values:

```ts
// src/routes/blog/[slug]/+page.server.ts
import { query } from '#contentrain'

export const prerender = true

export function entries() {
  const posts = query('blog-post').locale('en').all()
  return posts.map(post => ({ slug: post.slug }))
}
```

### 7.3 Build and Deploy

```bash
npx vite build
```

Use the appropriate SvelteKit adapter for your platform (`adapter-static`, `adapter-vercel`, `adapter-netlify`, `adapter-cloudflare`).

### 7.4 Deployment Flow

1. Content changes are committed to Git via MCP tools.
2. Push triggers platform rebuild.
3. `vite build` runs, SDK reads `.contentrain/` content.
4. Static or server output is produced with embedded content.

---

## 8. Type Safety

The generated client provides full TypeScript types:

```ts
import { query } from '#contentrain'

// Fully typed — autocomplete for all fields
const posts = query('blog-post').locale('en').all()
posts[0].title    // string
posts[0].author   // Author type when using .include('author')
```

Keep the generator running in watch mode during development to stay in sync with model changes.
