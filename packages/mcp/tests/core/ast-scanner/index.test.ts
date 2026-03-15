import { describe, expect, it } from 'vitest'
import { extractStrings } from '../../../src/core/ast-scanner/index.js'

describe('extractStrings orchestrator', () => {
  // ─── TSX routing ───

  describe('TSX/JSX/TS/JS routing', () => {
    it('routes .tsx files to tsx-parser and extracts JSX text', async () => {
      const content = `
import React from 'react'

export function Hero() {
  return <h1>Welcome to our platform</h1>
}
`
      const results = await extractStrings('Hero.tsx', content, '.tsx')
      const values = results.map(r => r.value)
      expect(values).toContain('Welcome to our platform')
      // Import path should be pre-filtered
      expect(values).not.toContain('react')
    })

    it('routes .jsx files to tsx-parser', async () => {
      const content = `
export function Button() {
  return <button>Click me</button>
}
`
      const results = await extractStrings('Button.jsx', content, '.jsx')
      const values = results.map(r => r.value)
      expect(values).toContain('Click me')
    })

    it('routes .ts files to tsx-parser', async () => {
      const content = `
const title = "Welcome"
const count = "42"
`
      const results = await extractStrings('config.ts', content, '.ts')
      const values = results.map(r => r.value)
      expect(values).toContain('Welcome')
      // "42" is a pure number string — should be pre-filtered
      expect(values).not.toContain('42')
    })

    it('routes .js files to tsx-parser', async () => {
      const content = `const greeting = "Hello World"`
      const results = await extractStrings('app.js', content, '.js')
      const values = results.map(r => r.value)
      expect(values).toContain('Hello World')
    })

    it('routes .mjs files to tsx-parser', async () => {
      const content = `export const message = "Good morning"`
      const results = await extractStrings('utils.mjs', content, '.mjs')
      const values = results.map(r => r.value)
      expect(values).toContain('Good morning')
    })
  })

  // ─── Vue routing ───

  describe('Vue routing', () => {
    it('routes .vue files (fallback to regex if vue-parser unavailable)', async () => {
      const content = `
<template>
  <h1>Hello from Vue</h1>
</template>

<script setup>
const title = "Dashboard"
</script>
`
      // This will use vue-parser if available, regex fallback otherwise
      const results = await extractStrings('Page.vue', content, '.vue')
      // Either path should extract some strings
      expect(results.length).toBeGreaterThan(0)
    })
  })

  // ─── Svelte/Astro routing ───

  describe('Svelte/Astro routing', () => {
    it('routes .svelte files (parser or regex fallback)', async () => {
      const content = `
<h1>Svelte App</h1>
<script>
  let name = "World"
</script>
`
      // This will use svelte-parser if available, regex fallback otherwise
      const results = await extractStrings('App.svelte', content, '.svelte')
      expect(results.length).toBeGreaterThan(0)
    })

    it('routes .astro files (parser or regex fallback)', async () => {
      const content = `
---
const title = "My Page"
---
<h1>Astro Page</h1>
`
      // This will use astro-parser if available, regex fallback otherwise
      const results = await extractStrings('index.astro', content, '.astro')
      expect(results.length).toBeGreaterThan(0)
    })
  })

  // ─── Unknown extensions ───

  describe('unknown extensions', () => {
    it('returns empty array for unknown file types', async () => {
      const results = await extractStrings('styles.css', 'body { color: red }', '.css')
      expect(results).toHaveLength(0)
    })

    it('returns empty array for .json files', async () => {
      const results = await extractStrings('data.json', '{"key": "value"}', '.json')
      expect(results).toHaveLength(0)
    })
  })

  // ─── Pre-filter integration ───

  describe('pre-filter integration', () => {
    it('removes import paths from tsx results', async () => {
      const content = `
import React from 'react'
import { Button } from './components/Button'

export function App() {
  return <h1>Hello World</h1>
}
`
      const results = await extractStrings('App.tsx', content, '.tsx')
      const values = results.map(r => r.value)
      expect(values).not.toContain('react')
      expect(values).not.toContain('./components/Button')
      expect(values).toContain('Hello World')
    })

    it('removes type annotations from ts results', async () => {
      const content = `
type Status = 'active' | 'inactive'
const label = "Active Users"
`
      const results = await extractStrings('types.ts', content, '.ts')
      const values = results.map(r => r.value)
      expect(values).not.toContain('active')
      expect(values).not.toContain('inactive')
      expect(values).toContain('Active Users')
    })

    it('removes single-char strings', async () => {
      const content = `
const separator = "/"
const title = "Welcome"
`
      const results = await extractStrings('utils.ts', content, '.ts')
      const values = results.map(r => r.value)
      expect(values).not.toContain('/')
      expect(values).toContain('Welcome')
    })

    it('removes pure number strings', async () => {
      const content = `
const maxRetries = "3"
const message = "3 retries remaining"
`
      const results = await extractStrings('config.ts', content, '.ts')
      const values = results.map(r => r.value)
      expect(values).not.toContain('3')
      expect(values).toContain('3 retries remaining')
    })
  })

  // ─── ExtractedString shape ───

  describe('result shape', () => {
    it('returns objects matching ExtractedString interface', async () => {
      const content = `
export function Greeting() {
  return <p>Hello there</p>
}
`
      const results = await extractStrings('Greeting.tsx', content, '.tsx')
      expect(results.length).toBeGreaterThan(0)

      const first = results[0]!
      expect(first).toHaveProperty('value')
      expect(first).toHaveProperty('line')
      expect(first).toHaveProperty('column')
      expect(first).toHaveProperty('context')
      expect(first).toHaveProperty('scope')
      expect(first).toHaveProperty('parent')
      expect(first).toHaveProperty('surrounding')

      expect(typeof first.value).toBe('string')
      expect(typeof first.line).toBe('number')
      expect(typeof first.column).toBe('number')
      expect(typeof first.context).toBe('string')
      expect(typeof first.scope).toBe('string')
      expect(typeof first.parent).toBe('string')
      expect(typeof first.surrounding).toBe('string')

      // line/column should be 1-based
      expect(first.line).toBeGreaterThanOrEqual(1)
      expect(first.column).toBeGreaterThanOrEqual(1)
    })

    it('normalizes extension with or without dot', async () => {
      const content = `const x = "test value"`
      const withDot = await extractStrings('a.ts', content, '.ts')
      const withoutDot = await extractStrings('a.ts', content, 'ts')
      expect(withDot.length).toBe(withoutDot.length)
    })
  })
})
