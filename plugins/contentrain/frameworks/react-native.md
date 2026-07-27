# Contentrain + React Native

> Framework guide for bare React Native / Metro consumers of the generated Contentrain client.

---

## 1. Setup

```bash
pnpm add @contentrain/query
npx contentrain generate
```

React Native uses the generated CommonJS bootstrap path. Do not expect direct ESM `#contentrain` imports inside Metro components.

---

## 2. Bootstrap the Client Once

Create a small loader module:

```ts
// src/contentrain.ts
let clientPromise: Promise<any> | null = null

export function getContentrainClient() {
  if (!clientPromise) {
    clientPromise = require('#contentrain').init()
  }
  return clientPromise
}
```

This ensures the generated client is initialized once and reused across screens.

---

## 3. Use It in Screens

```tsx
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { getContentrainClient } from './contentrain'

export function HomeScreen() {
  const [heroTitle, setHeroTitle] = useState('')

  useEffect(() => {
    getContentrainClient().then((client) => {
      setHeroTitle(client.singleton('hero').locale('en').get().title)
    })
  }, [])

  return (
    <View>
      <Text>{heroTitle}</Text>
    </View>
  )
}
```

Collections and dictionaries work the same way:

```ts
getContentrainClient().then((client) => {
  const posts = client.query('blog-post').locale('en').all()
  const labels = client.dictionary('ui-labels').locale('en').get()
})
```

---

## 4. Rules

- initialize with `require('#contentrain').init()`
- cache the promise; do not initialize in every component render
- treat the generated client as static read-only data
- re-run `contentrain generate` after model or content changes

If the project is Expo-based, use the dedicated Expo guide. The runtime pattern is similar, but Expo-specific tooling and structure differ.
