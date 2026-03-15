# Contentrain + React + Vite

> Framework guide for consuming the generated Contentrain client in a React SPA.

---

## 1. Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

Restart Vite after the first generation so `#contentrain` imports resolve.

---

## 2. Component Usage

In a React SPA, import directly from `#contentrain`:

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

Rules:

- queries are synchronous
- no `await query(...)`
- regenerated client data ships with the app bundle

### Relations

```tsx
const posts = query('blog-post').locale('en').include('author').all()
```

### Documents

```tsx
import { document } from '#contentrain'

const doc = document('doc-page').locale('en').bySlug('introduction')
```

---

## 3. Best Fit

Use this guide for client-rendered React apps.

For Next.js App Router projects, use the dedicated Next guide instead.

