import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpTransport } from '../../src/cdn/http-transport.js'
import { ContentrainError } from '../../src/cdn/errors.js'

function mockFetchResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  })
}

describe('HttpTransport', () => {
  const config = {
    baseUrl: 'https://cdn.example.com/v1',
    projectId: 'proj-123',
    apiKey: 'crn_live_test',
  }
  let transport: HttpTransport

  beforeEach(() => {
    transport = new HttpTransport(config)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends Authorization header', async () => {
    const mock = mockFetchResponse({ ok: true })
    vi.stubGlobal('fetch', mock)

    await transport.fetch('_manifest.json')

    expect(mock).toHaveBeenCalledWith(
      'https://cdn.example.com/v1/proj-123/_manifest.json',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer crn_live_test' }),
      }),
    )
  })

  it('throws ContentrainError on non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetchResponse('Not Found', 404))

    await expect(transport.fetch('bad/path')).rejects.toThrow(ContentrainError)
    await expect(transport.fetch('bad/path')).rejects.toMatchObject({ status: 404 })
  })

  it('caches response by ETag', async () => {
    const data = { title: 'Hello' }
    const mock = mockFetchResponse(data, 200, { etag: '"abc123"' })
    vi.stubGlobal('fetch', mock)

    const result1 = await transport.fetch('content/hero/en.json')
    expect(result1).toEqual(data)

    // Second call should send If-None-Match
    const mock304 = vi.fn().mockResolvedValue({
      ok: false,
      status: 304,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
    })
    vi.stubGlobal('fetch', mock304)

    const result2 = await transport.fetch('content/hero/en.json')
    expect(result2).toEqual(data)
    expect(mock304).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': '"abc123"' }),
      }),
    )
  })

  it('collection().getAll() returns entries with injected id', async () => {
    const map = { abc123: { name: 'Alice' }, def456: { name: 'Bob' } }
    vi.stubGlobal('fetch', mockFetchResponse(map))

    const source = transport.collection<{ id: string; name: string }>('team')
    const items = await source.getAll('en')

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ id: 'abc123', name: 'Alice' })
    expect(items[1]).toMatchObject({ id: 'def456', name: 'Bob' })
  })

  it('singleton().get() returns object', async () => {
    const data = { title: 'Hero', cta: 'Go' }
    vi.stubGlobal('fetch', mockFetchResponse(data))

    const source = transport.singleton<{ title: string; cta: string }>('hero')
    const result = await source.get('en')
    expect(result).toEqual(data)
  })

  it('dictionary().get() returns key-value pairs', async () => {
    const data = { 'auth.login': 'Log In', 'auth.logout': 'Log Out' }
    vi.stubGlobal('fetch', mockFetchResponse(data))

    const source = transport.dictionary('ui-strings')
    const result = await source.get('en')
    expect(result).toEqual(data)
  })

  it('document().getIndex() returns array', async () => {
    const data = [{ slug: 'intro', title: 'Intro' }]
    vi.stubGlobal('fetch', mockFetchResponse(data))

    const source = transport.document<{ slug: string; title: string }>('docs')
    const result = await source.getIndex('en')
    expect(result).toEqual(data)
  })

  it('strips trailing slash from baseUrl', async () => {
    const t = new HttpTransport({ ...config, baseUrl: 'https://cdn.example.com/v1/' })
    const mock = mockFetchResponse({})
    vi.stubGlobal('fetch', mock)

    await t.fetch('test')
    expect(mock).toHaveBeenCalledWith('https://cdn.example.com/v1/proj-123/test', expect.any(Object))
  })
})
