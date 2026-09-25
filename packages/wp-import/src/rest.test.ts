import { describe, it, expect } from 'vitest'
import { fetchRestRawIR, rawToContentrain, hexId } from './index'

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

  it('reads Polylang and WPML language fields into RawPost.lang and one language_pair per group', async () => {
    const multilingual = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const u = String(url)
      if (u.includes('/types')) return json({ post: { slug: 'post', rest_base: 'posts' } })
      if (u.includes('/posts?')) return json([
        post(10, 'hello', { lang: 'en', translations: { en: 10, tr: 20 } }),
        post(20, 'merhaba', { lang: 'tr', translations: { en: 10, tr: 20 } }),
        post(30, 'alone', { lang: 'en', translations: { en: 30 } }),
        post(40, 'hallo', { wpml_current_locale: 'de_DE', wpml_translations: [{ locale: 'en_US', id: 41, href: 'x' }] }),
        post(41, 'hi', { wpml_current_locale: 'en_US', wpml_translations: [{ locale: 'de_DE', id: 40 }] }),
        post(50, 'plain'),
      ])
      return stubFetch([])(url, init)
    }) as typeof fetch
    const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: multilingual })
    expect(raw.posts.map((p) => [p.id, p.lang ?? null])).toEqual([[10, 'en'], [20, 'tr'], [30, 'en'], [40, 'de_DE'], [41, 'en_US'], [50, null]])
    expect(raw.language_pairs).toEqual([
      { post: 10, translations: { en: 10, tr: 20 } },
      { post: 40, translations: { en_US: 41, de_DE: 40 } },
    ])
  })
})

describe('fetchRestRawIR with a credential lists every non-trash status', () => {
  const statuses = 'status=publish,future,draft,pending,private&context=edit'
  // A site that answers the credential's listings only: anonymous-style URLs get published posts and approved comments.
  function authedSite(calls: string[], deny: RegExp | null = null): typeof fetch {
    const base = stubFetch([])
    return (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const u = String(url)
      calls.push(u)
      if (deny?.test(u)) return new Response('{"code":"rest_forbidden_context"}', { status: 403 })
      if (u.endsWith('/users/me')) return json({ id: 1, slug: 'ada', name: 'Ada Lovelace' })
      if (u.includes(`/posts?${statuses}&`)) {
        return json([
          post(10, 'live'),
          post(20, 'scheduled', { status: 'future', date_gmt: '2027-01-01T09:00:00' }),
          post(21, 'unfinished', { status: 'draft', date_gmt: null }),
          post(22, 'awaiting', { status: 'pending' }),
          post(23, 'members', { status: 'private' }),
          post(24, 'locked', { password: 'hunter2' }),
        ])
      }
      if (u.includes(`/pages?${statuses}&`)) return json([post(11, 'about', { featured_media: 0, categories: [] })])
      if (u.includes('/comments?status=approve&context=edit&')) {
        return json([{ id: 500, post: 10, parent: 0, author_name: 'Reader', date_gmt: '2026-01-03T09:00:00', content: { rendered: '<p>Nice</p>' }, status: 'approved', type: 'comment' }])
      }
      if (u.includes('/comments?status=hold&context=edit&')) {
        return json([{ id: 501, post: 10, parent: 0, author_name: 'Waiting', date_gmt: '2026-01-04T09:00:00', content: { rendered: '<p>Held</p>' }, status: 'hold', type: 'comment' }])
      }
      if (u.includes('/posts?per_page')) return json([post(10, 'live')])
      if (u.includes('/pages?per_page')) return json([post(11, 'about', { featured_media: 0, categories: [] })])
      if (u.includes('/comments?per_page')) {
        return json([{ id: 500, post: 10, parent: 0, author_name: 'Reader', date_gmt: '2026-01-03T09:00:00', content: { rendered: '<p>Nice</p>' }, status: 'approved', type: 'comment' }])
      }
      return base(url, init)
    }) as typeof fetch
  }
  const auth = { user: 'ada', appPassword: 'xxxx yyyy' }

  it('asks for drafts, scheduled, pending and private posts in the edit context, and held comments', async () => {
    const calls: string[] = []
    const { raw, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite(calls), auth })
    expect(warnings).toEqual([])
    expect(calls).toContain(`https://s.example/wp-json/wp/v2/posts?${statuses}&per_page=100&page=1`)
    expect(calls).toContain(`https://s.example/wp-json/wp/v2/pages?${statuses}&per_page=100&page=1`)
    expect(calls).toContain('https://s.example/wp-json/wp/v2/comments?status=approve&context=edit&per_page=100&page=1')
    expect(calls).toContain('https://s.example/wp-json/wp/v2/comments?status=hold&context=edit&per_page=100&page=1')
    // The WordPress status stays verbatim in the migration source.
    expect(Object.fromEntries(raw.posts.map((p) => [p.slug, p.status]))).toEqual({
      live: 'publish', scheduled: 'future', unfinished: 'draft', awaiting: 'pending', members: 'private', locked: 'publish', about: 'publish',
    })
    // The fact that it is protected, never the password.
    expect(raw.posts.find((p) => p.slug === 'locked')!.password).toBe('[protected]')
    expect(JSON.stringify(raw)).not.toContain('hunter2')
    expect(raw.comments!.map((c) => [c.id, c.approved])).toEqual([[500, '1'], [501, '0']])
  })

  it('the statuses reach the store: published, scheduled with publish_at, draft, in_review, private as draft', async () => {
    const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite([]), auth })
    const { files, report } = rawToContentrain(raw, { updatedBy: 'test' })
    const meta = JSON.parse(files['.contentrain/meta/posts/en.json']!)
    const status = (slug: string) => meta[hexId(`posts:${slug}`)]
    expect(status('live')).toMatchObject({ status: 'published' })
    expect(status('live').publish_at).toBeUndefined()
    expect(status('scheduled')).toMatchObject({ status: 'published', publish_at: '2027-01-01T09:00:00Z' })
    expect(status('unfinished')).toMatchObject({ status: 'draft' })
    expect(status('awaiting')).toMatchObject({ status: 'in_review' })
    expect(status('members')).toMatchObject({ status: 'draft' })
    // Its WordPress status is publish, and the edit context returned the protected body: it must not come in published.
    expect(status('locked')).toMatchObject({ status: 'draft' })
    expect(report.password_protected_drafts).toBe(1)
    const posts = JSON.parse(files['.contentrain/content/blog/posts/data.json']!)
    expect(posts[hexId('posts:members')].visibility).toBe('private')
    expect(posts[hexId('posts:locked')].visibility).toBe('password')
    expect(Object.values(files).join('\n')).not.toContain('hunter2')
    const commentMeta = JSON.parse(Object.entries(files).find(([path]) => path.startsWith('.contentrain/meta/comments'))![1])
    expect(commentMeta[hexId('comments:500')]).toMatchObject({ status: 'published' })
    expect(commentMeta[hexId('comments:501')]).toMatchObject({ status: 'in_review' })
  })

  it('without a credential the listing is unchanged: WordPress defaults, no status, no edit context', async () => {
    const calls: string[] = []
    const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite(calls) })
    expect(calls.filter((c) => /\/(posts|pages|comments)\?/.test(c)).toSorted()).toEqual([
      'https://s.example/wp-json/wp/v2/comments?per_page=100&page=1',
      'https://s.example/wp-json/wp/v2/pages?per_page=100&page=1',
      'https://s.example/wp-json/wp/v2/posts?per_page=100&page=1',
    ])
    expect(calls.some((c) => c.includes('status=') || c.includes('context=edit'))).toBe(false)
    expect(raw.posts.map((p) => p.status)).toEqual(['publish', 'publish'])
  })

  it('a credential the site refuses for those listings falls back to the public one, with a warning', async () => {
    const { raw, warnings, gaps } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite([], /context=edit/), auth })
    expect(raw.posts.map((p) => p.slug).toSorted()).toEqual(['about', 'live'])
    expect(raw.comments!.map((c) => c.id)).toEqual([500])
    // Menus have no public listing: refused with the credential, they are a named gap.
    expect(gaps).toEqual(['menus_require_auth'])
    expect(warnings.toSorted()).toEqual([
      'comments: HTTP 403 for status=approve&context=edit with the credential — fell back to the public listing',
      'comments: HTTP 403 for status=hold&context=edit with the credential — skipped (no public listing)',
      'menus: HTTP 403 with the credential — the user may not edit theme options; menus not read',
      `pages: HTTP 403 for ${statuses} with the credential — fell back to the public listing`,
      `posts: HTTP 403 for ${statuses} with the credential — fell back to the public listing`,
    ])
  })

  describe('the result says whether the credential was honoured, without parsing warnings', () => {
    // WordPress answers a wrong Application Password with 401 on every request,
    // public routes included.
    const rejectsAuth = (calls: string[]): typeof fetch => {
      const site = authedSite(calls)
      return (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        (init?.headers as Record<string, string>)?.authorization
          ? new Response('{"code":"incorrect_password"}', { status: 401 })
          : site(url, init)) as typeof fetch
    }

    it('a credential rejected everywhere: rejected, every listing fell back, and the public site is still imported', async () => {
      const calls: string[] = []
      const { raw, credential, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: rejectsAuth(calls), auth })
      expect(credential).toEqual({ status: 'rejected', fell_back: ['comments', 'comments:hold', 'pages', 'posts'] })
      // Nothing was read with the credential, so the rung is the public one.
      expect(raw.provenance.kind).toBe('rest_public')
      expect(raw.posts.map((p) => p.slug).toSorted()).toEqual(['about', 'live'])
      expect(raw.comments!.map((c) => c.id)).toEqual([500])
      expect(raw.terms.map((t) => t.slug)).toEqual(['news'])
      expect(raw.authors.map((a) => a.login)).toEqual(['ada'])
      expect(warnings).toContain('credential: HTTP 401 on users/me — the site rejected it; imported the public listings only')
    })

    it('one listing refused: rejected, naming only that listing; the others were read with the credential', async () => {
      const { raw, credential } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite([], /\/posts\?status=/), auth })
      expect(credential).toEqual({ status: 'rejected', fell_back: ['posts'] })
      expect(raw.provenance.kind).toBe('rest_auth')
      expect(raw.posts.map((p) => p.slug).toSorted()).toEqual(['about', 'live'])
      expect(raw.comments!.map((c) => c.id)).toEqual([500, 501])
    })

    it('held comments refused alone: rejected, comments:hold', async () => {
      const { credential } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite([], /status=hold/), auth })
      expect(credential).toEqual({ status: 'rejected', fell_back: ['comments:hold'] })
    })

    it('every listing honoured: accepted; no credential: none', async () => {
      expect((await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite([]), auth })).credential).toEqual({ status: 'accepted', fell_back: [] })
      expect((await fetchRestRawIR({ origin: 'https://s.example', fetchImpl: authedSite([]) })).credential).toEqual({ status: 'none', fell_back: [] })
    })
  })
})
