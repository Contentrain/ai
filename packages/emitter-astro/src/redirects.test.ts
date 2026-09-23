import { describe, it, expect } from 'vitest'
import type { ProjectIR, RawRedirect } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject } from './index'
import { astroRedirectsConfig, builtAddresses, planRedirects } from './redirects'

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com' },
  routes: [
    { id: 'post', pattern: '/:slug', kind: 'single', family: 'single' },
    { id: 'about', pattern: '/about', kind: 'page', family: 'single' },
    { id: 'category', pattern: '/category/:term', kind: 'archive', family: 'single', query: 'by-term' },
  ],
  families: [{ id: 'single', chrome: [{ id: 'b', position: 'body', html: '<main><!--@@body@@--></main>' }], css: { strategy: 'localcss' } }],
  css_default: 'purge_set',
} as ProjectIR

const content = {
  posts: [{ slug: 'hello-world', title: 'Hello', body: '<p>hi</p>' }],
  queries: { 'by-term': [{ params: { term: 'news' }, items: [] }] },
}

const emit = (redirects: RawRedirect[]) => emitAstroProject({ ir, content, redirects })

describe('redirects → astro.config', () => {
  it('writes plain url rules with their status, sorted by from; a missing status is 301', () => {
    const result = emit([
      { from: '/old-news/', to: '/category/news/', status: 302, match: 'url', source: 'redirection', id: 'redirection:2' },
      { from: '/eski-yazi/', to: '/hello-world/', source: 'wp-old-slug', id: 'wp-old-slug:7' },
      { from: '/gone-home/', to: 'https://other.example.org/landing', status: 308 },
      { from: '/temp/', to: '/about/', status: 307 },
    ])
    expect(result.files['astro.config.mjs']).toContain([
      `  redirects: {`,
      `    "/eski-yazi/": { status: 301, destination: "/hello-world/" },`,
      `    "/gone-home/": { status: 308, destination: "https://other.example.org/landing" },`,
      `    "/old-news/": { status: 302, destination: "/category/news/" },`,
      `    "/temp/": { status: 307, destination: "/about/" },`,
      `  },`,
    ].join('\n'))
    expect(result.redirects?.written).toHaveLength(4)
    expect(result.redirects?.manual).toEqual([])
    expect(result.warnings.some((w) => w.startsWith('redirects:'))).toBe(false)
  })

  it('the written config is a valid object literal Astro can load', () => {
    const { files } = emit([{ from: '/a"b/', to: '/c/' }, { from: '/%C3%A7ay/', to: '/tea/' }])
    const block = /redirects: (\{[\s\S]*?\n {2}\}),/.exec(files['astro.config.mjs']!)![1]!
    expect(new Function(`return ${block}`)()).toEqual({
      '/a"b/': { status: 301, destination: '/c/' },
      // Percent-encoding is decoded: the build writes the directory by its real name.
      '/çay/': { status: 301, destination: '/tea/' },
    })
  })

  it('returns patterns, regular expressions and other statuses as manual rules, with the reason', () => {
    const result = emit([
      { from: '^/blog/(.*)$', to: '/$1', regex: true, match: 'regex' },
      { from: '/shop/', to: '/store/', match: 'start' },
      { from: 'sale', to: '/offers/', match: 'contains' },
      { from: '/removed/', to: '/', status: 410 },
      { from: '/see-other/', to: '/', status: 303 },
      { from: '/?p=123', to: '/hello-world/' },
      { from: '/feed.xml', to: '/rss/' },
      { from: '/[slug]/', to: '/x/' },
      { from: '/bad-target/', to: 'javascript:alert(1)' },
      { from: 'relative/', to: '/x/' },
    ])
    expect(result.files['astro.config.mjs']).not.toContain('redirects')
    expect(result.redirects?.written).toEqual([])
    expect(result.redirects?.manual.map((m) => m.reason)).toEqual([
      'from is a regular expression',
      'match "start" is a pattern, not one address',
      'match "contains" is a pattern, not one address',
      'status 410 is not one of 301/302/307/308',
      'status 303 is not one of 301/302/307/308',
      'from has a query string or fragment — a static redirect matches the path only',
      'from ends in a file name — the static build serves it as a directory, not at this address',
      'from contains [ or ], which Astro reads as a route parameter',
      'to is not a site-root path or an http(s) URL',
      'from is not a site-root path',
    ])
    expect(result.warnings).toContain('redirects: 10 of 10 rules not written to astro.config — set them up at the host (EmitResult.redirects.manual has each with its reason)')
  })

  it('keeps the page when a rule redirects an address the site builds, whichever route builds it', () => {
    const result = emit([
      { from: '/hello-world', to: '/elsewhere/' },
      { from: '/about/', to: '/company/' },
      { from: '/category/news/', to: '/news/' },
      // Matches the `/:slug` pattern but no entry: no page is built there.
      { from: '/no-such-post/', to: '/hello-world/' },
    ])
    expect(result.redirects?.manual.map((m) => m.reason)).toEqual([
      'the migrated site builds a page at /hello-world/ (route post) — the page is kept',
      'the migrated site builds a page at /about/ (route about) — the page is kept',
      'the migrated site builds a page at /category/news/ (route category) — the page is kept',
    ])
    expect(result.redirects?.written).toEqual([{ from: '/no-such-post/', to: '/hello-world/' }])
    expect(result.files['astro.config.mjs']).toContain(`"/no-such-post/": { status: 301, destination: "/hello-world/" },`)
    expect(result.files['src/pages/[slug].astro']).toBeDefined()
  })

  it('writes the first rule for an address and returns duplicates and self-redirects', () => {
    const result = emit([
      { from: '/old/', to: '/one/' },
      { from: '/old', to: '/two/' },
      { from: '/loop/', to: '/loop' },
    ])
    expect(Object.keys(planRedirects(result.redirects!.written, new Map()).config)).toEqual(['/old/'])
    expect(result.redirects?.manual.map((m) => [m.redirect.from, m.reason])).toEqual([
      ['/old', 'another rule already redirects /old/'],
      ['/loop/', 'to is the same address as from'],
    ])
  })

  it('without input.redirects there is no redirects block and no result field', () => {
    const result = emitAstroProject({ ir, content })
    expect(result.files['astro.config.mjs']).not.toContain('redirects')
    expect(result.redirects).toBeUndefined()
  })
})

describe('builtAddresses', () => {
  it('lists every page the routes build, and only those', () => {
    expect([...builtAddresses(ir.routes, content)]).toEqual([
      ['/hello-world/', 'post'],
      ['/about/', 'about'],
      ['/category/news/', 'category'],
    ])
  })
})

describe('astroRedirectsConfig', () => {
  it('is null when nothing is written', () => {
    expect(astroRedirectsConfig({})).toBeNull()
  })
})
