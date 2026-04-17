import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanCandidates, scanSummary } from '../../src/core/scanner.js'

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 })

// ─── scanCandidates integration tests ───

describe('scanCandidates', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-scanner-test-'))

    await mkdir(join(testDir, 'src', 'pages'), { recursive: true })
    await mkdir(join(testDir, 'src', 'components'), { recursive: true })

    // JSX page file with various string types
    await writeFile(
      join(testDir, 'src', 'pages', 'home.tsx'),
      `
import React from 'react'
import { Button } from '../components/Button'

export default function Home() {
  const title = "Welcome to our platform"
  console.log("debug: rendering home page")

  return (
    <div className="flex items-center">
      <h1>{title}</h1>
      <p>Get started with our amazing product</p>
      <Button label="Sign Up" />
      <a href="https://docs.example.com">Documentation</a>
      <span style={{ color: '#ff0000' }}>Error: Something went wrong</span>
    </div>
  )
}
`,
    )

    // Component file
    await writeFile(
      join(testDir, 'src', 'components', 'Button.tsx'),
      `
import React from 'react'

interface Props {
  label: string
}

export function Button({ label }: Props) {
  return <button className="bg-blue-500 text-white rounded p-2">{label}</button>
}
`,
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('extracts string candidates from source files', async () => {
    const result = await scanCandidates(testDir, { paths: ['src'] })

    expect(result.stats.files_scanned).toBe(2)
    expect(result.stats.unique_candidates).toBeGreaterThan(0)

    const values = result.candidates.map(c => c.value)
    // Should find content strings
    expect(values).toContain('Welcome to our platform')
    expect(values).toContain('Sign Up')

    // Should NOT find filtered strings
    expect(values).not.toContain('https://docs.example.com')
    expect(values).not.toContain('#ff0000')
    expect(values).not.toContain('react')
    expect(values).not.toContain('bg-blue-500')
  })

  it('provides correct context types', async () => {
    const result = await scanCandidates(testDir, { paths: ['src'] })

    const welcomeCandidate = result.candidates.find(c => c.value === 'Welcome to our platform')
    expect(welcomeCandidate).toBeDefined()
    expect(welcomeCandidate!.context).toBe('variable_assignment')

    const signUpCandidate = result.candidates.find(c => c.value === 'Sign Up')
    expect(signUpCandidate).toBeDefined()
    expect(signUpCandidate!.context).toBe('jsx_attribute')
  })

  it('includes contentScore and occurrences on candidates', async () => {
    const result = await scanCandidates(testDir, { paths: ['src'] })

    for (const candidate of result.candidates) {
      expect(candidate.contentScore).toBeGreaterThanOrEqual(0)
      expect(candidate.contentScore).toBeLessThanOrEqual(1)
      expect(Array.isArray(candidate.occurrences)).toBe(true)
      expect(candidate.occurrences.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('candidates are sorted by contentScore descending', async () => {
    const result = await scanCandidates(testDir, { paths: ['src'], limit: 50 })

    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i]!.contentScore).toBeLessThanOrEqual(result.candidates[i - 1]!.contentScore)
    }
  })

  it('deduplicates candidates by value', async () => {
    // Add another file with a duplicate string
    await mkdir(join(testDir, 'src', 'layouts'), { recursive: true })
    await writeFile(
      join(testDir, 'src', 'layouts', 'Main.tsx'),
      `
export function Main() {
  return <div><h1>Welcome to our platform</h1></div>
}
`,
    )

    const result = await scanCandidates(testDir, { paths: ['src'], limit: 50 })

    // Should only have one candidate for the duplicated value
    const welcomeCandidates = result.candidates.filter(c => c.value === 'Welcome to our platform')
    expect(welcomeCandidates).toHaveLength(1)

    // But occurrences should list both locations
    const welcome = welcomeCandidates[0]!
    expect(welcome.occurrences.length).toBeGreaterThanOrEqual(2)

    // Duplicates section should also reflect this
    const dupe = result.duplicates.find(d => d.value === 'Welcome to our platform')
    if (dupe) {
      expect(dupe.count).toBeGreaterThanOrEqual(2)
    }
  })

  it('supports pagination with limit and offset', async () => {
    const result1 = await scanCandidates(testDir, { paths: ['src'], limit: 2, offset: 0 })
    expect(result1.candidates.length).toBeLessThanOrEqual(2)

    if (result1.stats.unique_candidates > 2) {
      expect(result1.stats.has_more).toBe(true)

      const result2 = await scanCandidates(testDir, { paths: ['src'], limit: 2, offset: 2 })
      expect(result2.candidates[0]?.value).not.toBe(result1.candidates[0]?.value)
    }
  })

  it('provides skip_reasons breakdown in stats', async () => {
    const result = await scanCandidates(testDir, { paths: ['src'] })

    expect(result.stats.skip_reasons).toBeDefined()
    expect(typeof result.stats.skip_reasons).toBe('object')
    // raw_strings_found counts strings after AST pre-filter; unique_candidates is after dedup
    expect(result.stats.raw_strings_found).toBeGreaterThanOrEqual(result.stats.unique_candidates)
  })

  it('respects min_length and max_length', async () => {
    const result = await scanCandidates(testDir, { paths: ['src'], min_length: 10 })
    for (const candidate of result.candidates) {
      expect(candidate.value.length).toBeGreaterThanOrEqual(10)
    }
  })

  it('respects min_score filter', async () => {
    // Very high threshold should filter most things
    const strict = await scanCandidates(testDir, { paths: ['src'], min_score: 0.95 })
    const lenient = await scanCandidates(testDir, { paths: ['src'], min_score: 0.1 })

    expect(strict.stats.unique_candidates).toBeLessThanOrEqual(lenient.stats.unique_candidates)
  })
})

// ─── scanSummary tests ───

describe('scanSummary', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'cr-scanner-summary-'))

    await mkdir(join(testDir, 'src', 'pages'), { recursive: true })
    await mkdir(join(testDir, 'src', 'components'), { recursive: true })

    await writeFile(
      join(testDir, 'src', 'pages', 'home.tsx'),
      `
import React from 'react'

export default function Home() {
  return (
    <div>
      <h1>Welcome to our platform</h1>
      <p>Get started with our amazing product</p>
    </div>
  )
}
`,
    )

    await writeFile(
      join(testDir, 'src', 'components', 'Header.tsx'),
      `
export function Header() {
  return <header><h2>Welcome to our platform</h2></header>
}
`,
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('returns summary with directory breakdown', async () => {
    const result = await scanSummary(testDir, { paths: ['src'] })

    expect(result.total_files).toBeGreaterThan(0)
    expect(result.total_candidates_estimate).toBeGreaterThanOrEqual(0)
    expect(Object.keys(result.by_directory).length).toBeGreaterThan(0)
    expect(Object.keys(result.file_types).length).toBeGreaterThan(0)
    expect(result.file_types['.tsx']).toBeGreaterThan(0)
  })

  it('detects top repeated strings', async () => {
    const result = await scanSummary(testDir, { paths: ['src'] })

    const repeated = result.top_repeated.find(r => r.value === 'Welcome to our platform')
    if (repeated) {
      expect(repeated.count).toBeGreaterThanOrEqual(2)
    }
  })

  it('groups files by directory', async () => {
    const result = await scanSummary(testDir, { paths: ['src'] })

    const dirs = Object.keys(result.by_directory)
    expect(dirs.length).toBeGreaterThanOrEqual(2)

    for (const dir of dirs) {
      expect(result.by_directory[dir]!.files).toBeGreaterThan(0)
    }
  })

  it('top_repeated is sample-based and includes sampling_note', async () => {
    await mkdir(join(testDir, 'src', 'bulk'), { recursive: true })

    for (let i = 1; i <= 12; i++) {
      const repeated = i >= 11 ? 'Late repeated label' : `Unique label ${i}`
      await writeFile(
        join(testDir, 'src', 'bulk', `file-${String(i).padStart(2, '0')}.tsx`),
        `export function File${i}() { return <div>${repeated}</div> }`,
      )
    }

    const result = await scanSummary(testDir, { paths: ['src'] })

    expect(result.sampling_note).toBeDefined()
    expect(result.sampling_note).toContain('sample')
    expect(result.top_repeated).toBeDefined()
    expect(result.total_candidates_estimate).toBeGreaterThan(0)
  })
})
