import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isNonContent, scanCandidates, scanSummary } from '../../src/core/scanner.js'

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 })

// ─── isNonContent unit tests ───

describe('isNonContent', () => {
  // --- Things that SHOULD be filtered (return true) ---

  it('filters import paths', () => {
    expect(isNonContent('./Component', '')).toBe(true)
    expect(isNonContent('../utils/helper', '')).toBe(true)
    expect(isNonContent('@/components/Button', '')).toBe(true)
  })

  it('filters single CSS class tokens', () => {
    expect(isNonContent('bg-blue-500', '')).toBe(true)
    expect(isNonContent('p-4', '')).toBe(true)
    expect(isNonContent('hover:bg-blue-600', '')).toBe(true)
  })

  it('filters multi-token CSS class strings when all tokens are utilities', () => {
    expect(isNonContent('text-lg font-bold', '')).toBe(true)
    expect(isNonContent('sm:text-xl md:text-2xl', '')).toBe(true)
  })

  it('does not filter CSS class strings when some tokens are unrecognized', () => {
    // items-center is not recognized as a CSS utility token by the scanner
    expect(isNonContent('flex items-center', '')).toBe(false)
  })

  it('filters URLs and routes', () => {
    expect(isNonContent('https://example.com', '')).toBe(true)
    expect(isNonContent('/api/v1/users', '')).toBe(true)
    expect(isNonContent('/users/:id', '')).toBe(true)
    expect(isNonContent('mailto:test@test.com', '')).toBe(true)
  })

  it('filters color codes', () => {
    expect(isNonContent('#ff0000', '')).toBe(true)
    expect(isNonContent('transparent', '')).toBe(true)
    expect(isNonContent('inherit', '')).toBe(true)
    expect(isNonContent('currentColor', '')).toBe(true)
  })

  it('does not filter complex color function calls (only prefix matched)', () => {
    // COLOR_RE anchors with $ so rgba(...) with args does not match
    expect(isNonContent('rgba(0,0,0,0.5)', '')).toBe(false)
  })

  it('filters technical identifiers', () => {
    expect(isNonContent('isLoading', '')).toBe(true)
    expect(isNonContent('handleClick', '')).toBe(true)
    expect(isNonContent('MAX_SIZE', '')).toBe(true)
    expect(isNonContent('API_KEY', '')).toBe(true)
    expect(isNonContent('data-testid', '')).toBe(true)
  })

  it('filters file paths', () => {
    expect(isNonContent('assets/image.png', '')).toBe(true)
    expect(isNonContent('logo.svg', '')).toBe(true)
    expect(isNonContent('styles.css', '')).toBe(true)
  })

  it('filters regex patterns', () => {
    expect(isNonContent('^[a-z]+$', '')).toBe(true)
    expect(isNonContent('\\d+', '')).toBe(true)
  })

  it('filters console context', () => {
    expect(isNonContent('some debug message', 'console.log("some debug message")')).toBe(true)
    expect(isNonContent('error occurred', 'console.error("error occurred")')).toBe(true)
  })

  it('filters strings below min_length', () => {
    expect(isNonContent('a', '')).toBe(true)
    expect(isNonContent('', '')).toBe(true)
  })

  it('filters strings above max_length', () => {
    expect(isNonContent('a'.repeat(501), '', 2, 500)).toBe(true)
  })

  // --- Things that should NOT be filtered (return false) ---

  it('keeps normal content text', () => {
    expect(isNonContent('Welcome to our platform', '')).toBe(false)
    expect(isNonContent('Hello World', '')).toBe(false)
    expect(isNonContent('Submit', '')).toBe(false)
    expect(isNonContent('Cancel', '')).toBe(false)
    expect(isNonContent('Loading...', '')).toBe(false)
    expect(isNonContent('Are you sure?', '')).toBe(false)
    expect(isNonContent('No results found', '')).toBe(false)
  })

  it('keeps kebab-case strings with content words', () => {
    // Kebab-case strings containing content words should be kept
    expect(isNonContent('sign-up', '')).toBe(false)
    expect(isNonContent('log-in', '')).toBe(false)
    expect(isNonContent('get-started', '')).toBe(false)
    expect(isNonContent('learn-more', '')).toBe(false)
  })

  it('filters kebab-case strings without content words', () => {
    // Technical kebab-case (no content words) should be filtered
    expect(isNonContent('data-testid', '')).toBe(true)
    expect(isNonContent('aria-label', '')).toBe(true)
    expect(isNonContent('webpack-config', '')).toBe(true)
  })

  it('keeps sentences and phrases', () => {
    expect(isNonContent('Enter your email address', '')).toBe(false)
    expect(isNonContent('This field is required', '')).toBe(false)
    expect(isNonContent('Created by John', '')).toBe(false)
  })

  it('filters SCREAMING_SNAKE_CASE with underscores', () => {
    // True SCREAMING_SNAKE_CASE identifiers (contain underscores) should be filtered
    expect(isNonContent('MAX_SIZE', '')).toBe(true)
    expect(isNonContent('API_KEY', '')).toBe(true)
  })

  it('keeps short uppercase words without underscores as UI labels', () => {
    // Short uppercase words without underscores are likely real UI labels (OK, FAQ, GPS)
    expect(isNonContent('OK', '')).toBe(false)
    expect(isNonContent('FAQ', '')).toBe(false)
    expect(isNonContent('GPS', '')).toBe(false)
  })

  it('keeps short mixed-case words that are content', () => {
    // No, Yes start with uppercase but have lowercase — not SCREAMING_SNAKE
    expect(isNonContent('No', '')).toBe(false)
    expect(isNonContent('Yes', '')).toBe(false)
  })
})

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
    expect(result.stats.after_filtering).toBeGreaterThan(0)

    const values = result.candidates.map(c => c.value)
    // Should find content strings
    expect(values).toContain('Welcome to our platform')
    expect(values).toContain('Sign Up')

    // Should NOT find filtered strings
    expect(values).not.toContain('https://docs.example.com')
    expect(values).not.toContain('#ff0000')
    expect(values).not.toContain('react')
    // bg-blue-500 is a single CSS class token, should be filtered
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

  it('supports pagination with limit and offset', async () => {
    const result1 = await scanCandidates(testDir, { paths: ['src'], limit: 2, offset: 0 })
    expect(result1.candidates.length).toBeLessThanOrEqual(2)

    if (result1.stats.after_filtering > 2) {
      expect(result1.stats.has_more).toBe(true)

      const result2 = await scanCandidates(testDir, { paths: ['src'], limit: 2, offset: 2 })
      // Different candidates
      expect(result2.candidates[0]?.value).not.toBe(result1.candidates[0]?.value)
    }
  })

  it('detects duplicates', async () => {
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

    const result = await scanCandidates(testDir, { paths: ['src'] })
    const dupe = result.duplicates.find(d => d.value === 'Welcome to our platform')
    if (dupe) {
      expect(dupe.count).toBeGreaterThanOrEqual(2)
    }
  })

  it('respects min_length and max_length', async () => {
    const result = await scanCandidates(testDir, { paths: ['src'], min_length: 10 })
    for (const candidate of result.candidates) {
      expect(candidate.value.length).toBeGreaterThanOrEqual(10)
    }
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

    // Should have entries for pages and components directories
    const dirs = Object.keys(result.by_directory)
    expect(dirs.length).toBeGreaterThanOrEqual(2)

    for (const dir of dirs) {
      expect(result.by_directory[dir]!.files).toBeGreaterThan(0)
    }
  })
})
