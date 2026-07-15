import { describe, expect, it } from 'vitest'
import { CdnDocumentQuery } from '../../src/cdn/document-query.js'
import type { DocumentDataSource, DocumentIndexEntry } from '../../src/cdn/data-source.js'

/** The generated shape for a document model: flat frontmatter plus `body`. */
interface GuideSection {
  slug: string
  title: string
  platform: string
  order: number
  body: string
}

/**
 * Mirrors the real CDN: `_index` holds frontmatter only, per-slug docs hold the
 * body. The cast models exactly what the transport does — an unchecked
 * assertion over whatever JSON comes back.
 */
function sourceOf(
  index: Array<Omit<GuideSection, 'body'>>,
  bodies: Record<string, string> = {},
): DocumentDataSource<GuideSection> {
  return {
    getIndex: async () => index as DocumentIndexEntry<GuideSection>[],
    getBySlug: async (slug) => {
      const fm = index.find(i => i.slug === slug)
      if (!fm) return null
      return {
        frontmatter: { ...fm, body: bodies[slug] ?? '' } as GuideSection,
        body: bodies[slug] ?? '',
        html: `<p>${bodies[slug] ?? ''}</p>`,
      }
    },
  }
}

const INDEX = [
  { slug: 'tiktok-1', title: 'TikTok Basics', platform: 'tiktok', order: 2 },
  { slug: 'tiktok-2', title: 'TikTok Ads', platform: 'tiktok', order: 1 },
  { slug: 'yt-1', title: 'YouTube Intro', platform: 'youtube', order: 1 },
]

describe('CdnDocumentQuery', () => {
  it('returns index entries from all()', async () => {
    const q = new CdnDocumentQuery(sourceOf(INDEX), 'tr')
    const items = await q.all()
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ slug: 'tiktok-1', title: 'TikTok Basics' })
  })

  it('filters and sorts index entries', async () => {
    const q = new CdnDocumentQuery(sourceOf(INDEX), 'tr')
    const items = await q.where('platform', 'eq', 'tiktok').sort('order', 'asc').all()
    expect(items.map(i => i.slug)).toEqual(['tiktok-2', 'tiktok-1'])
  })

  it('returns the body only through bySlug()', async () => {
    const q = new CdnDocumentQuery(sourceOf(INDEX, { 'tiktok-1': 'Prose here.' }), 'tr')
    const doc = await q.bySlug('tiktok-1')
    expect(doc?.body).toBe('Prose here.')
    expect(doc?.html).toBe('<p>Prose here.</p>')
  })

  it('returns null from bySlug() for an unknown slug', async () => {
    const q = new CdnDocumentQuery(sourceOf(INDEX), 'tr')
    expect(await q.bySlug('nope')).toBeNull()
  })

  it('counts and firsts off the index', async () => {
    const q = new CdnDocumentQuery(sourceOf(INDEX), 'tr')
    expect(await q.count()).toBe(3)
    expect((await q.sort('order', 'asc').first())?.slug).toBe('tiktok-2')
  })

  // The runtime half of the trap: the body really is absent from all() results.
  // The type-level half — that reading it fails to compile — lives in
  // document-query.test-d.ts, since tsconfig.json does not cover tests.
  it('really has no body on all() results at runtime', async () => {
    const q = new CdnDocumentQuery(sourceOf(INDEX, { 'tiktok-1': 'Prose here.' }), 'tr')
    const items = await q.all()
    expect((items[0] as Record<string, unknown>)['body']).toBeUndefined()
  })
})
