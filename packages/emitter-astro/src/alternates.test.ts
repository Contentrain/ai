import { describe, it, expect } from 'vitest'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitContent, EmitPost } from './index'
import { emitAstroProject, entryPath, stripSeoTags, withAlternates } from './index'

// A multilingual site is a route per language, and a translation is the same
// content-store entry in another locale. Everything here is derived from those
// two facts; nothing asks the producer where a translation lives.

const entry = (id: string, locale: string) => ({ model_id: 'posts', entry_id: id, locale })

const routes: ProjectIR['routes'] = [
  { id: 'r-en', pattern: '/:slug', kind: 'single', family: 'f', collection: 'posts-en' },
  { id: 'r-tr', pattern: '/tr/:slug', kind: 'single', family: 'f', collection: 'posts-tr', locale: 'tr' },
]

const post = (slug: string, id: string | null, locale: string, over: Partial<EmitPost> = {}): EmitPost => ({
  slug,
  title: slug,
  body: '<p>x</p>',
  ...(id ? { entry: entry(id, locale) } : {}),
  ...over,
})

const content: EmitContent = {
  collections: {
    'posts-en': [post('hello', 'e1', 'en'), post('only-english', 'e2', 'en')],
    'posts-tr': [post('merhaba', 'e1', 'tr')],
  },
}

describe('entryPath', () => {
  it('fills a pattern the way getStaticPaths does, in directory format', () => {
    expect(entryPath('/tr/:slug', { slug: 'merhaba' })).toBe('/tr/merhaba/')
    expect(entryPath('/:year/:month/:slug', { year: '2026', month: '09', slug: 'a' })).toBe('/2026/09/a/')
    expect(entryPath('/category/:term*', { term: 'news/local' })).toBe('/category/news/local/')
    expect(entryPath('/about', {})).toBe('/about/')
    expect(entryPath('/', {})).toBe('/')
  })

  it('has no address for a parameter without a value', () => {
    expect(entryPath('/:year/:slug', { slug: 'a' })).toBeNull()
  })
})

describe('withAlternates', () => {
  const { content: out, warnings } = withAlternates(routes, content, 'en')
  const en = out.collections!['posts-en']!
  const tr = out.collections!['posts-tr']!

  it('links an entry to its translations, itself included, with x-default at the site language', () => {
    const expected = [
      { lang: 'en', path: '/hello/' },
      { lang: 'tr', path: '/tr/merhaba/' },
      { lang: 'x-default', path: '/hello/' },
    ]
    expect((en[0] as EmitPost & { alternates?: unknown }).alternates).toEqual(expected)
    expect((tr[0] as EmitPost & { alternates?: unknown }).alternates).toEqual(expected)
    expect(warnings).toEqual([])
  })

  it('takes the language from the route — producers do not write post.locale', () => {
    // No post above carries `locale`; `tr` came from route r-tr.
    expect(content.collections!['posts-tr']![0]!.locale).toBeUndefined()
  })

  it('leaves an entry with no translation alone, and does not mutate the input', () => {
    expect('alternates' in en[1]!).toBe(false)
    expect('alternates' in content.collections!['posts-en']![0]!).toBe(false)
  })

  it('a single-language site gets nothing and no warnings', () => {
    const one = withAlternates([routes[0]!], { collections: { 'posts-en': [post('a', null, 'en')] } }, 'en')
    expect(one.warnings).toEqual([])
    expect('alternates' in one.content.collections!['posts-en']![0]!).toBe(false)
  })

  it('says how many posts it could not link when they carry no entry address', () => {
    const bare = withAlternates(routes, { collections: { 'posts-en': [post('a', null, 'en')], 'posts-tr': [post('b', null, 'tr')] } }, 'en')
    expect(bare.warnings).toEqual([
      'collection posts-en: 1 posts carry no entry address — hreflang cannot link them to their translations',
      'collection posts-tr: 1 posts carry no entry address — hreflang cannot link them to their translations',
    ])
  })

  it('prints nothing for a post two routes generate — its address would be a guess', () => {
    const shared = post('hello', 'e1', 'en')
    const both = withAlternates(
      [...routes, { id: 'r-dup', pattern: '/blog/:slug', kind: 'single', family: 'f', collection: 'posts-en' }],
      { collections: { 'posts-en': [shared], 'posts-tr': [post('merhaba', 'e1', 'tr')] } },
      'en',
    )
    expect(both.warnings.some((w) => w.includes('collection posts-en: 1 posts have no single address'))).toBe(true)
    expect('alternates' in both.content.collections!['posts-tr']![0]!).toBe(false)
  })

  it('prints nothing for an entry where two pages claim one language', () => {
    const clash = withAlternates(routes, {
      collections: {
        'posts-en': [post('hello', 'e1', 'en'), post('hello-again', 'e1', 'en')],
        'posts-tr': [post('merhaba', 'e1', 'tr')],
      },
    }, 'en')
    expect(clash.warnings).toEqual(['entry posts/e1: two pages claim the same language — no hreflang for this entry'])
    expect('alternates' in clash.content.collections!['posts-tr']![0]!).toBe(false)
  })

  it('omits x-default when no translation is in the site language', () => {
    const noDefault = withAlternates(
      [routes[1]!, { id: 'r-de', pattern: '/de/:slug', kind: 'single', family: 'f', collection: 'posts-de', locale: 'de' }],
      { collections: { 'posts-tr': [post('merhaba', 'e1', 'tr')], 'posts-de': [post('hallo', 'e1', 'de')] } },
      'en',
    )
    const alternates = (noDefault.content.collections!['posts-de']![0] as EmitPost & { alternates: Array<{ lang: string }> }).alternates
    expect(alternates.map((a) => a.lang)).toEqual(['de', 'tr'])
  })
})

describe('stripSeoTags and translation links', () => {
  it('removes the template page’s hreflang links and keeps feeds', () => {
    const head = [
      '<link rel="alternate" hreflang="tr" href="https://example.com/tr/template/" />',
      '<link hreflang="x-default" href="https://example.com/template/" rel="alternate">',
      '<link rel="alternate" type="application/rss+xml" href="/feed/" />',
    ].join('\n')
    const out = stripSeoTags(head)
    expect(out.html.trim()).toBe('<link rel="alternate" type="application/rss+xml" href="/feed/" />')
    expect(out.removed).toEqual(['hreflang'])
  })
})

describe('emitted hreflang', () => {
  const ir: ProjectIR = {
    version: MIGRATION_CONTRACT_VERSION,
    site: { url: 'https://example.com', title: 'Example', locales: ['en', 'tr'] },
    routes,
    families: [{ id: 'f', kind: 'single', chrome: [{ id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` }], css: { strategy: 'localcss' } }],
    css_default: 'purge_set',
  }
  const result = emitAstroProject({ ir, content })

  it('writes the alternates into the entry data the page reads', () => {
    const tr = JSON.parse(result.files['src/data/posts-tr.json']!)
    expect(tr[0].alternates).toEqual([
      { lang: 'en', path: '/hello/' },
      { lang: 'tr', path: '/tr/merhaba/' },
      { lang: 'x-default', path: '/hello/' },
    ])
  })

  it('the Seo component prints each alternate as an absolute link, and og:locale:alternate for the others', () => {
    const seo = result.files['src/components/Seo.astro']!
    expect(seo).toContain('{hreflang.map((a) => <link rel="alternate" hreflang={a.lang} href={a.href} />)}')
    expect(seo).toContain('const href = absoluteUrl(pagePath(a.path, trailingSlash), site)')
    expect(seo).toContain(`{localeAlternates.map((l) => <meta property="og:locale:alternate" content={l} />)}`)
  })

  it('seo:false attaches nothing — the producer owns the head', () => {
    const off = emitAstroProject({ ir, content, options: { seo: false } })
    expect(JSON.parse(off.files['src/data/posts-tr.json']!)[0].alternates).toBeUndefined()
  })
})
