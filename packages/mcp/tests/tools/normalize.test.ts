import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })
import { join } from 'node:path'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { simpleGit } from 'simple-git'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../../src/server.js'

let testDir: string
let client: Client

async function initGitRepo(dir: string): Promise<void> {
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.name', 'Test')
  await git.addConfig('user.email', 'test@test.com')
  await writeFile(join(dir, '.gitkeep'), '')
  await git.add('.')
  await git.commit('initial')
}

async function createTestClient(projectRoot: string): Promise<Client> {
  const server = createServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const c = new Client({ name: 'test-client', version: '1.0.0' })
  await Promise.all([
    c.connect(clientTransport),
    server.connect(serverTransport),
  ])

  return c
}

function parseResult(result: unknown): Record<string, unknown> {
  const content = (result as { content: Array<{ text: string }> }).content
  return JSON.parse(content[0]!.text) as Record<string, unknown>
}

async function createSourceFiles(dir: string): Promise<void> {
  // Create directory structure
  await mkdir(join(dir, 'src', 'pages'), { recursive: true })
  await mkdir(join(dir, 'src', 'components'), { recursive: true })
  await mkdir(join(dir, 'src', 'layouts'), { recursive: true })

  // src/pages/home.tsx
  await writeFile(join(dir, 'src', 'pages', 'home.tsx'), `import React from 'react'
import { Hero } from '../components/Hero'
import { Footer } from '../components/Footer'

export default function Home() {
  const greeting = "Welcome to our platform"

  return (
    <div>
      <Hero title="Build amazing products" subtitle="Start your journey today" />
      <p>Our platform helps you build better software</p>
      <p>Join thousands of developers worldwide</p>
      <Footer />
    </div>
  )
}
`)

  // src/pages/about.tsx
  await writeFile(join(dir, 'src', 'pages', 'about.tsx'), `import React from 'react'

export default function About() {
  return (
    <div className="container mx-auto p-4">
      <h1>About Us</h1>
      <p>We are a team of passionate developers</p>
      <a href="mailto:hello@example.com">Contact Us</a>
    </div>
  )
}
`)

  // src/components/Hero.tsx
  await writeFile(join(dir, 'src', 'components', 'Hero.tsx'), `import React from 'react'

interface Props {
  title: string
  subtitle: string
}

export function Hero({ title, subtitle }: Props) {
  return (
    <section className="bg-blue-500 text-white p-8">
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <button className="rounded bg-white text-blue-500 px-4 py-2">Get Started</button>
    </section>
  )
}
`)

  // src/components/Footer.tsx
  await writeFile(join(dir, 'src', 'components', 'Footer.tsx'), `import React from 'react'

export function Footer() {
  return (
    <footer className="bg-gray-800 text-white p-4">
      <p>Copyright 2024 All rights reserved</p>
      <p>Terms of Service</p>
      <a href="/privacy">Privacy Policy</a>
    </footer>
  )
}
`)

  // src/layouts/Main.tsx
  await writeFile(join(dir, 'src', 'layouts', 'Main.tsx'), `import React from 'react'

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav><a href="/">Home</a></nav>
      <main>{children}</main>
    </div>
  )
}
`)
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'cr-scan-test-'))
  await initGitRepo(testDir)

  // Create source files before init so they exist during project setup
  await createSourceFiles(testDir)

  // Commit source files so git is clean
  const git = simpleGit(testDir)
  await git.add('.')
  await git.commit('add source files')

  // Create client and initialize project
  client = await createTestClient(testDir)
  await client.callTool({ name: 'contentrain_init', arguments: {} })

  // Re-create client after init
  client = await createTestClient(testDir)
})

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true })
})

describe('contentrain_scan mode:graph', () => {
  it('builds project graph', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'graph', paths: ['src'] },
    })

    const data = parseResult(result)
    expect(data['mode']).toBe('graph')

    const stats = data['stats'] as Record<string, number>
    expect(stats['total_files']).toBeGreaterThan(0)
    expect(stats['total_pages']).toBeGreaterThan(0)
    expect(stats['total_components']).toBeGreaterThan(0)

    const pages = data['pages'] as Array<Record<string, unknown>>
    expect(pages.length).toBeGreaterThan(0)

    // Home page should have strings
    const homePage = pages.find(p => (p['file'] as string).includes('home.tsx'))
    expect(homePage).toBeDefined()
    expect((homePage!['strings'] as number)).toBeGreaterThan(0)

    const components = data['components'] as Array<Record<string, unknown>>
    expect(components.length).toBeGreaterThan(0)

    // Hero component should be used_by home page
    const heroComp = components.find(c => (c['file'] as string).includes('Hero.tsx'))
    expect(heroComp).toBeDefined()
    expect((heroComp!['used_by'] as string[]).length).toBeGreaterThan(0)

    const layouts = data['layouts'] as Array<Record<string, unknown>>
    expect(layouts.length).toBeGreaterThan(0)
  })

  it('reports string counts per file', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'graph', paths: ['src'] },
    })

    const data = parseResult(result)
    const stats = data['stats'] as Record<string, number>
    expect(stats['total_strings_estimate']).toBeGreaterThan(0)
  })

  it('includes next_steps guidance', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'graph', paths: ['src'] },
    })

    const data = parseResult(result)
    const nextSteps = data['next_steps'] as string[]
    expect(nextSteps).toBeDefined()
    expect(nextSteps.length).toBeGreaterThan(0)
  })

  it('classifies files into pages, components, and layouts', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'graph', paths: ['src'] },
    })

    const data = parseResult(result)

    const pages = data['pages'] as Array<Record<string, unknown>>
    const components = data['components'] as Array<Record<string, unknown>>
    const layouts = data['layouts'] as Array<Record<string, unknown>>

    // We have 2 pages (home.tsx, about.tsx)
    expect(pages.length).toBe(2)

    // We have 2 components (Hero.tsx, Footer.tsx)
    expect(components.length).toBe(2)

    // We have 1 layout (Main.tsx)
    expect(layouts.length).toBe(1)
  })

  it('resolves import relationships', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'graph', paths: ['src'] },
    })

    const data = parseResult(result)
    const components = data['components'] as Array<Record<string, unknown>>

    // Footer is imported by home page
    const footerComp = components.find(c => (c['file'] as string).includes('Footer.tsx'))
    expect(footerComp).toBeDefined()
    const footerUsedBy = footerComp!['used_by'] as string[]
    expect(footerUsedBy.some(f => f.includes('home.tsx'))).toBe(true)
  })
})

describe('contentrain_scan mode:candidates', () => {
  it('extracts content string candidates', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'] },
    })

    const data = parseResult(result)
    expect(data['mode']).toBe('candidates')

    const stats = data['stats'] as Record<string, unknown>
    expect(stats['files_scanned']).toBeGreaterThan(0)
    expect(stats['after_filtering']).toBeGreaterThan(0)

    const candidates = data['candidates'] as Array<Record<string, unknown>>
    const values = candidates.map(c => c['value'] as string)

    // Should find real content strings
    expect(values).toContain('Welcome to our platform')
    expect(values).toContain('Build amazing products')
    expect(values).toContain('Get Started')
    expect(values).toContain('About Us')
  })

  it('filters non-content strings', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'] },
    })

    const data = parseResult(result)
    const candidates = data['candidates'] as Array<Record<string, unknown>>
    const values = candidates.map(c => c['value'] as string)

    // Should NOT contain URLs and route-like paths
    expect(values).not.toContain('mailto:hello@example.com')
    expect(values).not.toContain('/privacy')

    // Content strings should outnumber any leaked technical strings
    const contentLike = candidates.filter(c => {
      const v = c['value'] as string
      return /[A-Z]/.test(v) && v.includes(' ')
    })
    expect(contentLike.length).toBeGreaterThan(0)
  })

  it('supports pagination', async () => {
    const result1 = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'], limit: 3, offset: 0 },
    })

    const data1 = parseResult(result1)
    const candidates1 = data1['candidates'] as Array<Record<string, unknown>>
    expect(candidates1.length).toBeLessThanOrEqual(3)
  })

  it('returns different results for different pagination offsets', async () => {
    const result1 = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'], limit: 3, offset: 0 },
    })
    const result2 = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'], limit: 3, offset: 3 },
    })

    const data1 = parseResult(result1)
    const data2 = parseResult(result2)
    const values1 = (data1['candidates'] as Array<Record<string, unknown>>).map(c => c['value'] as string)
    const values2 = (data2['candidates'] as Array<Record<string, unknown>>).map(c => c['value'] as string)

    // The two batches should not overlap (assuming enough candidates exist)
    if (values1.length > 0 && values2.length > 0) {
      // There might be value duplicates across files, but the candidate objects should differ
      const ids1 = (data1['candidates'] as Array<Record<string, unknown>>).map(c => `${c['file']}:${c['line']}`)
      const ids2 = (data2['candidates'] as Array<Record<string, unknown>>).map(c => `${c['file']}:${c['line']}`)
      const idOverlap = ids1.filter(id => ids2.includes(id))
      expect(idOverlap.length).toBe(0)
    }
  })

  it('includes candidate metadata (file, line, context)', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'] },
    })

    const data = parseResult(result)
    const candidates = data['candidates'] as Array<Record<string, unknown>>
    expect(candidates.length).toBeGreaterThan(0)

    const first = candidates[0]!
    expect(first['file']).toBeDefined()
    expect(typeof first['file']).toBe('string')
    expect(first['line']).toBeDefined()
    expect(typeof first['line']).toBe('number')
    expect(first['column']).toBeDefined()
    expect(typeof first['column']).toBe('number')
    expect(first['value']).toBeDefined()
    expect(typeof first['value']).toBe('string')
    expect(first['context']).toBeDefined()
    expect(first['surrounding']).toBeDefined()
  })

  it('detects duplicate strings', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'] },
    })

    const data = parseResult(result)
    const duplicates = data['duplicates'] as Array<Record<string, unknown>>

    // duplicates is an array (may be empty if no string appears in 2+ places)
    expect(Array.isArray(duplicates)).toBe(true)

    // If there are duplicates, each should have value, count, and occurrences
    for (const dup of duplicates) {
      expect(dup['value']).toBeDefined()
      expect(typeof dup['count']).toBe('number')
      expect((dup['count'] as number)).toBeGreaterThanOrEqual(2)
      expect(Array.isArray(dup['occurrences'])).toBe(true)
    }
  })

  it('reports has_more correctly', async () => {
    // Get all candidates first
    const allResult = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates', paths: ['src'], limit: 1000 },
    })
    const allData = parseResult(allResult)
    const totalCandidates = (allData['stats'] as Record<string, unknown>)['after_filtering'] as number

    if (totalCandidates > 2) {
      // Request with small limit — has_more should be true
      const smallResult = await client.callTool({
        name: 'contentrain_scan',
        arguments: { mode: 'candidates', paths: ['src'], limit: 2, offset: 0 },
      })
      const smallData = parseResult(smallResult)
      const smallStats = smallData['stats'] as Record<string, unknown>
      expect(smallStats['has_more']).toBe(true)
    }
  })

  it('returns error if not initialized', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'cr-scan-empty-'))
    const git = simpleGit(emptyDir)
    await git.init()
    await git.addConfig('user.name', 'Test')
    await git.addConfig('user.email', 'test@test.com')
    await writeFile(join(emptyDir, '.gitkeep'), '')
    await git.add('.')
    await git.commit('initial')

    const emptyClient = await createTestClient(emptyDir)
    const result = await emptyClient.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'candidates' },
    })

    const data = parseResult(result)
    expect(data['error']).toContain('not initialized')

    await rm(emptyDir, { recursive: true, force: true })
  })
})

describe('contentrain_scan mode:summary', () => {
  it('returns project summary', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'summary', paths: ['src'] },
    })

    const data = parseResult(result)
    expect(data['mode']).toBe('summary')
    expect(data['total_files']).toBeGreaterThan(0)
    expect(data['total_candidates_estimate']).toBeGreaterThanOrEqual(0)

    const byDir = data['by_directory'] as Record<string, Record<string, number>>
    expect(Object.keys(byDir).length).toBeGreaterThan(0)

    const fileTypes = data['file_types'] as Record<string, number>
    expect(fileTypes['.tsx']).toBeGreaterThan(0)
  })

  it('breaks down stats by directory', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'summary', paths: ['src'] },
    })

    const data = parseResult(result)
    const byDir = data['by_directory'] as Record<string, Record<string, number>>

    // Should have entries for pages, components, layouts directories
    const dirKeys = Object.keys(byDir)
    expect(dirKeys.some(d => d.includes('pages'))).toBe(true)
    expect(dirKeys.some(d => d.includes('components'))).toBe(true)
    expect(dirKeys.some(d => d.includes('layouts'))).toBe(true)

    // Each directory entry should have files and candidates counts
    for (const dir of dirKeys) {
      const entry = byDir[dir]!
      expect(typeof entry['files']).toBe('number')
      expect(typeof entry['candidates']).toBe('number')
    }
  })

  it('includes top_repeated strings', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'summary', paths: ['src'] },
    })

    const data = parseResult(result)
    const topRepeated = data['top_repeated'] as Array<Record<string, unknown>>

    // top_repeated is an array (may be empty if no repeats in sample)
    expect(Array.isArray(topRepeated)).toBe(true)

    for (const entry of topRepeated) {
      expect(typeof entry['value']).toBe('string')
      expect(typeof entry['count']).toBe('number')
      expect((entry['count'] as number)).toBeGreaterThanOrEqual(2)
    }
  })

  it('includes next_steps guidance', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'summary', paths: ['src'] },
    })

    const data = parseResult(result)
    const nextSteps = data['next_steps'] as string[]
    expect(nextSteps).toBeDefined()
    expect(nextSteps.length).toBeGreaterThan(0)
  })
})

describe('contentrain_scan defaults', () => {
  it('defaults to candidates mode when mode is not specified', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { paths: ['src'] },
    })

    const data = parseResult(result)
    expect(data['mode']).toBe('candidates')
    expect(data['candidates']).toBeDefined()
    expect(data['stats']).toBeDefined()
  })

  it('auto-detects source directories when paths not specified', async () => {
    const result = await client.callTool({
      name: 'contentrain_scan',
      arguments: { mode: 'summary' },
    })

    const data = parseResult(result)
    // Should auto-detect src/ directory
    expect((data['total_files'] as number)).toBeGreaterThan(0)
  })
})
