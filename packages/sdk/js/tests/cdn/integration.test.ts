import { describe, it, expect, vi, afterEach } from 'vitest'
import { createContentrain } from '../../src/cdn/index.js'
import { ContentrainError } from '../../src/cdn/errors.js'

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn().mockImplementation(async (url: string) => {
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve(body),
          text: () => Promise.resolve(JSON.stringify(body)),
        }
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

describe('createContentrain (CDN client)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const config = { projectId: 'proj-1', apiKey: 'crn_live_test' }

  it('collection query returns filtered data', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'content/faq/en.json': {
        a1: { question: 'What?', order: 1 },
        b2: { question: 'How?', order: 2 },
      },
    }))

    const client = createContentrain(config)
    const items = await client.collection('faq').locale('en').where('order', 'eq', 1).all()

    expect(items).toHaveLength(1)
    expect((items[0] as Record<string, unknown>).question).toBe('What?')
  })

  it('singleton returns data', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'content/hero/en.json': { title: 'Hello', cta: 'Go' },
    }))

    const client = createContentrain(config)
    const hero = await client.singleton('hero').locale('en').get()
    expect(hero).toEqual({ title: 'Hello', cta: 'Go' })
  })

  it('dictionary returns key-value and supports lookup', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'content/ui/en.json': { 'auth.login': 'Log In', 'welcome': 'Hello, {name}!' },
    }))

    const client = createContentrain(config)
    const dict = client.dictionary('ui').locale('en')

    const all = await dict.get()
    expect(all['auth.login']).toBe('Log In')
  })

  it('document bySlug returns document', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'documents/docs/intro/en.json': { frontmatter: { title: 'Intro' }, body: '# Intro', html: '<h1>Intro</h1>' },
    }))

    const client = createContentrain(config)
    const doc = await client.document('docs').locale('en').bySlug('intro')
    expect(doc?.frontmatter).toEqual({ title: 'Intro' })
    expect(doc?.body).toBe('# Intro')
  })

  it('manifest() fetches _manifest.json', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '_manifest.json': { version: '1.0', models: ['faq', 'hero'] },
    }))

    const client = createContentrain(config)
    const manifest = await client.manifest()
    expect(manifest).toEqual({ version: '1.0', models: ['faq', 'hero'] })
  })

  it('models() fetches model index', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'models/_index.json': [{ id: 'faq', kind: 'collection' }],
    }))

    const client = createContentrain(config)
    const models = await client.models()
    expect(models).toHaveLength(1)
  })

  it('model() fetches single model definition', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'models/faq.json': { id: 'faq', kind: 'collection', fields: {} },
    }))

    const client = createContentrain(config)
    const model = await client.model('faq')
    expect((model as Record<string, unknown>).id).toBe('faq')
  })

  it('throws ContentrainError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
      text: () => Promise.resolve('Unauthorized'),
    }))

    const client = createContentrain(config)
    await expect(client.manifest()).rejects.toThrow(ContentrainError)
  })

  it('uses custom baseUrl', async () => {
    const mock = mockFetch({ '_manifest.json': {} })
    vi.stubGlobal('fetch', mock)

    const client = createContentrain({ ...config, baseUrl: 'https://custom.api/cdn' })
    await client.manifest()

    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('https://custom.api/cdn/proj-1/'),
      expect.any(Object),
    )
  })

  it('defaultLocale is used when locale() not called', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'content/hero/tr.json': { title: 'Merhaba' },
    }))

    const client = createContentrain({ ...config, defaultLocale: 'tr' })
    const hero = await client.singleton('hero').get()
    expect(hero).toEqual({ title: 'Merhaba' })
  })

  it('media() accessor fetches manifest and resolves variants', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '_media_manifest.json': {
        version: '1',
        assets: {
          'hero.jpg': {
            original: 'media/hero.jpg',
            variants: { thumb: 'media/hero-thumb.webp' },
            meta: { width: 800, height: 600, format: 'jpeg', size: 50000, blurhash: null, alt: 'Hero' },
          },
        },
      },
    }))

    const client = createContentrain(config)
    const media = client.media()
    const asset = await media.asset('hero.jpg')
    expect(asset).toBeDefined()
    expect(asset!.meta.alt).toBe('Hero')
    expect(media.url(asset!, 'thumb')).toContain('media/hero-thumb.webp')
  })

  it('form() client fetches config and submits', async () => {
    vi.stubGlobal('fetch', mockFetch({
      'config': { modelId: 'contact', fields: [{ id: 'name', type: 'string' }] },
      'submit': { success: true, message: 'OK' },
    }))

    const client = createContentrain(config)
    const form = client.form()
    const formConfig = await form.config('contact')
    expect(formConfig.modelId).toBe('contact')

    const result = await form.submit('contact', { name: 'Test' })
    expect(result.success).toBe(true)
  })
})
