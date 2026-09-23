import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitContent } from './index'
import { emitAstroProject, publisherIdOf } from './index'

// EM-2 (MG-15 §3): the page-level signals a generative or classic search
// engine reads — what a page is, who publishes it, when it changed, its
// language and its image — as the source's SEO plugin stated them.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-geo')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rt: Record<string, any>
const site = new URL('https://example.com')

/** Yoast's site-wide graph in the head: the WebSite names its publisher by @id. */
const HEAD = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"https://example.com/template/"},{"@type":"WebSite","@id":"https://example.com/#website","publisher":{"@id":"https://example.com/#organization"}},{"@type":"Organization","@id":"https://example.com/#organization","name":"Example","logo":{"@id":"https://example.com/#logo"}},{"@type":"ImageObject","@id":"https://example.com/#logo","url":"https://example.com/logo.png"}]}</script>'

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', title: 'Example', locales: ['tr-TR'] },
  routes: [
    { id: 'r-post', pattern: '/:year/:slug', kind: 'single', family: 'f' },
    { id: 'r-page', pattern: '/:slug*', kind: 'page', family: 'f', collection: 'pages' },
  ],
  families: [{ id: 'f', kind: 'single', chrome: [
    { id: 'head', position: 'head', html: HEAD },
    { id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` },
  ], css: { strategy: 'localcss' } }],
  css_default: 'purge_set',
}

const content: EmitContent = {
  posts: [{ slug: 'hello', title: 'Hello', body: '', params: { year: '2025' } }],
  collections: { pages: [{ slug: 'about', title: 'About', body: '', modified_at: '2025-06-01T00:00:00Z' }] },
}

beforeAll(async () => {
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'fill.ts'), emitAstroProject({ ir }).files['src/lib/fill.ts']!, 'utf8')
  rt = await import(/* @vite-ignore */ join(TMP, 'fill.ts'))
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('A1 — a WordPress page is a web page, not an article', () => {
  const result = emitAstroProject({ ir, content, options: { feed: false, llms: false } })

  it('page routes hand their entries to the Seo component as pages; post routes as posts', () => {
    expect(result.files['src/pages/[...slug].astro']).toContain(`seo={postSeo(post, 'page')}`)
    expect(result.files['src/pages/[year]/[slug].astro']).toContain('seo={postSeo(post)}')
  })

  it('a page: og:type website and no Article; a post keeps both', () => {
    const page = rt.postSeo({ slug: 'about', title: 'About', body: '', author: 'Ada', published_at: '2025-01-01T00:00:00Z' }, 'page')
    expect(page.type).toBe('website')
    const post = rt.postSeo({ slug: 'hello', title: 'Hello', body: '' })
    expect(post.type).toBe('article')
    const graph = rt.pageStructuredData({ url: 'https://example.com/about/', site, title: 'About', article: page.type === 'article', publishedAt: page.publishedAt })['@graph']
    expect(graph.map((n: { '@type': string }) => n['@type'])).toEqual(['WebPage'])
  })

  it('a collection shared by a post route and a page route picks the kind per route', () => {
    const shared = emitAstroProject({
      ir: { ...ir, routes: [
        { id: 'r-post', pattern: '/:slug*', kind: 'single', family: 'f' },
        { id: 'r-page', pattern: '/:slug*', kind: 'page', family: 'f', collection: 'pages' },
      ] },
      content: { posts: [{ slug: 'hello', title: 'Hello', body: '' }], collections: { pages: [{ slug: 'about', title: 'About', body: '' }] } },
      options: { feed: false, llms: false },
    }).files['src/pages/[...slug].astro']!
    expect(shared).toContain(`const kinds = ["post","page"] as Array<'post' | 'page'>`)
    expect(shared).toContain('seo={postSeo(post, kinds[routeIndex])}')
  })
})

describe('B2 — the page node carries its dates', () => {
  it('WebPage datePublished / dateModified, on pages and posts alike', () => {
    const [page] = rt.pageStructuredData({ url: 'https://example.com/about/', site, title: 'About', article: false, publishedAt: '2024-01-01T00:00:00Z', modifiedAt: '2025-06-01T00:00:00Z' })['@graph']
    expect(page).toMatchObject({ '@type': 'WebPage', datePublished: '2024-01-01T00:00:00Z', dateModified: '2025-06-01T00:00:00Z' })
    const [undated] = rt.pageStructuredData({ url: 'https://example.com/about/', site, title: 'About', article: false })['@graph']
    expect(undated).not.toHaveProperty('dateModified')
  })
})

describe('A2 — the Article names the publisher the site declared', () => {
  it("reads the WebSite's publisher reference, else the first Organization, from the head", () => {
    expect(publisherIdOf(HEAD)).toBe('https://example.com/#organization')
    const noRef = '<script type="application/ld+json">[{"@type":"WebSite","@id":"https://example.com/#website"},{"@type":"Organization","@id":"https://example.com/#org"}]</script>'
    expect(publisherIdOf(noRef)).toBe('https://example.com/#org')
    const person = '<script type="application/ld+json">{"@graph":[{"@type":"WebSite","@id":"#w","publisher":{"@id":"https://example.com/#/schema/person/1"}},{"@type":"Person","@id":"https://example.com/#/schema/person/1","name":"Ada"}]}</script>'
    expect(publisherIdOf(person)).toBe('https://example.com/#/schema/person/1')
    expect(publisherIdOf('<meta charset="utf-8">')).toBeUndefined()
    // A reference to a node the head does not declare falls back to one it does.
    const dangling = '<script type="application/ld+json">{"@graph":[{"@type":"WebSite","@id":"#w","publisher":{"@id":"https://example.com/#missing"}},{"@type":"Organization","@id":"https://example.com/#org"}]}</script>'
    expect(publisherIdOf(dangling)).toBe('https://example.com/#org')
  })

  it('the layout passes it, and the Article refers to it by @id', () => {
    expect(emitAstroProject({ ir, content, options: { feed: false, llms: false } }).files['src/layouts/F.astro']).toContain('publisherId={"https://example.com/#organization"}')
    const graph = rt.pageStructuredData({ url: 'https://example.com/2025/hello/', site, title: 'Hello', article: true, siteName: 'Example', publisherId: 'https://example.com/#organization' })['@graph']
    expect(graph.at(-1).publisher).toEqual({ '@id': 'https://example.com/#organization' })
  })

  it('without a declared publisher: the site by name and address, never an invented logo', () => {
    const graph = rt.pageStructuredData({ url: 'https://example.com/2025/hello/', site, title: 'Hello', article: true, siteName: 'Example' })['@graph']
    expect(graph.at(-1).publisher).toEqual({ '@type': 'Organization', name: 'Example', url: 'https://example.com/' })
    const blog = rt.pageStructuredData({ url: 'https://example.com/blog/hello/', site: new URL('https://example.com/blog'), title: 'Hello', article: true, siteName: 'Example' })['@graph']
    expect(blog.at(-1).publisher.url).toBe('https://example.com/blog/')
    const bare = rt.pageStructuredData({ url: 'https://example.com/2025/hello/', site, title: 'Hello', article: true })['@graph']
    expect(bare.at(-1)).not.toHaveProperty('publisher')
  })
})

describe('A4 — og:locale in the form Open Graph reads', () => {
  it('ll_RR from a tag with a region; nothing from one without', () => {
    expect(rt.ogLocale('tr-TR')).toBe('tr_TR')
    expect(rt.ogLocale('en-us')).toBe('en_US')
    expect(rt.ogLocale('pt_BR')).toBe('pt_BR')
    expect(rt.ogLocale('en')).toBeUndefined()
    expect(rt.ogLocale('zh-Hant-TW')).toBeUndefined()
    expect(rt.ogLocale(undefined)).toBeUndefined()
  })

  it('the Seo component prints the converted locale and alternates, not the raw tag', () => {
    const seo = emitAstroProject({ ir }).files['src/components/Seo.astro']!
    expect(seo).toContain('{ogLang && <meta property="og:locale" content={ogLang} />}')
    expect(seo).toContain('hreflang.map((a) => ogLocale(a.lang))')
    expect(seo).not.toContain('content={locale}')
  })
})

describe('A5 — an Article image with its size is an ImageObject', () => {
  it('measured: ImageObject with width and height; unmeasured or invalid: the URL', () => {
    const image = (meta?: Record<string, unknown>) => rt.pageStructuredData({ title: 'T', article: true, image: 'https://example.com/a.jpg', imageMeta: meta })['@graph'][0].image
    expect(image({ width: 1200, height: 630, type: 'image/jpeg' })).toEqual([{ '@type': 'ImageObject', url: 'https://example.com/a.jpg', width: 1200, height: 630 }])
    expect(image()).toEqual(['https://example.com/a.jpg'])
    expect(image({ width: 1200 })).toEqual(['https://example.com/a.jpg'])
    expect(image({ width: -1, height: 630 })).toEqual(['https://example.com/a.jpg'])
  })

  it("the Seo component passes the image's measurements only beside the image", () => {
    expect(emitAstroProject({ ir }).files['src/components/Seo.astro']).toContain('imageMeta: imageUrl ? imageMeta : undefined,')
  })
})
