import { describe, expect, it } from 'vitest'
import { validateProject } from '../../../src/core/validator/index.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

/**
 * `unique` was gated on a validation context that only the collection validator
 * ever passed, so it was silently a no-op for documents — which is exactly where
 * every shipped template declares it (`templates/blog.ts`, `docs.ts`,
 * `ecommerce.ts`, `saas.ts` all carry `slug: { type: 'slug', unique: true }`).
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
      if (Object.hasOwn(files, path)) return true
      const prefix = path.endsWith('/') ? path : `${path}/`
      return Object.keys(files).some(f => f.startsWith(prefix))
    },
  }
}

const CONFIG = JSON.stringify({
  version: 1,
  stack: 'nuxt',
  workflow: 'review',
  locales: { default: 'en', supported: ['en'] },
  domains: ['blog'],
})

const DOC_MODEL = JSON.stringify({
  id: 'posts', name: 'Posts', kind: 'document', domain: 'blog', i18n: true,
  fields: {
    title: { type: 'string', required: true },
    sku: { type: 'string', unique: true },
  },
})

const doc = (title: string, sku: string) => `---\ntitle: ${title}\nsku: ${sku}\n---\n\nBody.\n`

describe('unique on document models', () => {
  it('flags a duplicate value across two documents', () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/posts.json': DOC_MODEL,
      '.contentrain/content/blog/posts/first/en.md': doc('First', 'ABC-1'),
      '.contentrain/content/blog/posts/second/en.md': doc('Second', 'ABC-1'),
    })

    return validateProject(reader).then((result) => {
      const dupes = result.issues.filter(i => /must be unique/.test(i.message))
      expect(dupes.length).toBeGreaterThan(0)
      expect(dupes[0]!.severity).toBe('error')
      expect(dupes.some(i => i.field === 'sku')).toBe(true)
      expect(result.valid).toBe(false)
    })
  })

  it('stays quiet when every document carries a distinct value', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/posts.json': DOC_MODEL,
      '.contentrain/content/blog/posts/first/en.md': doc('First', 'ABC-1'),
      '.contentrain/content/blog/posts/second/en.md': doc('Second', 'ABC-2'),
    })

    const result = await validateProject(reader)
    expect(result.issues.filter(i => /must be unique/.test(i.message))).toEqual([])
  })

  it('does not compare a document against itself', async () => {
    const reader = makeInMemoryReader({
      '.contentrain/config.json': CONFIG,
      '.contentrain/models/posts.json': DOC_MODEL,
      '.contentrain/content/blog/posts/only/en.md': doc('Only', 'ABC-1'),
    })

    const result = await validateProject(reader)
    expect(result.issues.filter(i => /must be unique/.test(i.message))).toEqual([])
  })

  it('scopes uniqueness to one locale', async () => {
    // The same sku in en and tr is a translation, not a collision.
    const reader = makeInMemoryReader({
      '.contentrain/config.json': JSON.stringify({
        version: 1,
        stack: 'nuxt',
        workflow: 'review',
        locales: { default: 'en', supported: ['en', 'tr'] },
        domains: ['blog'],
      }),
      '.contentrain/models/posts.json': DOC_MODEL,
      '.contentrain/content/blog/posts/first/en.md': doc('First', 'ABC-1'),
      '.contentrain/content/blog/posts/first/tr.md': doc('Birinci', 'ABC-1'),
    })

    const result = await validateProject(reader)
    expect(result.issues.filter(i => /must be unique/.test(i.message))).toEqual([])
  })
})
