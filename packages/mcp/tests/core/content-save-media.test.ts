import { describe, expect, it } from 'vitest'
import type { ContentrainConfig, ModelDefinition, RepoReader } from '@contentrain/types'
import { planContentSave } from '../../src/core/ops/content-save.js'

const BASE = 'https://cdn.test/api/cdn/v1/proj'

// planContentSave only ever calls reader.readFile; a reader that reports
// "nothing exists yet" is enough to exercise the create paths deterministically.
const emptyReader = {
  readFile: async () => { throw new Error('not found') },
} as unknown as RepoReader

const config: ContentrainConfig = {
  version: 1,
  stack: 'other',
  workflow: 'auto-merge',
  locales: { default: 'en', supported: ['en'] },
  domains: ['blog'],
}

function contentChange(plan: Awaited<ReturnType<typeof planContentSave>>): string {
  const change = plan.changes.find(ch => ch.path.includes('/content/'))
  if (!change) throw new Error('no content change in plan')
  return change.content
}

describe('planContentSave media normalization', () => {
  const collection: ModelDefinition = {
    id: 'posts',
    name: 'Posts',
    kind: 'collection',
    domain: 'blog',
    i18n: false,
    fields: {
      title: { type: 'string' },
      cover: { type: 'image' },
      gallery: { type: 'array', items: 'image' },
    },
  }

  it('rewrites media fields to delivery URLs when mediaBaseUrl is set (cloud mode)', async () => {
    const plan = await planContentSave(emptyReader, {
      model: collection,
      config,
      mediaBaseUrl: BASE,
      entries: [{ locale: 'en', data: {
        title: 'Hello',
        cover: 'media/original/a.webp',
        gallery: ['media/original/b.webp', 'https://ext.example/c.jpg'],
      } }],
    })

    const id = plan.result[0]!.id!
    const content = JSON.parse(contentChange(plan)) as Record<string, Record<string, unknown>>
    const entry = content[id]!
    expect(entry['title']).toBe('Hello')
    expect(entry['cover']).toBe(`${BASE}/media/original/a.webp`)
    expect((entry['gallery'] as string[])[0]).toBe(`${BASE}/media/original/b.webp`)
    expect((entry['gallery'] as string[])[1]).toBe('https://ext.example/c.jpg')
  })

  it('keeps relative media paths verbatim when no base is set (local mode)', async () => {
    const plan = await planContentSave(emptyReader, {
      model: collection,
      config,
      entries: [{ locale: 'en', data: { cover: 'media/original/a.webp' } }],
    })

    const id = plan.result[0]!.id!
    const content = JSON.parse(contentChange(plan)) as Record<string, Record<string, unknown>>
    expect(content[id]!['cover']).toBe('media/original/a.webp')
  })

  it('rewrites document frontmatter media and markdown body in cloud mode', async () => {
    const doc: ModelDefinition = {
      id: 'pages',
      name: 'Pages',
      kind: 'document',
      domain: 'blog',
      i18n: false,
      fields: { cover: { type: 'image' } },
    }

    const plan = await planContentSave(emptyReader, {
      model: doc,
      config,
      mediaBaseUrl: BASE,
      entries: [{ slug: 'about', locale: 'en', data: {
        cover: 'media/original/a.webp',
        body: 'Hero ![h](media/original/h.webp) and <img src="media/original/i.png"> end.',
      } }],
    })

    const md = contentChange(plan)
    expect(md).toContain(`${BASE}/media/original/a.webp`)
    expect(md).toContain(`](${BASE}/media/original/h.webp)`)
    expect(md).toContain(`src="${BASE}/media/original/i.png"`)
  })
})
