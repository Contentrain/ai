import { describe, it, expect, vi, afterEach } from 'vitest'
import { HttpTransport } from '../../src/cdn/http-transport.js'
import { MediaAccessor } from '../../src/cdn/media-accessor.js'
import type { MediaManifest } from '../../src/cdn/media-accessor.js'

const sampleManifest: MediaManifest = {
  version: '1',
  assets: {
    'images/hero.jpg': {
      original: 'media/images/hero.jpg',
      variants: {
        thumb: 'media/images/hero-thumb.webp',
        card: 'media/images/hero-card.webp',
      },
      meta: {
        width: 1920,
        height: 1080,
        format: 'jpeg',
        size: 245000,
        blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
        alt: 'Hero banner image',
      },
    },
    'images/logo.png': {
      original: 'media/images/logo.png',
      variants: {},
      meta: {
        width: 200,
        height: 200,
        format: 'png',
        size: 15000,
        blurhash: null,
        alt: null,
      },
    },
  },
}

function mockFetchResponse(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function createAccessor() {
  vi.stubGlobal('fetch', mockFetchResponse(sampleManifest))
  const transport = new HttpTransport({
    baseUrl: 'https://cdn.test/v1',
    projectId: 'proj1',
    apiKey: 'key',
  })
  return new MediaAccessor(transport)
}

describe('MediaAccessor', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('manifest() fetches and returns manifest', async () => {
    const accessor = createAccessor()
    const manifest = await accessor.manifest()
    expect(manifest.version).toBe('1')
    expect(Object.keys(manifest.assets)).toHaveLength(2)
  })

  it('manifest() caches — only one fetch call', async () => {
    const accessor = createAccessor()
    await accessor.manifest()
    await accessor.manifest()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('assets() returns all assets', async () => {
    const accessor = createAccessor()
    const assets = await accessor.assets()
    expect(Object.keys(assets)).toEqual(['images/hero.jpg', 'images/logo.png'])
  })

  it('asset() returns single asset by path', async () => {
    const accessor = createAccessor()
    const asset = await accessor.asset('images/hero.jpg')
    expect(asset).toBeDefined()
    expect(asset!.meta.width).toBe(1920)
    expect(asset!.meta.blurhash).toBe('LEHV6nWB2yk8pyo0adR*.7kCMdnj')
  })

  it('asset() returns null for unknown path', async () => {
    const accessor = createAccessor()
    const asset = await accessor.asset('images/nonexistent.jpg')
    expect(asset).toBeNull()
  })

  it('list() returns array of assets with paths', async () => {
    const accessor = createAccessor()
    const list = await accessor.list()
    expect(list).toHaveLength(2)
    expect(list[0]!.path).toBe('images/hero.jpg')
    expect(list[0]!.meta.format).toBe('jpeg')
  })

  it('resolve() returns variant path when available', async () => {
    const accessor = createAccessor()
    const asset = await accessor.asset('images/hero.jpg')
    expect(accessor.resolve(asset!, 'thumb')).toBe('media/images/hero-thumb.webp')
  })

  it('resolve() falls back to original when variant missing', async () => {
    const accessor = createAccessor()
    const asset = await accessor.asset('images/hero.jpg')
    expect(accessor.resolve(asset!, 'nonexistent')).toBe('media/images/hero.jpg')
  })

  it('resolve() returns original when no variant specified', async () => {
    const accessor = createAccessor()
    const asset = await accessor.asset('images/logo.png')
    expect(accessor.resolve(asset!)).toBe('media/images/logo.png')
  })

  it('url() returns full CDN URL', async () => {
    const accessor = createAccessor()
    const asset = await accessor.asset('images/hero.jpg')
    expect(accessor.url(asset!)).toBe('https://cdn.test/v1/proj1/media/images/hero.jpg')
  })

  it('url() returns variant CDN URL', async () => {
    const accessor = createAccessor()
    const asset = await accessor.asset('images/hero.jpg')
    expect(accessor.url(asset!, 'card')).toBe('https://cdn.test/v1/proj1/media/images/hero-card.webp')
  })
})
