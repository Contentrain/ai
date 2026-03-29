import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanCandidates, scanSummary } from '../../../src/core/scanner.js'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })

let hasSvelteParser = false
let hasAstroParser = false

beforeEach(async () => {
  hasSvelteParser = await moduleAvailable('svelte')
  hasAstroParser = await moduleAvailable('@astrojs/compiler')
})

describe('ast-scanner mixed-framework integration', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-ast-scanner-mixed-'))

    await mkdir(join(testDir, 'app', 'pages'), { recursive: true })
    await mkdir(join(testDir, 'src', 'app'), { recursive: true })
    await mkdir(join(testDir, 'src', 'screens'), { recursive: true })
    await mkdir(join(testDir, 'src', 'components'), { recursive: true })
    await mkdir(join(testDir, 'src', 'pages'), { recursive: true })
    await mkdir(join(testDir, 'src', 'lib'), { recursive: true })

    await writeFile(
      join(testDir, 'app', 'pages', 'index.vue'),
      `<template>
  <section class="flex items-center text-xl">
    <h1>Platforma Hos Geldin</h1>
    <UiButton label="Teklifi Al" />
    <a href="/pricing">Fiyatlari Incele</a>
  </section>
</template>

<script setup lang="ts">
import { useHead } from '#imports'

const seo = {
  title: 'Platforma Hos Geldin',
  description: 'Uretime daha hizli basla',
}

useHead({ title: seo.title })
console.log('debug: home')
</script>
`,
    )

    await writeFile(
      join(testDir, 'src', 'app', 'page.tsx'),
      `import Link from 'next/link'

export default function Page() {
  const cta = "Teklifi Al"

  return (
    <main className="flex items-center text-xl">
      <h2>Bugun Basla</h2>
      <button aria-label="Sepete ekle">{cta}</button>
      <Link href="/checkout">Odeme</Link>
    </main>
  )
}
`,
    )

    await writeFile(
      join(testDir, 'src', 'screens', 'HomeScreen.tsx'),
      `import { Pressable, Text } from 'react-native'

export function HomeScreen() {
  return (
    <>
      <Text>Uygulamayi kesfet</Text>
      <Pressable accessibilityLabel="Devam et">
        <Text>Devam et</Text>
      </Pressable>
    </>
  )
}
`,
    )

    await writeFile(
      join(testDir, 'src', 'lib', 'messages.ts'),
      `export const messages = {
  emptyState: "No items yet",
  submitLabel: "Save changes",
  apiRoute: "/api/v1/items",
  brandColor: "#ff0000",
}

console.info("ignore this")
`,
    )

    await writeFile(
      join(testDir, 'src', 'lib', 'routes.js'),
      `export const routes = {
  home: '/home',
  pricing: '/pricing',
  checkout: '/checkout',
}
`,
    )

    if (hasSvelteParser) {
      await writeFile(
        join(testDir, 'src', 'components', 'Hero.svelte'),
        `<script>
  import { goto } from '$app/navigation'

  const title = "Svelte ile hizli"
</script>

<section>
  <h2>Denemeye basla</h2>
  <button aria-label="Plani sec">Plani sec</button>
</section>
`,
      )
    }

    if (hasAstroParser) {
      await writeFile(
        join(testDir, 'src', 'pages', 'index.astro'),
        `---
const title = "Astro ile hizli";
---

<html>
  <body>
    <h1>{title}</h1>
    <p>Belgeleri oku</p>
  </body>
</html>
`,
      )
    }
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('finds visible content strings across Vue, React, Expo, Svelte, Astro, JS and TS files', async () => {
    const result = await scanCandidates(testDir, {
      paths: ['app', 'src'],
    })

    const values = result.candidates.map(c => c.value)

    expect(result.stats.files_scanned).toBe(5 + Number(hasSvelteParser) + Number(hasAstroParser))
    expect(values).toContain('Platforma Hos Geldin')
    expect(values).toContain('Uretime daha hizli basla')
    expect(values).toContain('Teklifi Al')
    expect(values).toContain('Bugun Basla')
    expect(values).toContain('Sepete ekle')
    expect(values).toContain('Uygulamayi kesfet')
    expect(values).toContain('Devam et')
    expect(values).toContain('No items yet')
    expect(values).toContain('Save changes')
    if (hasSvelteParser) {
      expect(values).toContain('Svelte ile hizli')
      expect(values).toContain('Denemeye basla')
      expect(values).toContain('Plani sec')
    }

    if (hasAstroParser) {
      expect(values).toContain('Astro ile hizli')
      expect(values).toContain('Belgeleri oku')
    }
  })

  it('filters import paths, routes, css utilities, console strings and color literals across frameworks', async () => {
    const result = await scanCandidates(testDir, {
      paths: ['app', 'src'],
    })

    const values = result.candidates.map(c => c.value)

    expect(values).not.toContain('#imports')
    expect(values).not.toContain('next/link')
    expect(values).not.toContain('react-native')
    if (hasSvelteParser) {
      expect(values).not.toContain('$app/navigation')
    }
    expect(values).not.toContain('/pricing')
    expect(values).not.toContain('/checkout')
    expect(values).not.toContain('/api/v1/items')
    expect(values).not.toContain('#ff0000')
    expect(values).not.toContain('debug: home')
    expect(values).not.toContain('ignore this')
    expect(values).not.toContain('flex items-center text-xl')
  })

  it('preserves structural context metadata for framework-specific extractions', async () => {
    const result = await scanCandidates(testDir, {
      paths: ['app', 'src'],
    })

    const vueHeading = result.candidates.find(c => c.value === 'Platforma Hos Geldin' && c.file.endsWith('index.vue'))
    expect(vueHeading).toBeDefined()
    expect(vueHeading!.context).toBe('template_text')

    const reactAria = result.candidates.find(c => c.value === 'Sepete ekle')
    expect(reactAria).toBeDefined()
    expect(reactAria!.context).toBe('jsx_attribute')

    const messagesValue = result.candidates.find(c => c.value === 'Save changes')
    expect(messagesValue).toBeDefined()
    expect(messagesValue!.context).toBe('object_value')

    if (hasAstroParser) {
      const astroTitle = result.candidates.find(c => c.value === 'Astro ile hizli')
      expect(astroTitle).toBeDefined()
      expect(astroTitle!.file.endsWith('index.astro')).toBe(true)
    }
  })

  it('detects repeated UI strings across framework boundaries', async () => {
    const result = await scanCandidates(testDir, {
      paths: ['app', 'src'],
    })

    const repeated = result.duplicates.find(d => d.value === 'Teklifi Al')
    expect(repeated).toBeDefined()
    expect(repeated!.count).toBeGreaterThanOrEqual(2)
  })

  it('supports directory exclusion without breaking mixed-framework scanning', async () => {
    const result = await scanCandidates(testDir, {
      paths: ['app', 'src'],
      exclude: ['screens'],
    })

    const values = result.candidates.map(c => c.value)
    expect(values).not.toContain('Uygulamayi kesfet')
    expect(values).not.toContain('Devam et')
    expect(values).toContain('Platforma Hos Geldin')
    if (hasSvelteParser) {
      expect(values).toContain('Svelte ile hizli')
    }
  })
})

describe('ast-scanner mixed-framework summary', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-ast-scanner-summary-'))

    await mkdir(join(testDir, 'app'), { recursive: true })
    await mkdir(join(testDir, 'src', 'components'), { recursive: true })
    await mkdir(join(testDir, 'src', 'screens'), { recursive: true })

    await writeFile(
      join(testDir, 'app', 'page.vue'),
      `<template><h1>Teklifi Al</h1></template>`,
    )

    await writeFile(
      join(testDir, 'src', 'components', 'Hero.tsx'),
      `export function Hero() { return <button>Teklifi Al</button> }`,
    )

    await writeFile(
      join(testDir, 'src', 'screens', 'HomeScreen.tsx'),
      `export function HomeScreen() { return <Text>Devam et</Text> }`,
    )

    if (hasSvelteParser) {
      await writeFile(
        join(testDir, 'src', 'components', 'Hero.svelte'),
        `<section><p>Teklifi Al</p></section>`,
      )
    }
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('reports file types, directories and repeated strings across framework files', async () => {
    const result = await scanSummary(testDir, {
      paths: ['app', 'src'],
    })

    expect(result.total_files).toBe(3 + Number(hasSvelteParser))
    expect(result.file_types['.vue']).toBe(1)
    expect(result.file_types['.tsx']).toBe(2)
    if (hasSvelteParser) {
      expect(result.file_types['.svelte']).toBe(1)
    }

    expect(result.by_directory['app']?.files).toBe(1)
    expect(result.by_directory['src/components']?.files).toBe(1 + Number(hasSvelteParser))
    expect(result.by_directory['src/screens']?.files).toBe(1)

    const repeated = result.top_repeated.find(r => r.value === 'Teklifi Al')
    expect(repeated).toBeDefined()
    expect(repeated!.count).toBeGreaterThanOrEqual(hasSvelteParser ? 3 : 2)
  })
})

async function moduleAvailable(specifier: string): Promise<boolean> {
  try {
    await import(specifier)
    return true
  } catch {
    return false
  }
}
