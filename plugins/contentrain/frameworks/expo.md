# Contentrain + Expo / React Native

> Framework guide for Metro-style consumers of the generated Contentrain client.

---

## 1. Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

The generated client exposes a CommonJS bootstrap path for Metro-like consumers.

---

## 2. Bootstrap Pattern

Use the CJS wrapper and initialize it once:

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

Then use it from app code:

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

---

## 3. Rules

- use `require('#contentrain').init()` for the bootstrap
- cache the promise; do not initialize on every render
- treat the client as read-only generated data
- re-run `contentrain generate` after content/model changes

