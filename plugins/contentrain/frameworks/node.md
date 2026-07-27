# Contentrain + Node.js

> Framework guide for direct server-side use of the generated Contentrain client.

---

## 1. ESM Usage

For ESM apps, import from `#contentrain` directly:

```ts
import { query, singleton, dictionary, document } from '#contentrain'

const hero = singleton('hero').locale('en').get()
const posts = query('blog-post').locale('en').all()
const labels = dictionary('ui-labels').locale('en').get()
const article = document('blog-article').locale('en').bySlug('getting-started')
```

This is the correct path for:

- modern Node ESM apps
- server scripts
- Express/Fastify codebases running as ESM

## 2. CommonJS Usage

For CommonJS consumers, initialize first:

```js
async function run() {
  const client = await require('#contentrain').init()
  const hero = client.singleton('hero').locale('en').get()
  const posts = client.query('blog-post').locale('en').all()
  return { hero, posts }
}
```

Use this pattern for:

- NestJS
- legacy CommonJS servers
- mixed CJS toolchains

## 3. Express Example

```ts
import express from 'express'
import { query } from '#contentrain'

const app = express()

app.get('/api/posts', (_req, res) => {
  res.json(query('blog-post').locale('en').all())
})
```

## 4. Rules

- ESM: direct `import` from `#contentrain`
- CJS: `await require('#contentrain').init()`
- do not expect runtime writes; this is generated static content access

