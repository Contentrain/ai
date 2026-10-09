import type { ContentrainConfig, ModelDefinition } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { planContentSave } from '../../../src/core/ops/content-save.js'
import type { RepoReader } from '../../../src/core/contracts/index.js'

/**
 * A document's frontmatter can hold lines the reader does not turn into fields: a key with a space or a Turkish
 * letter, a nested map, a comment. They used to be dropped silently, so the next content_save erased them.
 */

const MODEL: ModelDefinition = {
  id: 'pages',
  name: 'Pages',
  kind: 'document',
  domain: 'marketing',
  i18n: true,
  title_field: 'title',
  fields: { title: { type: 'string', required: true }, slug: { type: 'slug', required: true } },
}
const CONFIG = {
  version: 1, stack: 'nuxt', workflow: 'review',
  locales: { default: 'en', supported: ['en'] }, domains: ['marketing'],
} as unknown as ContentrainConfig

const DOC_PATH = '.contentrain/content/marketing/pages/a/en.md'
const readerOf = (raw: string): RepoReader => ({
  readFile: (path: string) => path === DOC_PATH ? Promise.resolve(raw) : Promise.reject(new Error(`ENOENT ${path}`)),
  listDirectory: () => Promise.resolve([]),
  fileExists: (path: string) => Promise.resolve(path === DOC_PATH),
})
const saveTitle = async (raw: string, data: Record<string, unknown>) => {
  const plan = await planContentSave(readerOf(raw), { model: MODEL, config: CONFIG, entries: [{ slug: 'a', locale: 'en', data }] })
  return { plan, md: plan.changes.find(c => c.path === DOC_PATH)!.content! }
}

describe('planContentSave — frontmatter it cannot read survives a save', () => {
  it.each([
    ['a Turkish key', '---\ntitle: A\nyazar adı: Ayşe\nslug: a\n---\n\nBody\n'],
    ['a key with a space', '---\ntitle: A\nfirst name: Ada\nslug: a\n---\n\nBody\n'],
    ['a nested map', '---\ntitle: A\nseo:\n  title: T\n  noindex: true\nslug: a\n---\n\nBody\n'],
    ['a comment', '---\ntitle: A\n# keep me\nslug: a\n---\n\nBody\n'],
  ])('%s is byte-identical after saving an unchanged field', async (_name, raw) => {
    const { md } = await saveTitle(raw, { title: 'A' })
    expect(md).toBe(raw)
  })

  it('keeps the block while another field changes', async () => {
    const { md } = await saveTitle('---\ntitle: A\nyazar adı: Ayşe\nslug: a\n---\n\nBody\n', { title: 'B' })
    expect(md).toBe('---\ntitle: B\nyazar adı: Ayşe\nslug: a\n---\n\nBody\n')
  })

  it('a saved value for a preserved key wins, is written once, and is announced', async () => {
    const { md, plan } = await saveTitle('---\ntitle: A\nseo:\n  title: T\nslug: a\n---\n\nBody\n', { seo: { title: 'N' } })
    expect(md.match(/^seo:/gm)).toHaveLength(1)
    expect(md).not.toContain('title: T')
    expect(plan.advisories.some(a => a.includes('"seo"'))).toBe(true)
  })
})
