import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitContent } from './index'
import { emitAstroProject, linkSources, rewriteFeedLinks } from './index'
import { entryPath } from './alternates'

// MG-15 §3–4: WordPress serves the newest posts as RSS at /feed/ and Yoast
// writes /llms.txt. The migrated site builds both from the data its pages are
// built from, each entry at the address its own page has.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-feed')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rt: Record<string, any>
const site = new URL('https://example.com')

const HEAD = [
  '<link rel="alternate" type="application/rss+xml" title="Example » Feed" href="https://example.com/feed/" />',
  '<link rel="alternate" type="application/rss+xml" title="Example » Comments Feed" href="https://example.com/comments/feed/" />',
  '<link rel="alternate" type="application/rss+xml" title="Newsletter" href="https://feeds.feedburner.com/example" />',
].join('\n')

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', title: 'Example', locales: ['en'] },
  routes: [
    { id: 'r-post', pattern: '/:year/:slug', kind: 'single', family: 'f' },
    { id: 'r-post-tr', pattern: '/tr/:year/:slug', kind: 'single', family: 'f', locale: 'tr' },
    { id: 'r-page', pattern: '/:slug*', kind: 'page', family: 'f', collection: 'pages' },
    { id: 'r-news', pattern: '/news', kind: 'archive', family: 'f', query: 'q' },
  ],
  families: [{ id: 'f', kind: 'single', chrome: [
    { id: 'head', position: 'head', html: HEAD },
    { id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` },
  ], css: { strategy: 'localcss' } }],
  queries: [{ id: 'q', source: 'posts', order: { by: 'date', direction: 'desc' }, per_page: 10, pagination: 'numbered' }],
  css_default: 'purge_set',
}

const content: EmitContent = {
  posts: [
    { slug: 'older', title: 'Older', body: '', params: { year: '2024' }, published_at: '2024-05-01T08:00:00Z', excerpt: '<p>An <b>older</b> post.</p>' },
    { slug: 'newer', title: 'Newer & better', body: '', params: { year: '2025' }, published_at: '2025-02-03T10:30:00Z', description: 'The newest one.', author: 'Ada' },
    { slug: 'yeni', title: 'Yeni', body: '', params: { year: '2025' }, published_at: '2025-03-01T00:00:00Z', locale: 'tr' },
  ],
  collections: {
    pages: [
      { slug: 'about/team', title: 'Team [core]', body: '' },
      { slug: 'çay', title: 'Çay', body: '' },
    ],
  },
  queries: { q: [{ params: {}, items: [] }] },
}

beforeAll(async () => {
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'fill.ts'), emitAstroProject({ ir }).files['src/lib/fill.ts']!, 'utf8')
  rt = await import(/* @vite-ignore */ join(TMP, 'fill.ts'))
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('entry links (emitted runtime)', () => {
  it('address each entry the way its page is addressed, newest first, in one language', () => {
    const links = rt.entryLinks(content.posts, '/:year/:slug', site, 'en', 'en')
    expect(links).toEqual([
      { title: 'Newer & better', url: 'https://example.com/2025/newer/', description: 'The newest one.', date: '2025-02-03T10:30:00Z', author: 'Ada' },
      { title: 'Older', url: 'https://example.com/2024/older/', description: 'An older post.', date: '2024-05-01T08:00:00Z', author: undefined },
    ])
    expect(rt.entryLinks(content.posts, '/tr/:year/:slug', site, 'tr', 'en').map((l: { url: string }) => l.url)).toEqual(['https://example.com/tr/2025/yeni/'])
  })

  it('nested and Unicode page paths; an entry missing a parameter is left out; undated keep their order', () => {
    const pages = [...content.collections!.pages!, { slug: '', title: 'No slug', body: '' }]
    expect(rt.entryLinks(pages, '/:slug*', site, 'en', 'en').map((l: { url: string }) => l.url))
      .toEqual(['https://example.com/about/team/', 'https://example.com/%C3%A7ay/'])
    expect(rt.entryLinks(content.posts, '/:year/:slug', undefined, 'en', 'en')).toEqual([])
  })
})

describe('entryAddress agrees with entryPath', () => {
  it('the runtime and the emitter address an entry the same way', () => {
    const cases: Array<[string, Record<string, string | undefined>]> = [
      ['/', {}],
      ['/:slug', { slug: 'hello' }],
      ['/:year/:slug/', { year: '2025', slug: 'a' }],
      ['/:slug*', { slug: '/about/team/' }],
      ['/category/:term*', { term: 'a/b' }],
      ['/:year/:slug', { slug: 'missing-year' }],
      ['/:slug', { slug: '' }],
      ['/çay/:slug', { slug: 'ş' }],
    ]
    for (const [pattern, params] of cases) expect(rt.entryAddress(pattern, params) ?? null).toBe(entryPath(pattern, params))
  })
})

describe('rssFeed (emitted runtime)', () => {
  const channel = {
    title: 'Example & Co',
    link: 'https://example.com/',
    self: 'https://example.com/feed.xml',
    language: 'en',
    items: [
      { title: 'A <b>bold</b> "title"\u0007', url: 'https://example.com/a/', description: 'Text & more', date: '2025-02-03T10:30:00Z', author: 'Ada' },
      { title: 'Undated', url: 'https://example.com/b/' },
    ],
  }

  it('is RSS 2.0 with escaped text, RFC 822 dates and the newest item as lastBuildDate', () => {
    expect(rt.rssFeed(channel)).toBe([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
      '<channel>',
      '<title>Example &amp; Co</title>',
      '<link>https://example.com/</link>',
      '<atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>',
      '<description>Example &amp; Co</description>',
      '<language>en</language>',
      '<lastBuildDate>Mon, 03 Feb 2025 10:30:00 GMT</lastBuildDate>',
      '<item><title>A &lt;b&gt;bold&lt;/b&gt; &quot;title&quot;</title><link>https://example.com/a/</link><guid isPermaLink="true">https://example.com/a/</guid><pubDate>Mon, 03 Feb 2025 10:30:00 GMT</pubDate><dc:creator>Ada</dc:creator><description>Text &amp; more</description></item>',
      '<item><title>Undated</title><link>https://example.com/b/</link><guid isPermaLink="true">https://example.com/b/</guid></item>',
      '</channel>',
      '</rss>',
      '',
    ].join('\n'))
  })

  it('uses the tagline as the description when there is one; no items, no lastBuildDate', () => {
    const xml = rt.rssFeed({ ...channel, description: 'Just a site', items: [] })
    expect(xml).toContain('<description>Just a site</description>')
    expect(xml).not.toContain('lastBuildDate')
    expect(xml).not.toContain('<item>')
  })
})

describe('llmsTxt (emitted runtime)', () => {
  it('writes the llmstxt.org shape: name, summary, a section of links per kind', () => {
    const text = rt.llmsTxt({
      title: 'Example',
      description: 'A site\nabout things.',
      sections: [
        { name: 'Posts', links: [{ title: 'Newer [draft]', url: 'https://example.com/2025/newer/', description: 'The newest one.' }] },
        { name: 'Empty', links: [] },
        { name: 'Pages', links: [{ title: 'Paren', url: 'https://example.com/a_(b)/' }] },
      ],
    })
    expect(text).toBe([
      '# Example',
      '',
      '> A site about things.',
      '',
      '## Posts',
      '',
      '- [Newer \\[draft\\]](https://example.com/2025/newer/): The newest one.',
      '',
      '## Pages',
      '',
      '- [Paren](https://example.com/a_%28b%29/)',
      '',
    ].join('\n'))
  })
})

describe('emitted feed and llms.txt', () => {
  const result = emitAstroProject({ ir, content, options: { siteDescription: 'Things, written down.' } })

  it('read the collections the site builds pages for, in its default language: posts, then pages', () => {
    expect(linkSources(ir.routes, 'en')).toEqual([
      { collection: 'posts', pattern: '/:year/:slug' },
      { collection: 'pages', pattern: '/:slug*' },
    ])
  })

  it('the feed endpoint: the newest posts from the posts data file, at the post route', () => {
    const feed = result.files['src/pages/feed.xml.ts']!
    expect(feed).toContain(`import data from '../data/posts.json'`)
    expect(feed).toContain(`const items = entryLinks(data as EmittedPost[], "/:year/:slug", site, "en", "en").slice(0, 10)`)
    expect(feed).toContain(`self: new URL("/feed.xml", site).toString(),`)
    expect(feed).toContain(`description: "Things, written down.",`)
    expect(feed).toContain(`'Content-Type': 'application/rss+xml; charset=utf-8'`)
  })

  it('the llms.txt endpoint: a section per collection', () => {
    const llms = result.files['src/pages/llms.txt.ts']!
    expect(llms).toContain(`import c0 from '../data/posts.json'`)
    expect(llms).toContain(`import c1 from '../data/pages.json'`)
    expect(llms).toContain(`{ name: "Posts", links: entryLinks(c0 as EmittedPost[], "/:year/:slug", site, "en", "en").slice(0, 100) },`)
    expect(llms).toContain(`{ name: "Pages", links: entryLinks(c1 as EmittedPost[], "/:slug*", site, "en", "en").slice(0, 100) },`)
  })

  it("point the theme's main feed link at /feed.xml, leave other hosts' feeds alone, and say what 404s", () => {
    const chrome = JSON.parse(result.files['src/data/chrome/f.json']!) as { head: string }
    expect(chrome.head).toContain('title="Example » Feed" href="/feed.xml"')
    expect(chrome.head).toContain('href="https://example.com/comments/feed/"')
    expect(chrome.head).toContain('href="https://feeds.feedburner.com/example"')
    expect(result.warnings).toContain('family f: 1 feed links in the head (comments, a category, Atom) name feeds the site does not build — they 404 on the migrated site')
    expect(result.warnings).toContain('feed: RSS is built at /feed.xml; a reader subscribed to the WordPress address /feed/ needs a 301 /feed/ → /feed.xml at the host — feed readers do not follow a static redirect page')
  })

  it('options.feed / options.llms false leave each out, and the head as it was', () => {
    const off = emitAstroProject({ ir, content, options: { feed: false, llms: false } })
    expect(off.files['src/pages/feed.xml.ts']).toBeUndefined()
    expect(off.files['src/pages/llms.txt.ts']).toBeUndefined()
    expect(JSON.parse(off.files['src/data/chrome/f.json']!).head).toContain('href="https://example.com/feed/"')
    expect(off.warnings.some((w) => w.startsWith('feed:'))).toBe(false)
  })

  it('without a site URL neither is built, and the emit says why', () => {
    const none = emitAstroProject({ ir: { ...ir, site: { ...ir.site, url: '' } }, content })
    expect(none.files['src/pages/feed.xml.ts']).toBeUndefined()
    expect(none.files['src/pages/llms.txt.ts']).toBeUndefined()
    expect(none.warnings).toContain('site.url is empty — no RSS feed and no llms.txt are built; both name pages by absolute address')
  })

  it('a site without a posts route gets llms.txt but no feed', () => {
    const pagesOnly = emitAstroProject({ ir: { ...ir, routes: ir.routes.filter((r) => r.collection === 'pages') }, content })
    expect(pagesOnly.files['src/pages/feed.xml.ts']).toBeUndefined()
    expect(pagesOnly.files['src/pages/llms.txt.ts']).toContain(`import c0 from '../data/pages.json'`)
  })
})

describe('rewriteFeedLinks', () => {
  it('recognises the main feed by path or query, relative or absolute, and never another host', () => {
    const cases: Array<[string, string]> = [
      ['<link rel="alternate" type="application/rss+xml" href="/feed/">', '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'],
      ["<link type='application/rss+xml' rel='alternate' href='https://EXAMPLE.com/?feed=rss2'>", "<link type='application/rss+xml' rel='alternate' href='/feed.xml'>"],
      ['<link rel="alternate" type="application/rss+xml" href="https://example.com/feed/rss2/">', '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'],
      ['<link rel="alternate" type="application/atom+xml" href="/feed/atom/">', '<link rel="alternate" type="application/atom+xml" href="/feed/atom/">'],
      ['<link rel="alternate" type="application/rss+xml" href="https://www.example.com/feed/">', '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'],
      ['<link rel="alternate" type="application/rss+xml" href="https://other.example/feed/">', '<link rel="alternate" type="application/rss+xml" href="https://other.example/feed/">'],
      ['<link rel="alternate" hreflang="de" href="https://example.com/de/">', '<link rel="alternate" hreflang="de" href="https://example.com/de/">'],
    ]
    for (const [input, output] of cases) expect(rewriteFeedLinks(input, 'https://example.com').html).toBe(output)
    expect(rewriteFeedLinks(cases.map((c) => c[0]).join(''), 'https://example.com')).toMatchObject({ rewritten: 4, other: 1 })
  })
})
