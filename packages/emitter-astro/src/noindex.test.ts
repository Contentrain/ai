import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject, stripSeoTags } from './index'
import type { EmitContent } from './types'

// MG-15 §0.2: a page the source site kept out of search must not become
// indexable on the migrated site — robots meta on the page, and no sitemap entry.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-noindex')

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com' },
  routes: [
    { id: 'post', pattern: '/:year/:slug', kind: 'single', family: 'single' },
    // Pages: the slug is the full path, nested pages included.
    { id: 'pages', pattern: '/:slug*', kind: 'page', family: 'single', collection: 'pages' },
    { id: 'category', pattern: '/category/:term', kind: 'archive', family: 'single', query: 'by-term' },
  ],
  families: [{ id: 'single', chrome: [
    { id: 'h', position: 'head', html: '<meta name="robots" content="noindex, follow"><meta name="googlebot" content="noindex">' },
    { id: 'b', position: 'body', html: '<main><!--@@body@@--></main>' },
  ], css: { strategy: 'localcss' } }],
  css_default: 'purge_set',
} as ProjectIR

const content: EmitContent = {
  posts: [
    { slug: 'hidden', title: 'Hidden', body: '<p>x</p>', params: { year: '2024' }, noindex: true },
    { slug: 'public', title: 'Public', body: '<p>x</p>', params: { year: '2024' } },
    { slug: 'nofollow-only', title: 'NF', body: '<p>x</p>', params: { year: '2025' }, nofollow: true },
  ],
  collections: {
    pages: [
      { slug: 'about/team', title: 'Team', body: '<p>x</p>', noindex: true, nofollow: true },
      { slug: 'çay', title: 'Çay', body: '<p>x</p>', noindex: true },
      { slug: 'about', title: 'About', body: '<p>x</p>' },
    ],
  },
  queries: { 'by-term': [
    { params: { term: 'internal' }, items: [], noindex: true },
    { params: { term: 'news' }, items: [] },
  ] },
}

type Filter = (page: string) => boolean
function sitemapFilter(config: string): Filter {
  const start = config.indexOf('const NOINDEX')
  const end = config.indexOf('export default')
  const filter = /sitemap\(\{ filter: (\(page\) => [^}]+\)) \}\)/.exec(config)![1]!
  return new Function(`${config.slice(start, end)}\nreturn ${filter}`)() as Filter
}

type PostSeo = (post: Record<string, unknown>) => Record<string, unknown>
let postSeo: PostSeo

beforeAll(async () => {
  const { files } = emitAstroProject({ ir, content })
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'fill.ts'), files['src/lib/fill.ts']!, 'utf8')
  postSeo = ((await import(/* @vite-ignore */ join(TMP, 'fill.ts'))) as { postSeo: PostSeo }).postSeo
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('noindex pages', () => {
  const { files, warnings } = emitAstroProject({ ir, content })

  it('are left out of the sitemap — posts, nested and Unicode pages, list pages — and only those', () => {
    const config = files['astro.config.mjs']!
    expect(config).toContain(`const NOINDEX = new Set(["/2024/hidden/","/about/team/","/category/internal/","/çay/"])`)
    const keep = sitemapFilter(config)
    // What @astrojs/sitemap hands the filter: absolute, percent-encoded.
    expect(keep('https://example.com/2024/hidden/')).toBe(false)
    expect(keep('https://example.com/about/team/')).toBe(false)
    expect(keep('https://example.com/category/internal/')).toBe(false)
    expect(keep('https://example.com/%C3%A7ay/')).toBe(false)
    expect(keep('https://example.com/2024/hidden')).toBe(false)
    expect(keep('https://example.com/2024/public/')).toBe(true)
    expect(keep('https://example.com/2025/nofollow-only/')).toBe(true)
    expect(keep('https://example.com/about/')).toBe(true)
    expect(keep('https://example.com/category/news/')).toBe(true)
  })

  it('get a robots meta from the Seo component, on entry and list pages', async () => {
    const seo = files['src/components/Seo.astro']!
    expect(seo).toContain(`const robots = [noindex && 'noindex', nofollow && 'nofollow', ...robotsDefault].filter(Boolean).join(', ')`)
    expect(seo).toContain('{robots && <meta name="robots" content={robots} />}')
    expect(postSeo({ title: 'T', body: '', noindex: true, nofollow: true })).toMatchObject({ noindex: true, nofollow: true })
    expect(postSeo({ title: 'T', body: '' })).toMatchObject({ noindex: undefined, nofollow: undefined })
    expect(files['src/pages/category/[term].astro']).toContain('noindex: page.noindex, nofollow: page.nofollow')
    // The flags travel in the page data the routes read.
    expect(JSON.parse(files['src/data/posts.json']!)[0]).toMatchObject({ slug: 'hidden', noindex: true })
  })

  it("take the template page's robots tags out of the head chrome, so one page's noindex does not spread", () => {
    const layout = Object.entries(files).find(([path]) => path.startsWith('src/layouts/'))![1]
    expect(layout).not.toContain('name="robots"')
    expect(layout).not.toContain('name="googlebot"')
    expect(stripSeoTags('<meta name="robots" content="noindex"><meta name="googlebot" content="noindex"><meta name="viewport" content="x">')).toEqual({
      html: '<meta name="viewport" content="x">',
      removed: ['robots', 'googlebot'],
      kept: [],
      robots: [],
    })
    expect(warnings.some((w) => w.includes('noindex'))).toBe(false)
  })

  it("keep the template's site-wide robots settings on every page, after the page's own directives", () => {
    // Yoast prints its site settings in the same tag as the page's index/follow.
    const yoast = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"><meta name="googlebot" content="index, follow, max-snippet:-1, notranslate">'
    expect(stripSeoTags(yoast).robots).toEqual(['max-image-preview:large', 'max-snippet:-1', 'max-video-preview:-1', 'notranslate'])
    const withYoast = { ...ir, families: [{ ...ir.families[0]!, chrome: [{ id: 'h', position: 'head' as const, html: yoast }, ir.families[0]!.chrome[1]!] }] } as ProjectIR
    const { files: yoastFiles } = emitAstroProject({ ir: withYoast, content })
    const layout = Object.entries(yoastFiles).find(([path]) => path.startsWith('src/layouts/'))![1]
    expect(layout).toContain(`robotsDefault={["max-image-preview:large","max-snippet:-1","max-video-preview:-1","notranslate"]}`)
    expect(layout).not.toContain('name="robots"')
    // So an indexable page prints the settings alone, a noindex page both.
    expect(yoastFiles['src/components/Seo.astro']).toContain(`const robots = [noindex && 'noindex', nofollow && 'nofollow', ...robotsDefault].filter(Boolean).join(', ')`)
  })

  it('with seo off: still out of the sitemap, and a warning that the head must carry the robots meta', () => {
    const off = emitAstroProject({ ir, content, options: { seo: false } })
    expect(off.files['astro.config.mjs']).toContain('/2024/hidden/')
    expect(off.warnings).toContain('4 noindex pages: options.seo is false, so no robots meta is emitted — the producer\'s head must carry it (they are still left out of the sitemap)')
  })

  it('without noindex pages the sitemap has no filter', () => {
    const plain = emitAstroProject({ ir, content: { posts: [{ slug: 'a', title: 'A', body: '', params: { year: '2024' } }] } })
    expect(plain.files['astro.config.mjs']).toContain('integrations: [sitemap()],')
    expect(plain.files['astro.config.mjs']).not.toContain('NOINDEX')
  })
})
