import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitContent } from './index'
import { emitAstroProject } from './index'

// MG-15 §4: a WordPress site whose permalinks end without a slash (/hello)
// was indexed under that form. The migrated site serves every page there and
// names it that way — canonical, og:url, hreflang, feed, llms.txt, sitemap.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-trailing-slash')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rt: Record<string, any>

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', title: 'Example', locales: ['en'] },
  routes: [
    { id: 'r-post', pattern: '/:year/:slug', kind: 'single', family: 'f' },
    { id: 'r-page', pattern: '/:slug*', kind: 'page', family: 'f', collection: 'pages' },
  ],
  families: [{ id: 'f', kind: 'single', chrome: [{ id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` }], css: { strategy: 'localcss' } }],
  css_default: 'purge_set',
}

const content: EmitContent = {
  posts: [{ slug: 'hello', title: 'Hello', body: '', params: { year: '2025' }, published_at: '2025-02-03T10:30:00Z' }],
  collections: { pages: [{ slug: 'about/team', title: 'Team', body: '' }] },
}

beforeAll(async () => {
  await mkdir(TMP, { recursive: true })
  await writeFile(join(TMP, 'fill.ts'), emitAstroProject({ ir }).files['src/lib/fill.ts']!, 'utf8')
  rt = await import(/* @vite-ignore */ join(TMP, 'fill.ts'))
})

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('pagePath (emitted runtime)', () => {
  it("names a built page at the source's form of its address", () => {
    const cases: Array<[string, boolean, string]> = [
      // The file build: what Astro.url.pathname holds.
      ['/hello.html', false, '/hello'],
      ['/2025/hello.html', false, '/2025/hello'],
      ['/index.html', false, '/'],
      ['/about/index.html', false, '/about'],
      // The directory build, and emit-time paths (hreflang alternates).
      ['/hello/', false, '/hello'],
      ['/hello/', true, '/hello/'],
      ['/hello', true, '/hello/'],
      ['/', true, '/'],
      ['/', false, '/'],
    ]
    for (const [path, slash, expected] of cases) expect(rt.pagePath(path, slash)).toBe(expected)
  })

  it('entry addresses follow the same rule', () => {
    expect(rt.entryAddress('/:year/:slug', { year: '2025', slug: 'hello' }, false)).toBe('/2025/hello')
    expect(rt.entryAddress('/:year/:slug', { year: '2025', slug: 'hello' })).toBe('/2025/hello/')
    expect(rt.entryAddress('/', {}, false)).toBe('/')
    expect(rt.entryLinks(content.posts, '/:year/:slug', new URL('https://example.com'), 'en', 'en', false, false)[0].url).toBe('https://example.com/2025/hello')
  })
})

describe('a site without trailing slashes', () => {
  const result = emitAstroProject({ ir, content, options: { trailingSlash: false } })

  it('is built as files, and Astro told the addresses end without a slash', () => {
    const config = result.files['astro.config.mjs']!
    expect(config).toContain(`  build: { format: 'file' },\n  trailingSlash: 'never',`)
    expect(config).not.toContain(`format: 'directory'`)
  })

  it('the Seo component names the page by its served address, hreflang included', () => {
    expect(result.files['src/layouts/F.astro']).toContain(' trailingSlash={false}')
    const seo = result.files['src/components/Seo.astro']!
    expect(seo).toContain('absoluteUrl(pagePath(Astro.url.pathname, trailingSlash), site)')
    expect(seo).toContain('absoluteUrl(pagePath(a.path, trailingSlash), site)')
  })

  it('the feed and llms.txt address entries without the slash', () => {
    expect(result.files['src/pages/feed.xml.ts']).toContain(`site, "en", "en", false, false).slice(0, 10)`)
    expect(result.files['src/pages/llms.txt.ts']).toContain(`site, "en", "en", true, false).slice(0, 100)`)
  })

  it('Vercel serves /hello from hello.html with cleanUrls, merged with the redirect rules', () => {
    expect(JSON.parse(result.files['vercel.json']!)).toMatchObject({ cleanUrls: true, trailingSlash: false })
    expect(JSON.parse(result.files['vercel.json']!).redirects).toContainEqual({ source: '/feed/', destination: '/feed.xml', statusCode: 301 })
    const netlify = emitAstroProject({ ir, content, options: { trailingSlash: false, redirectHost: 'netlify' } })
    expect(netlify.files['vercel.json']).toBeUndefined()
    const bare = emitAstroProject({ ir, content, options: { trailingSlash: false, feed: false } })
    expect(JSON.parse(bare.files['vercel.json']!)).toEqual({ cleanUrls: true, trailingSlash: false })
  })
})

describe('a site with trailing slashes (the default)', () => {
  it('is emitted as before: directories, no trailingSlash key, no Seo prop, no cleanUrls', () => {
    const result = emitAstroProject({ ir, content, options: { feed: false } })
    expect(result.files['astro.config.mjs']).toContain(`  build: { format: 'directory' },`)
    expect(result.files['astro.config.mjs']).not.toContain('trailingSlash')
    expect(result.files['src/layouts/F.astro']).not.toContain('trailingSlash=')
    expect(result.files['vercel.json']).toBeUndefined()
    expect(emitAstroProject({ ir, content }).files['src/pages/feed.xml.ts']).toContain(`site, "en", "en").slice(0, 10)`)
  })
})
