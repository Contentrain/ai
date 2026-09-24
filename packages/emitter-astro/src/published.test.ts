import { describe, it, expect } from 'vitest'
import type { ProjectIR } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject, holdReason } from './index'
import type { EmitContent, EmitPost } from './types'

// Only published entries are built. The store keeps drafts, entries in review
// and posts scheduled for later (WordPress `future` → published + publish_at);
// none of them may get a page, a sitemap line, a feed item, an llms.txt link or
// a list card before they are live, and a link to one must not 404. Password-
// protected and private entries are never built, whatever their status (QA-23:
// a password-protected post's content arrived as published).

const NOW = '2026-09-24T12:00:00Z'

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', title: 'Example', locales: ['en'] },
  routes: [
    { id: 'post', pattern: '/:year/:slug', kind: 'single', family: 'f' },
    { id: 'pages', pattern: '/:slug*', kind: 'page', family: 'f', collection: 'pages' },
    { id: 'category', pattern: '/category/:term', kind: 'archive', family: 'f', query: 'by-term' },
  ],
  families: [{ id: 'f', chrome: [{ id: 'b', position: 'body', html: '<main><!--@@body@@--></main>' }], css: { strategy: 'localcss' } }],
  queries: [{ id: 'by-term', source: 'posts', order: { by: 'date', direction: 'desc' }, per_page: 10, pagination: 'numbered' }],
  css_default: 'purge_set',
} as ProjectIR

const post = (slug: string, extra: Partial<EmitPost> = {}): EmitPost => ({ slug, title: slug, body: '<p>x</p>', params: { year: '2026' }, ...extra })

const content: EmitContent = {
  posts: [
    post('live'),
    post('published', { status: 'published', body: '<p>See <a href="/2026/draft/">the draft</a>, <a class="x" href="https://www.example.com/2026/soon/">soon</a> and <a href="/2026/live/">live</a>.</p>' }),
    post('past', { status: 'published', publish_at: '2026-09-01T00:00:00Z' }),
    post('soon', { status: 'published', publish_at: '2026-10-01T00:00:00Z' }),
    post('draft', { status: 'draft' }),
    post('review', { status: 'in_review' }),
    post('bad-date', { status: 'published', publish_at: 'next tuesday' }),
    post('secret', { status: 'published', visibility: 'password', body: '<p>members only</p>' }),
    post('mine', { status: 'published', visibility: 'private' }),
    post('open', { status: 'published', visibility: 'public', body: '<p><a href="/2026/secret/">secret</a></p>' }),
  ],
  collections: {
    pages: [
      { slug: 'about', title: 'About', body: '<p><a href=\'/2026/review/\'>in review</a></p>' },
      { slug: 'wip', title: 'WIP', body: '', status: 'draft' },
    ],
  },
  queries: { 'by-term': [{ params: { term: 'news' }, items: [post('live'), post('soon', { publish_at: '2026-10-01T00:00:00Z' }), post('draft', { status: 'draft' }), post('secret', { visibility: 'password' })] }] },
}

const emit = (extra: Partial<Parameters<typeof emitAstroProject>[0]> = {}) =>
  emitAstroProject({ ir, content, options: { tailwind: false, now: NOW }, ...extra })

const slugs = (json: string | undefined) => (JSON.parse(json!) as EmitPost[]).map((p) => p.slug)

describe('holdReason', () => {
  const now = Date.parse(NOW)
  it('published, or no status at all, with no schedule or a schedule that has come: built', () => {
    expect(holdReason({}, now)).toBeNull()
    expect(holdReason({ status: 'published' }, now)).toBeNull()
    expect(holdReason({ status: 'published', publish_at: NOW }, now)).toBeNull()
    expect(holdReason({ publish_at: '2026-09-24T11:59:59Z' }, now)).toBeNull()
  })
  it('every other status, a schedule ahead, and a schedule that is not a date: held back', () => {
    for (const status of ['draft', 'in_review', 'rejected', 'archived'] as const) expect(holdReason({ status }, now)).toBe('status')
    expect(holdReason({ status: 'published', publish_at: '2026-09-24T12:00:01Z' }, now)).toBe('scheduled')
    expect(holdReason({ status: 'published', publish_at: 'soon' }, now)).toBe('publish_at_invalid')
    // Status first: a draft with a past date is still a draft.
    expect(holdReason({ status: 'draft', publish_at: '2020-01-01T00:00:00Z' }, now)).toBe('status')
  })
  it('password-protected, private, or any visibility but public: never built, even published and live', () => {
    expect(holdReason({ status: 'published', visibility: 'password' }, now)).toBe('visibility')
    expect(holdReason({ status: 'published', visibility: 'private', publish_at: '2020-01-01T00:00:00Z' }, now)).toBe('visibility')
    expect(holdReason({ visibility: 'members' }, now)).toBe('visibility')
    expect(holdReason({ status: 'published', visibility: 'public' }, now)).toBeNull()
  })
})

describe('only published entries are built', () => {
  const result = emit()

  it('the data files the pages, feed, llms.txt and sitemap are built from hold only live entries', () => {
    // Future-dated published: out. Past-dated published: in.
    expect(slugs(result.files['src/data/posts.json'])).toEqual(['live', 'published', 'past', 'open'])
    // Nothing of a password-protected post reaches the build — not its body, not its title.
    expect(Object.values(result.files).some((f) => f.includes('members only') || f.includes('"secret"'))).toBe(false)
    expect(slugs(result.files['src/data/pages.json'])).toEqual(['about'])
    expect(JSON.parse(result.files['src/data/queries/by-term.json']!)[0].items.map((i: EmitPost) => i.slug)).toEqual(['live'])
    // The feed and llms.txt read those same files.
    expect(result.files['src/pages/feed.xml.ts']).toContain(`import data from '../data/posts.json'`)
  })

  it('names every held-back entry, with why', () => {
    expect(result.withheld?.entries).toEqual([
      { collection: 'pages', slug: 'wip', status: 'draft', reason: 'status' },
      { collection: 'posts', slug: 'soon', status: 'published', publish_at: '2026-10-01T00:00:00Z', reason: 'scheduled' },
      { collection: 'posts', slug: 'draft', status: 'draft', reason: 'status' },
      { collection: 'posts', slug: 'review', status: 'in_review', reason: 'status' },
      { collection: 'posts', slug: 'bad-date', status: 'published', publish_at: 'next tuesday', reason: 'publish_at_invalid' },
      { collection: 'posts', slug: 'secret', status: 'published', visibility: 'password', reason: 'visibility' },
      { collection: 'posts', slug: 'mine', status: 'published', visibility: 'private', reason: 'visibility' },
    ])
    expect(result.warnings).toContain('unpublished: 7 entries not built — 2 password-protected or private; 3 not published (draft, in review, rejected or archived); 1 scheduled for later — built by the first emit after their publish_at; 1 with a publish_at that is not a date. They stay in the content store; EmitResult.withheld lists each')
  })

  it('a link from a published page to a held-back entry is kept as its text; other links stay links', () => {
    const posts = JSON.parse(result.files['src/data/posts.json']!) as EmitPost[]
    expect(posts.find((p) => p.slug === 'published')!.body).toBe('<p>See the draft, soon and <a href="/2026/live/">live</a>.</p>')
    const pages = JSON.parse(result.files['src/data/pages.json']!) as EmitPost[]
    expect(pages[0]!.body).toBe('<p>in review</p>')
    expect(result.withheld?.links).toEqual([
      { page: '/about/', href: '/2026/review/' },
      { page: '/2026/published/', href: '/2026/draft/' },
      { page: '/2026/published/', href: '/2026/soon/' },
      { page: '/2026/open/', href: '/2026/secret/' },
    ])
    expect(result.warnings.some((w) => w.startsWith('unpublished: 4 links from published pages to unpublished entries kept as plain text — /2026/review/ (on /about/)'))).toBe(true)
  })

  it('the same entry goes live once its time has come', () => {
    const later = emit({ options: { tailwind: false, now: '2026-10-01T00:00:00Z' } })
    expect(slugs(later.files['src/data/posts.json'])).toEqual(['live', 'published', 'past', 'soon', 'open'])
    expect(later.withheld?.links).toEqual([{ page: '/about/', href: '/2026/review/' }, { page: '/2026/published/', href: '/2026/draft/' }, { page: '/2026/open/', href: '/2026/secret/' }])
    expect(JSON.parse(later.files['src/data/posts.json']!)[1].body).toContain('<a class="x" href="https://www.example.com/2026/soon/">soon</a>')
  })

  it('a redirect to a held-back entry is not written; it is manual, with the reason', () => {
    const r = emit({ redirects: [{ from: '/old-draft/', to: '/2026/draft/' }, { from: '/old-live/', to: '/2026/live/' }], hostRedirects: [{ from: '/2026/soon/attachment/', to: 'https://example.com/2026/soon/' }] })
    expect(r.files['astro.config.mjs']).toContain(`"/old-live/": { status: 301, destination: "/2026/live/" },`)
    expect(r.files['astro.config.mjs']).not.toContain('/old-draft/')
    expect(r.redirects?.written.map((w) => w.from)).toEqual(['/old-live/'])
    expect(r.redirects?.manual).toEqual([
      { redirect: { from: '/old-draft/', to: '/2026/draft/' }, reason: 'to /2026/draft/, an entry that is not published — the build has no page there' },
      { redirect: { from: '/2026/soon/attachment/', to: 'https://example.com/2026/soon/' }, reason: 'to /2026/soon/, an entry that is not published — the build has no page there' },
    ])
  })

  it('an address a published entry still builds is not unlinked (a draft and a live page on one path)', () => {
    const r = emitAstroProject({
      ir,
      content: { posts: [post('a', { body: '<a href="/2026/twin/">t</a>' }), post('twin'), post('twin', { status: 'draft' })] },
      options: { tailwind: false, now: NOW },
    })
    expect(JSON.parse(r.files['src/data/posts.json']!)[0].body).toBe('<a href="/2026/twin/">t</a>')
    expect(r.withheld?.links).toEqual([])
  })

  it('content with no status and no schedule is emitted exactly as before', () => {
    const plain: EmitContent = { posts: [post('a', { body: '<a href="/2026/b/">b</a>' }), post('b')] }
    const r = emitAstroProject({ ir, content: plain, options: { tailwind: false } })
    expect(r.withheld).toBeUndefined()
    expect(r.warnings.filter((w) => w.startsWith('unpublished:'))).toEqual([])
    expect(JSON.parse(r.files['src/data/posts.json']!)).toEqual(plain.posts)
  })

  it('an options.now that is not a date falls back to the emit time and says so', () => {
    const r = emit({ options: { tailwind: false, now: 'tomorrow' } })
    expect(r.warnings).toContain('options.now "tomorrow" is not a date — publish_at is compared with the time of this emit')
  })
})
