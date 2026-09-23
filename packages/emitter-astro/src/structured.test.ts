import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitInput } from './index'
import { emitAstroProject, websiteIdOf } from './index'

// A page's structured data says what the page is (WebPage, CollectionPage),
// where it sits (BreadcrumbList) and what it holds (Article), linked by @id.
// These run the emitted runtime itself — the code the site builds with.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-structured')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rt: Record<string, any>
const site = new URL('https://example.com')

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', title: 'Example', locales: ['en'] },
  routes: [
    { id: 'r-post', pattern: '/:slug', kind: 'single', family: 'f' },
    { id: 'r-news', pattern: '/news', kind: 'archive', family: 'f', query: 'q' },
  ],
  families: [{ id: 'f', kind: 'single', chrome: [{ id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` }], css: { strategy: 'localcss' } }],
  queries: [{ id: 'q', source: 'posts', order: { by: 'date', direction: 'desc' }, per_page: 10, pagination: 'numbered' }],
  css_default: 'purge_set',
}

beforeAll(async () => {
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'fill.ts'), emitAstroProject({ ir }).files['src/lib/fill.ts']!, 'utf8')
  rt = await import(/* @vite-ignore */ join(TMP, 'fill.ts'))
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('pageStructuredData', () => {
  const base = { url: 'https://example.com/news/hello/', site, title: 'Hello', description: 'A post', locale: 'en' }

  it('an entry: its page, its trail and its article, linked by @id', () => {
    const data = rt.pageStructuredData({
      ...base,
      article: true,
      websiteId: 'https://example.com/#website',
      breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'News', path: '/news/' }],
      author: 'Ada',
      publishedAt: '2026-01-01T00:00:00Z',
    })
    expect(data['@context']).toBe('https://schema.org')
    const [page, trail, article] = data['@graph']
    expect(page).toEqual({
      '@type': 'WebPage',
      '@id': 'https://example.com/news/hello/',
      url: 'https://example.com/news/hello/',
      name: 'Hello',
      description: 'A post',
      inLanguage: 'en',
      isPartOf: { '@id': 'https://example.com/#website' },
      breadcrumb: { '@id': 'https://example.com/news/hello/#breadcrumb' },
    })
    // The last crumb is the page, at the address the page was built at.
    expect(trail).toEqual({
      '@type': 'BreadcrumbList',
      '@id': 'https://example.com/news/hello/#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
        { '@type': 'ListItem', position: 2, name: 'News', item: 'https://example.com/news/' },
        { '@type': 'ListItem', position: 3, name: 'Hello', item: 'https://example.com/news/hello/' },
      ],
    })
    expect(article).toMatchObject({ '@type': 'Article', headline: 'Hello', mainEntityOfPage: { '@id': 'https://example.com/news/hello/' } })
  })

  it('a list page is a CollectionPage, and nothing names a WebSite the head did not declare', () => {
    const data = rt.pageStructuredData({ ...base, url: 'https://example.com/news/', article: false, pageType: 'CollectionPage' })
    expect(data['@graph']).toEqual([{
      '@type': 'CollectionPage', '@id': 'https://example.com/news/', url: 'https://example.com/news/', name: 'Hello', description: 'A post', inLanguage: 'en',
    }])
  })

  it('no trail, or a trail with a bad crumb, prints no BreadcrumbList and no link to one', () => {
    for (const breadcrumbs of [undefined, [], [{ name: 'Home', path: 'https://other.example/' }], [{ name: '', path: '/' }], [{ name: 'Home', path: '//cdn.example/' }]]) {
      const data = rt.pageStructuredData({ ...base, article: false, breadcrumbs })
      expect(data['@graph'].map((n: { '@type': string }) => n['@type']), JSON.stringify(breadcrumbs)).toEqual(['WebPage'])
      expect(data['@graph'][0].breadcrumb).toBeUndefined()
    }
  })

  it('without a site address there is no page node to name — only an entry’s article remains', () => {
    const data = rt.pageStructuredData({ title: 'Hello', article: true, breadcrumbs: [{ name: 'Home', path: '/' }] })
    expect(data['@graph'].map((n: { '@type': string }) => n['@type'])).toEqual(['Article'])
    expect(data['@graph'][0].mainEntityOfPage).toBeUndefined()
    expect(rt.pageStructuredData({ title: 'x', article: false })).toBeUndefined()
  })
})

describe('the emit-time warning uses the runtime’s rule', () => {
  const trails = [
    [{ name: 'Home', path: '/' }],
    [{ name: 'Home', path: 'relative/' }],
    [{ name: ' ', path: '/' }],
    [{ name: 'Home', path: '//evil.example/' }],
    [{ name: 'Home', path: '/' + String.fromCharCode(92) + 'evil.example/' }],
    [{ name: 'Home', path: '/\t/evil.example/' }],
    [],
    [{ name: 'Home', path: '/' }, { name: 'News', path: '/news/' }],
  ]

  it('drops exactly the trails the runtime would not print, and counts them', () => {
    const valid = trails.filter((t) => rt.validTrail(t) !== undefined)
    expect(valid).toHaveLength(2)
    const input: EmitInput = {
      ir,
      content: {
        posts: trails.map((breadcrumbs, i) => ({ slug: `p${i}`, title: `P${i}`, body: '', breadcrumbs })),
        queries: { q: [{ params: {}, items: [], item_template: '<li>@@title@@</li>', breadcrumbs: [{ name: 'Home', path: 'nope' }] }] },
      },
    }
    const { warnings } = emitAstroProject(input)
    expect(warnings).toContain(`collection posts: ${trails.length - valid.length} breadcrumb trails dropped — every crumb needs a name and a site-root-relative path`)
    expect(warnings).toContain('query q: 1 breadcrumb trails dropped — every crumb needs a name and a site-root-relative path')
  })
})

describe('the WebSite a page is part of', () => {
  it('is the @id the head’s own structured data declares, or nothing', () => {
    expect(websiteIdOf('<script type="application/ld+json">{"@graph":[{"@type":"WebSite","@id":"https://example.com/#website"},{"@type":"Organization"}]}</script>')).toBe('https://example.com/#website')
    expect(websiteIdOf('<script type="application/ld+json">{"@type":"WebSite","name":"No id"}</script>')).toBeUndefined()
    expect(websiteIdOf('<script type="application/ld+json">{ broken</script>')).toBeUndefined()
    expect(websiteIdOf('<meta charset="utf-8">')).toBeUndefined()
  })

  it('reaches the Seo component from the kept head chrome, and a list page declares itself a collection', () => {
    const head = '<script type="application/ld+json">{"@graph":[{"@type":"WebPage","@id":"https://example.com/template/"},{"@type":"WebSite","@id":"https://example.com/#website","name":"Example"}]}</script>'
    const withHead = emitAstroProject({ ir: { ...ir, families: [{ ...ir.families[0]!, chrome: [{ id: 'head', position: 'head', html: head }, ...ir.families[0]!.chrome!] }] }, content: { posts: [], queries: { q: [] } } })
    expect(withHead.files['src/layouts/F.astro']).toContain('websiteId={"https://example.com/#website"}')
    expect(withHead.files['src/pages/news.astro']).toContain(`pageType: 'CollectionPage'`)
    expect(withHead.files['src/components/Seo.astro']).toContain('const structured = sourceStructuredData(schema, headLdIds) ?? pageStructuredData({')
    expect(emitAstroProject({ ir }).files['src/layouts/F.astro']).not.toContain('websiteId=')
  })
})
