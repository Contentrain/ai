import { describe, it, expect, vi, afterEach } from 'vitest'
import { HttpTransport } from '../../src/cdn/http-transport.js'
import { createContentrain } from '../../src/cdn/index.js'

interface Route {
  body?: unknown
  status?: number
  etag?: string
}

/** Routing mock with ETag/304 support: If-None-Match matching the route's etag → 304. */
function routedFetch(routes: Record<string, Route>) {
  return vi.fn().mockImplementation(async (url: string, init?: { headers?: Record<string, string> }) => {
    for (const [pattern, route] of Object.entries(routes)) {
      if (!url.includes(pattern)) continue
      if (route.etag && init?.headers?.['If-None-Match'] === route.etag) {
        return {
          ok: false,
          status: 304,
          headers: { get: () => null },
          json: () => Promise.resolve(null),
          text: () => Promise.resolve(''),
        }
      }
      const status = route.status ?? 200
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (key: string) => (key.toLowerCase() === 'etag' ? route.etag ?? null : null) },
        json: () => Promise.resolve(route.body),
        text: () => Promise.resolve(JSON.stringify(route.body)),
      }
    }
    return {
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
      text: () => Promise.resolve('Not Found'),
    }
  })
}

function requestedUrls(mock: ReturnType<typeof routedFetch>): string[] {
  return mock.mock.calls.map(call => call[0] as string)
}

const BUNDLE_EN = {
  version: '1',
  commitSha: 'abc123',
  builtAt: '2026-07-10T12:00:00.000Z',
  locale: 'en',
  paths: {
    'content/team/en.json': { a1: { name: 'Alice' } },
    'content/settings/data.json': { theme: 'dark' },
    'documents/articles/_index/en.json': [{ slug: 'intro', title: 'Intro' }],
  },
}

describe('HttpTransport bundle preload', () => {
  const config = {
    baseUrl: 'https://cdn.example.com/v1',
    projectId: 'proj-123',
    apiKey: 'crn_live_test',
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('serves primed paths from the bundle with a single network call', async () => {
    const mock = routedFetch({ '_bundle/en.json': { body: BUNDLE_EN } })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    const items = await transport.collection<{ id: string; name: string }>('team').getAll('en')
    const index = await transport.document('articles').getIndex('en')

    expect(items).toEqual([{ id: 'a1', name: 'Alice' }])
    expect(index).toEqual([{ slug: 'intro', title: 'Intro' }])
    expect(requestedUrls(mock)).toEqual(['https://cdn.example.com/v1/proj-123/_bundle/en.json'])
  })

  it('falls back to per-path fetch for paths outside the bundle (doc bodies)', async () => {
    const docBody = { frontmatter: { title: 'Intro' }, body: '# Intro', html: '<h1>Intro</h1>' }
    const mock = routedFetch({
      '_bundle/en.json': { body: BUNDLE_EN },
      'documents/articles/intro/en.json': { body: docBody },
    })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    const doc = await transport.document('articles').getBySlug('intro', 'en')

    expect(doc).toEqual(docBody)
    expect(requestedUrls(mock)).toEqual([
      'https://cdn.example.com/v1/proj-123/_bundle/en.json',
      'https://cdn.example.com/v1/proj-123/documents/articles/intro/en.json',
    ])
  })

  it('falls back on bundle 404 and retries after revalidateMs', async () => {
    vi.useFakeTimers()
    const mock = routedFetch({
      'content/team/en.json': { body: { a1: { name: 'Alice' } } },
    })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    const source = transport.collection<{ id: string; name: string }>('team')

    const first = await source.getAll('en')
    expect(first).toEqual([{ id: 'a1', name: 'Alice' }])

    // Within the revalidate window: missing state is cached, bundle NOT retried
    await source.getAll('en')
    expect(requestedUrls(mock).filter(url => url.includes('_bundle'))).toHaveLength(1)

    // Past the window: bundle retried
    vi.advanceTimersByTime(60_001)
    await source.getAll('en')
    expect(requestedUrls(mock).filter(url => url.includes('_bundle'))).toHaveLength(2)
  })

  it('revalidates with 304 and keeps primed data', async () => {
    vi.useFakeTimers()
    const mock = routedFetch({ '_bundle/en.json': { body: BUNDLE_EN, etag: '"b1"' } })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    const source = transport.collection<{ id: string; name: string }>('team')

    await source.getAll('en')
    vi.advanceTimersByTime(60_001)
    const items = await source.getAll('en')

    expect(items).toEqual([{ id: 'a1', name: 'Alice' }])
    const urls = requestedUrls(mock)
    expect(urls).toHaveLength(2)
    expect(urls.every(url => url.includes('_bundle/en.json'))).toBe(true)
    // Second bundle request was conditional
    expect(mock.mock.calls[1]![1]).toMatchObject({
      headers: expect.objectContaining({ 'If-None-Match': '"b1"' }),
    })
  })

  it('evicts primed paths removed from a fresh bundle', async () => {
    vi.useFakeTimers()
    const routes: Record<string, Route> = {
      '_bundle/en.json': {
        body: { version: '1', paths: { 'content/old/en.json': { source: 'bundle' } } },
      },
      'content/old/en.json': { body: { source: 'network' } },
    }
    const mock = routedFetch(routes)
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    const primed = await transport.fetch('content/old/en.json')
    expect(primed).toEqual({ source: 'bundle' })

    // Model deleted: fresh bundle no longer lists the path
    routes['_bundle/en.json'] = { body: { version: '1', paths: {} } }
    vi.advanceTimersByTime(60_001)

    const evicted = await transport.fetch('content/old/en.json')
    expect(evicted).toEqual({ source: 'network' })
  })

  it('treats unknown bundle version as missing', async () => {
    const mock = routedFetch({
      '_bundle/en.json': { body: { ...BUNDLE_EN, version: '2' } },
      'content/team/en.json': { body: { a1: { name: 'Network Alice' } } },
    })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    const items = await transport.collection<{ id: string; name: string }>('team').getAll('en')

    expect(items).toEqual([{ id: 'a1', name: 'Network Alice' }])
  })

  it('serves non-i18n data.json paths from the defaultLocale bundle', async () => {
    const bundleTr = { ...BUNDLE_EN, locale: 'tr' }
    const mock = routedFetch({ '_bundle/tr.json': { body: bundleTr } })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true, defaultLocale: 'tr' })
    const settings = await transport.fetch('content/settings/data.json')

    expect(settings).toEqual({ theme: 'dark' })
    expect(requestedUrls(mock)).toEqual(['https://cdn.example.com/v1/proj-123/_bundle/tr.json'])
  })

  it('dedupes concurrent first fetches into a single bundle request', async () => {
    const mock = routedFetch({ '_bundle/en.json': { body: BUNDLE_EN } })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    const [items, settings, index] = await Promise.all([
      transport.fetch('content/team/en.json'),
      transport.fetch('content/settings/data.json'),
      transport.fetch('documents/articles/_index/en.json'),
    ])

    expect(items).toEqual({ a1: { name: 'Alice' } })
    expect(settings).toEqual({ theme: 'dark' })
    expect(index).toEqual([{ slug: 'intro', title: 'Intro' }])
    expect(requestedUrls(mock)).toEqual(['https://cdn.example.com/v1/proj-123/_bundle/en.json'])
  })

  it('never consults the bundle for manifest and model paths', async () => {
    const mock = routedFetch({
      '_manifest.json': { body: { project: 'proj-123' } },
      'models/_index.json': { body: [] },
    })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    await transport.fetch('_manifest.json')
    await transport.fetch('models/_index.json')

    expect(requestedUrls(mock).some(url => url.includes('_bundle'))).toBe(false)
  })

  it('preload() returns true when the bundle exists and primes paths', async () => {
    const mock = routedFetch({ '_bundle/en.json': { body: BUNDLE_EN } })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: true })
    await expect(transport.preload('en')).resolves.toBe(true)

    await transport.fetch('content/team/en.json')
    expect(requestedUrls(mock)).toEqual(['https://cdn.example.com/v1/proj-123/_bundle/en.json'])
  })

  it('preload() returns false when the bundle is missing', async () => {
    vi.stubGlobal('fetch', routedFetch({}))

    const transport = new HttpTransport({ ...config, bundle: true })
    await expect(transport.preload('en')).resolves.toBe(false)
  })

  it('preload() is a no-op returning false when bundle mode is off', async () => {
    const mock = routedFetch({ '_bundle/en.json': { body: BUNDLE_EN } })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport(config)
    await expect(transport.preload('en')).resolves.toBe(false)
    expect(mock).not.toHaveBeenCalled()
  })

  it('revalidateMs: 0 revalidates the bundle on every fetch', async () => {
    const mock = routedFetch({ '_bundle/en.json': { body: BUNDLE_EN } })
    vi.stubGlobal('fetch', mock)

    const transport = new HttpTransport({ ...config, bundle: { revalidateMs: 0 } })
    await transport.fetch('content/team/en.json')
    await transport.fetch('content/team/en.json')

    expect(requestedUrls(mock).filter(url => url.includes('_bundle'))).toHaveLength(2)
  })
})

describe('createContentrain bundle preload', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const config = { projectId: 'proj-1', apiKey: 'crn_live_test', bundle: true }

  it('serves collection queries from a preloaded bundle', async () => {
    const mock = routedFetch({
      '_bundle/en.json': {
        body: {
          version: '1',
          paths: { 'content/faq/en.json': { a1: { question: 'What?', order: 1 } } },
        },
      },
    })
    vi.stubGlobal('fetch', mock)

    const client = createContentrain(config)
    await expect(client.preload('en')).resolves.toBe(true)

    const items = await client.collection('faq').locale('en').all()
    expect(items).toHaveLength(1)
    expect((items[0] as Record<string, unknown>).question).toBe('What?')
    expect(requestedUrls(mock)).toHaveLength(1)
  })

  it('behaves exactly like per-path mode when the bundle is unavailable', async () => {
    const mock = routedFetch({
      'content/faq/en.json': { body: { a1: { question: 'What?', order: 1 } } },
    })
    vi.stubGlobal('fetch', mock)

    const client = createContentrain(config)
    const items = await client.collection('faq').locale('en').all()

    expect(items).toHaveLength(1)
    expect((items[0] as Record<string, unknown>).question).toBe('What?')
  })
})
