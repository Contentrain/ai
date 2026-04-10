import { describe, it, expect, vi, afterEach } from 'vitest'
import { CdnCollectionQuery } from '../../src/cdn/collection-query.js'
import { HttpTransport } from '../../src/cdn/http-transport.js'

function mockFetchResponse(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

const sampleData: Record<string, { question: string; answer: string; order: number }> = {
  aaa: { question: 'What?', answer: 'This', order: 2 },
  bbb: { question: 'How?', answer: 'That', order: 1 },
  ccc: { question: 'Why?', answer: 'Because', order: 3 },
}

describe('CdnCollectionQuery', () => {
  afterEach(() => { vi.restoreAllMocks() })

  function createQuery() {
    vi.stubGlobal('fetch', mockFetchResponse(sampleData))
    const transport = new HttpTransport({
      baseUrl: 'https://cdn.test/v1',
      projectId: 'p1',
      apiKey: 'key',
    })
    return new CdnCollectionQuery<{ id: string; question: string; answer: string; order: number }>(transport, 'faq', 'en')
  }

  it('all() returns all entries with id injected', async () => {
    const q = createQuery()
    const items = await q.all()
    expect(items).toHaveLength(3)
    expect(items[0]!.id).toBe('aaa')
  })

  it('where(eq) filters entries', async () => {
    const q = createQuery()
    const items = await q.where('question', 'eq', 'What?').all()
    expect(items).toHaveLength(1)
    expect(items[0]!.answer).toBe('This')
  })

  it('where(gt) filters by number', async () => {
    const q = createQuery()
    const items = await q.where('order', 'gt', 1).all()
    expect(items).toHaveLength(2)
  })

  it('where(in) filters by array membership', async () => {
    const q = createQuery()
    const items = await q.where('question', 'in', ['What?', 'Why?']).all()
    expect(items).toHaveLength(2)
  })

  it('where(contains) matches string content', async () => {
    const q = createQuery()
    const items = await q.where('answer', 'contains', 'Th').all()
    expect(items).toHaveLength(2) // This, That
  })

  it('sort() orders results', async () => {
    const q = createQuery()
    const items = await q.sort('order', 'asc').all()
    expect(items.map(i => i.order)).toEqual([1, 2, 3])
  })

  it('sort(desc) reverses order', async () => {
    const q = createQuery()
    const items = await q.sort('order', 'desc').all()
    expect(items.map(i => i.order)).toEqual([3, 2, 1])
  })

  it('limit() caps results', async () => {
    const q = createQuery()
    const items = await q.sort('order', 'asc').limit(2).all()
    expect(items).toHaveLength(2)
    expect(items[0]!.order).toBe(1)
  })

  it('offset() skips results', async () => {
    const q = createQuery()
    const items = await q.sort('order', 'asc').offset(1).limit(1).all()
    expect(items).toHaveLength(1)
    expect(items[0]!.order).toBe(2)
  })

  it('first() returns first match', async () => {
    const q = createQuery()
    const item = await q.sort('order', 'asc').first()
    expect(item?.order).toBe(1)
  })

  it('locale() changes fetch locale', async () => {
    const trData = { xxx: { question: 'Ne?', answer: 'Bu', order: 1 } }
    vi.stubGlobal('fetch', mockFetchResponse(trData))
    const transport = new HttpTransport({
      baseUrl: 'https://cdn.test/v1',
      projectId: 'p1',
      apiKey: 'key',
    })
    const q = new CdnCollectionQuery<{ id: string; question: string; answer: string; order: number }>(transport, 'faq')
    const items = await q.locale('tr').all()
    expect(items[0]!.question).toBe('Ne?')
  })

  it('chaining is fluent', async () => {
    const q = createQuery()
    const items = await q
      .locale('en')
      .where('order', 'gte', 2)
      .sort('order', 'desc')
      .limit(1)
      .all()
    expect(items).toHaveLength(1)
    expect(items[0]!.order).toBe(3)
  })

  it('count() returns number of results', async () => {
    const q = createQuery()
    const count = await q.count()
    expect(count).toBe(3)
  })

  it('count() respects filters', async () => {
    const q = createQuery()
    const count = await q.where('order', 'gt', 1).count()
    expect(count).toBe(2)
  })

  it('withMeta() enriches entries with _meta field', async () => {
    const metaData = {
      aaa: { status: 'published', updated_by: 'user1' },
      bbb: { status: 'draft', publish_at: '2026-05-01T00:00:00Z' },
      ccc: { status: 'published' },
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      const body = (url as string).includes('meta/') ? metaData : sampleData
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
      })
    }))
    const transport = new HttpTransport({
      baseUrl: 'https://cdn.test/v1',
      projectId: 'p1',
      apiKey: 'key',
    })
    const q = new CdnCollectionQuery<{ id: string; question: string; answer: string; order: number }>(transport, 'faq', 'en')
    const items = await q.withMeta().all()
    expect(items).toHaveLength(3)
    const first = items[0] as Record<string, unknown>
    expect(first._meta).toEqual({ status: 'published', updated_by: 'user1' })
  })

  it('withMeta() gracefully handles missing meta endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('meta/')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('Not Found'),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(sampleData),
        text: () => Promise.resolve(JSON.stringify(sampleData)),
      })
    }))
    const transport = new HttpTransport({
      baseUrl: 'https://cdn.test/v1',
      projectId: 'p1',
      apiKey: 'key',
    })
    const q = new CdnCollectionQuery<{ id: string; question: string; answer: string; order: number }>(transport, 'faq', 'en')
    const items = await q.withMeta().all()
    expect(items).toHaveLength(3)
    // No _meta field when meta endpoint is unavailable
    const first = items[0] as Record<string, unknown>
    expect(first._meta).toBeUndefined()
  })
})
