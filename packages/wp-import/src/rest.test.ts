import { describe, it, expect } from 'vitest'
import { fetchRestRawIR } from './index'

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } })

const post = (id: number, slug: string, over: Record<string, unknown> = {}) => ({
  id,
  slug,
  status: 'publish',
  link: `https://s.example/${slug}/`,
  title: { rendered: slug },
  content: { rendered: `<p>${slug}</p>` },
  excerpt: { rendered: '' },
  date_gmt: '2026-01-01T10:00:00',
  modified_gmt: '2026-01-02T10:00:00',
  author: 1,
  featured_media: 77,
  categories: [2],
  tags: [],
  ...over,
})

function stubFetch(calls: string[]): typeof fetch {
  return (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const u = String(url)
    calls.push(u + ((init?.headers as Record<string, string>)?.authorization ? ' [auth]' : ''))
    if (u.includes('/types')) return json({ post: { slug: 'post', rest_base: 'posts' }, page: { slug: 'page', rest_base: 'pages' }, attachment: { slug: 'attachment', rest_base: 'media' } })
    if (u.includes('/posts?') && u.endsWith('&page=1')) return json([post(10, 'one')], { 'x-wp-totalpages': '2' })
    if (u.includes('/posts?') && u.endsWith('&page=2')) return json([post(12, 'two')])
    if (u.includes('/pages?')) return json([post(11, 'about', { author: undefined, featured_media: 0, categories: [] })], { 'x-wp-totalpages': '1' })
    if (u.includes('/categories?')) return json([{ id: 2, slug: 'news', name: 'News' }])
    if (u.includes('/tags?')) return json([])
    if (u.includes('/users?')) return json([{ id: 1, slug: 'ada', name: 'Ada Lovelace' }])
    if (u.includes('/media?')) return json([{ id: 77, slug: 'hero', title: { rendered: 'Hero' }, source_url: 'https://s.example/hero.jpg', mime_type: 'image/jpeg', media_details: { width: 800, height: 600, file: '2026/01/hero.jpg' }, post: 10 }])
    if (u.includes('/comments?')) return json([{ id: 500, post: 10, parent: 0, author_name: 'Reader', date_gmt: '2026-01-03T09:00:00', content: { rendered: '<p>Nice</p>' }, status: 'hold', type: 'comment' }])
    return new Response('nope', { status: 404 })
  }) as typeof fetch
}

describe('fetchRestRawIR', () => {
  it('reports a later failed page instead of silently presenting a complete import', async () => {
    const base = stubFetch([])
    const fetchImpl = (async (url, init) => String(url).includes('/posts?') && String(url).endsWith('&page=2')
      ? new Response('unavailable', { status: 503 }) : base(url, init)) as typeof fetch
    const result = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl })
    expect(result.raw.posts.map((p) => p.id).toSorted()).toEqual([10, 11])
    expect(result.warnings).toContain('posts: page 2 HTTP 503 — skipped')
  })

  it('rejects invalid limits before fetching, including values that would stall the queue', async () => {
    const calls: string[] = []
    for (const concurrency of [0, -1, 1.5, NaN, Infinity]) {
      await expect(fetchRestRawIR({ origin: 'https://s.example', fetchImpl: stubFetch(calls), concurrency })).rejects.toThrow('concurrency')
    }
    await expect(fetchRestRawIR({ origin: 'https://s.example', fetchImpl: stubFetch(calls), maxPages: NaN })).rejects.toThrow('maxPages')
    await expect(fetchRestRawIR({ origin: 'https://s.example', fetchImpl: stubFetch(calls), perPage: 101 })).rejects.toThrow('perPage')
    expect(calls).toEqual([])
  })

  it('merges paginated results and maps entities into RawIR', async () => {
    const calls: string[] = []
    const { raw, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: stubFetch(calls) })
    expect(warnings).toEqual([])
    expect(raw.provenance.kind).toBe('rest_public')
    expect(raw.posts.map((p) => p.id).toSorted()).toEqual([10, 11, 12])
    const p = raw.posts.find((x) => x.id === 10)!
    expect(p.author).toBe('ada')
    expect(p.date).toBe('2026-01-01T10:00:00Z')
    expect(p.meta._thumbnail_id).toBe('77')
    expect(p.terms[0]).toMatchObject({ taxonomy: 'category', slug: 'news', resolved: true })
    expect(raw.attachments[0]).toMatchObject({ id: 77, mime: 'image/jpeg', parent: 10, parent_resolved: true })
    expect(raw.comments![0]).toMatchObject({ id: 500, approved: '0', parent: null })
  })

  it('application password lifts the rung and sends basic auth', async () => {
    const calls: string[] = []
    const { raw } = await fetchRestRawIR({
      origin: 'https://s.example',
      fetchImpl: stubFetch(calls),
      auth: { user: 'ada', appPassword: 'xxxx yyyy' },
    })
    expect(raw.provenance.kind).toBe('rest_auth')
    expect(calls.every((c) => c.endsWith('[auth]'))).toBe(true)
  })

  it('a failing endpoint becomes a warning, not an exception', async () => {
    const failing = (async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url)
      if (u.includes('/types')) return new Response('x', { status: 403 })
      if (u.includes('/posts?')) return json([post(10, 'one')], { 'x-wp-totalpages': '1' })
      if (u.includes('/users?')) return new Response('x', { status: 401 })
      return json([])
    }) as typeof fetch
    const { raw, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: failing })
    expect(warnings.some((w) => w.startsWith('types:'))).toBe(true)
    expect(warnings.some((w) => w.startsWith('users:'))).toBe(true)
    expect(raw.posts).toHaveLength(1)
  })

  it('caps requests in flight across every collection (default 4) and honours a higher/lower concurrency', async () => {
    const run = async (concurrency?: number) => {
      let inFlight = 0
      let peak = 0
      const slow = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        const u = String(url)
        if (u.includes('/types')) return json({ post: { slug: 'post', rest_base: 'posts' } })
        if (u.includes('/posts?')) return json([post(Number(u.match(/page=(\d+)/)![1]) + 100, `p${u.match(/page=(\d+)/)![1]}`)], { 'x-wp-totalpages': '12' })
        if (u.includes('/media?') || u.includes('/comments?')) return json([], { 'x-wp-totalpages': '8' })
        if (u.includes('/categories?') || u.includes('/tags?') || u.includes('/users?')) return json([])
        return stubFetch([])(url, init)
      }) as typeof fetch
      const { raw, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: slow, concurrency })
      return { peak, posts: raw.posts.length, warnings }
    }
    const dflt = await run()
    expect(dflt.peak).toBeLessThanOrEqual(4)
    expect(dflt.posts).toBe(12)
    expect(dflt.warnings).toEqual([])
    const wide = await run(10)
    expect(wide.peak).toBeGreaterThan(4)
    expect(wide.peak).toBeLessThanOrEqual(10)
    const one = await run(1)
    expect(one.peak).toBe(1)
  })

  it('maxPages truncates each collection and names what was skipped', async () => {
    const paged = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const u = String(url)
      if (u.includes('/types')) return json({ post: { slug: 'post', rest_base: 'posts' } })
      const page = Number(u.match(/page=(\d+)/)?.[1] ?? '1')
      if (u.includes('/posts?')) return json([post(page + 100, `p${page}`)], { 'x-wp-totalpages': '74' })
      if (u.includes('/comments?')) return json([], { 'x-wp-totalpages': '37' })
      if (u.includes('/media?') || u.includes('/categories?') || u.includes('/tags?') || u.includes('/users?')) return json([], { 'x-wp-totalpages': '1' })
      return stubFetch([])(url, init)
    }) as typeof fetch
    const { raw, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: paged, maxPages: 3 })
    expect(raw.posts).toHaveLength(3)
    expect(warnings).toEqual([
      'comments: 37 pages, fetched 3 (maxPages) — 34 pages skipped',
      'posts: 74 pages, fetched 3 (maxPages) — 71 pages skipped',
    ])
  })

  it('theme and page-builder internals are not post types: GeneratePress, GenerateBlocks, Elementor, ACF, form definitions', async () => {
    const calls: string[] = []
    const typed = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const u = String(url)
      if (u.includes('/types')) return json({
        post: { slug: 'post', rest_base: 'posts' },
        'gblocks_global_style': { slug: 'gblocks_global_style', rest_base: 'gblocks-global-style' },
        'gblocks_styles': { slug: 'gblocks_styles', rest_base: 'gblocks-styles' },
        'gp_elements': { slug: 'gp_elements', rest_base: 'gp-elements' },
        'elementor_library': { slug: 'elementor_library', rest_base: 'elementor-library' },
        'wp_navigation': { slug: 'wp_navigation', rest_base: 'navigation' },
        'wpcf7_contact_form': { slug: 'wpcf7_contact_form', rest_base: 'wpcf7' },
        'ps_member': { slug: 'ps_member', rest_base: 'members' },
      })
      if (u.includes('/members?')) return json([post(900, 'ada', { type: 'ps_member' })])
      return stubFetch(calls)(url, init)
    }) as typeof fetch
    const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: typed })
    const fetched = calls.filter((c) => c.includes('/wp-json/wp/v2/')).map((c) => c.split('/wp/v2/')[1]!.split('?')[0])
    for (const base of ['gblocks-global-style', 'gblocks-styles', 'gp-elements', 'elementor-library', 'navigation', 'wpcf7']) {
      expect(fetched, base).not.toContain(base)
    }
    // a membership CPT carries content and stays
    expect(raw.posts.some((p) => p.type === 'ps_member')).toBe(true)
  })
})
