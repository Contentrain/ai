import { describe, expect, it } from 'vitest'
import { validateProject } from '../../../src/core/validator/index.js'
import { OverlayReader } from '../../../src/core/overlay-reader.js'
import type { FileChange, RepoReader } from '../../../src/core/contracts/index.js'

/**
 * `validateProject(reader, options)` is the reader-backed overload
 * introduced in Phase 5.5b. Studio and any other consumer that wants
 * post-commit validation — reading from a `RepoProvider` or an
 * `OverlayReader` layered over pending `FileChange`s — depends on it.
 *
 * These tests pin the overload's contract so future refactors don't
 * accidentally break it.
 */

function makeInMemoryReader(files: Record<string, string>): RepoReader {
  return {
    async readFile(path) {
      const content = files[path]
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return content
    },
    async listDirectory(path) {
      const prefix = path.endsWith('/') ? path : `${path}/`
      const children = new Set<string>()
      for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) continue
        const rest = filePath.slice(prefix.length)
        const firstSegment = rest.split('/')[0]
        if (firstSegment) children.add(firstSegment)
      }
      return [...children].toSorted()
    },
    async fileExists(path) {
      return Object.hasOwn(files, path)
    },
  }
}

describe('validateProject reader overload', () => {
  it('validates a project read entirely through a RepoReader (no filesystem access)', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': JSON.stringify({
        version: 1,
        stack: 'next',
        workflow: 'auto-merge',
        locales: { default: 'en', supported: ['en'] },
        domains: ['marketing'],
      }),
      '.contentrain/models/hero.json': JSON.stringify({
        id: 'hero',
        name: 'Hero',
        kind: 'singleton',
        domain: 'marketing',
        i18n: false,
        fields: { title: { type: 'string', required: true } },
      }),
      '.contentrain/content/marketing/hero/data.json': JSON.stringify({ title: 'Welcome' }),
    })

    const result = await validateProject(reader)
    expect(result.valid).toBe(true)
    expect(result.summary.errors).toBe(0)
    expect(result.summary.models_checked).toBe(1)
  })

  it('surfaces errors from content read through the reader', async () => {
    // Missing required `title` on hero — validator must catch this
    // via the reader overload exactly the same way it catches it
    // when reading from disk.
    const reader = makeInMemoryReader({
      '.contentrain/config.json': JSON.stringify({
        version: 1,
        stack: 'next',
        workflow: 'auto-merge',
        locales: { default: 'en', supported: ['en'] },
        domains: ['marketing'],
      }),
      '.contentrain/models/hero.json': JSON.stringify({
        id: 'hero',
        name: 'Hero',
        kind: 'singleton',
        domain: 'marketing',
        i18n: false,
        fields: { title: { type: 'string', required: true } },
      }),
      '.contentrain/content/marketing/hero/data.json': JSON.stringify({}),
    })

    const result = await validateProject(reader)
    expect(result.valid).toBe(false)
    expect(result.summary.errors).toBeGreaterThan(0)
    expect(result.issues.some(i => i.field === 'title' && i.severity === 'error')).toBe(true)
  })

  it('sees pending writes when layered behind an OverlayReader', async () => {
    // Base state: no content file. The overlay adds one. Validator
    // must treat the pending FileChange as if it were committed —
    // this is the exact shape Studio uses to validate before a write
    // lands.
    const base = makeInMemoryReader({
      '.contentrain/config.json': JSON.stringify({
        version: 1,
        stack: 'next',
        workflow: 'auto-merge',
        locales: { default: 'en', supported: ['en'] },
        domains: ['marketing'],
      }),
      '.contentrain/models/hero.json': JSON.stringify({
        id: 'hero',
        name: 'Hero',
        kind: 'singleton',
        domain: 'marketing',
        i18n: false,
        fields: { title: { type: 'string', required: true } },
      }),
    })

    const pendingChanges: FileChange[] = [
      {
        path: '.contentrain/content/marketing/hero/data.json',
        content: JSON.stringify({ title: 'Pending' }),
      },
    ]
    const overlay = new OverlayReader(base, pendingChanges)

    const result = await validateProject(overlay, { model: 'hero' })
    expect(result.valid).toBe(true)
    expect(result.summary.errors).toBe(0)
  })
})
