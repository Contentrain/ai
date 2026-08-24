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
})
