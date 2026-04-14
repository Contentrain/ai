---
name: bundler-config
description: "Framework-specific bundler configuration for #contentrain subpath imports"
---

# Bundler Configuration for #contentrain

The `#contentrain` import requires subpath imports configuration in `package.json` and bundler-specific aliases.

## package.json (all frameworks)

```json
{
  "imports": {
    "#contentrain": "./.contentrain/client/index.mjs"
  }
}
```

## Vite (Vue, React, Svelte)

```typescript
// vite.config.ts
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '#contentrain': resolve(__dirname, '.contentrain/client/index.mjs')
    }
  }
})
```

## Next.js

```javascript
// next.config.mjs
import { resolve } from 'node:path'

export default {
  webpack(config) {
    config.resolve.alias['#contentrain'] = resolve(process.cwd(), '.contentrain/client/index.mjs')
    return config
  }
}
```

## Nuxt 3

```typescript
// nuxt.config.ts
import { resolve } from 'node:path'

export default defineNuxtConfig({
  alias: {
    '#contentrain': resolve(__dirname, '.contentrain/client/index.mjs')
  }
})
```

**Important:** Treat `#contentrain` as **server-only** in Nuxt. Use in server routes, server plugins, and `useAsyncData` callbacks only.

## SvelteKit

```javascript
// svelte.config.js
import { resolve } from 'node:path'

export default {
  kit: {
    alias: {
      '#contentrain': resolve('.contentrain/client/index.mjs')
    }
  }
}
```

## Expo / React Native (Metro)

```javascript
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)
config.resolver.extraNodeModules = {
  '#contentrain': path.resolve(__dirname, '.contentrain/client/index.cjs')
}
module.exports = config
```

**Bootstrap required:**
```javascript
// App.js (before any #contentrain import)
require('#contentrain').init()
```

## Node.js (pure ESM)

No alias needed — Node.js natively supports `#imports` in `package.json`:

```json
{
  "type": "module",
  "imports": {
    "#contentrain": "./.contentrain/client/index.mjs"
  }
}
```

## Node.js (CJS)

```json
{
  "imports": {
    "#contentrain": "./.contentrain/client/index.cjs"
  }
}
```

Bootstrap required:
```javascript
const contentrain = require('#contentrain')
await contentrain.init()
```

## Watch Mode

For development, run the generator in watch mode to auto-regenerate on model/content changes:

```bash
npx contentrain generate --watch
```
