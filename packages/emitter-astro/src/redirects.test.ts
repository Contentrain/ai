import { describe, it, expect } from 'vitest'
import type { ProjectIR, RawRedirect } from '@contentrain/types'
import { MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject } from './index'
import { astroRedirectsConfig, builtAddresses, hostRedirectFiles, planRedirects } from './redirects'

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

const emit = (redirects: RawRedirect[], redirectHost?: 'netlify' | 'cloudflare' | 'vercel') =>
  // The feed's own /feed/ redirect is feed.test.ts's subject; these hold the source's rules alone.
  emitAstroProject({ ir, content, redirects, options: { feed: false, ...(redirectHost ? { redirectHost } : {}) } })

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
    expect(result.redirects?.host_files).toEqual(['public/_redirects (netlify)', 'vercel.json (vercel)'])
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
    expect(result.files['public/_redirects']).toBeUndefined()
    expect(result.files['vercel.json']).toBeUndefined()
    expect(result.redirects?.host_files).toEqual([])
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
    const result = emitAstroProject({ ir, content, options: { feed: false } })
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

describe('host redirect files — real HTTP status, the meta-refresh pages stay as fallback', () => {
  const rules: RawRedirect[] = [
    { from: '/eski-yazi/', to: '/hello-world/' },
    { from: '/%C3%A7ay', to: 'https://other.example.org/tea', status: 308 },
  ]

  it('without a host: forced Netlify rules and vercel.json, each path with and without its slash, percent-encoded', () => {
    const { files, redirects } = emit(rules)
    expect(files['public/_redirects']).toBe([
      "# Emitted by @contentrain/emitter-astro — the source site's redirects, as real HTTP redirects.",
      '/eski-yazi /hello-world/ 301!',
      '/eski-yazi/ /hello-world/ 301!',
      '/%C3%A7ay https://other.example.org/tea 308!',
      '/%C3%A7ay/ https://other.example.org/tea 308!',
      '',
    ].join('\n'))
    expect(JSON.parse(files['vercel.json']!)).toEqual({ redirects: [
      { source: '/eski-yazi', destination: '/hello-world/', statusCode: 301 },
      { source: '/eski-yazi/', destination: '/hello-world/', statusCode: 301 },
      { source: '/%C3%A7ay', destination: 'https://other.example.org/tea', statusCode: 308 },
      { source: '/%C3%A7ay/', destination: 'https://other.example.org/tea', statusCode: 308 },
    ] })
    // The fallback is still there for any other host.
    expect(files['astro.config.mjs']).toContain(`"/eski-yazi/": { status: 301, destination: "/hello-world/" },`)
    expect(redirects?.host_files).toEqual(['public/_redirects (netlify)', 'vercel.json (vercel)'])
  })

  it('a named host gets only its own file; Cloudflare rules are not forced', () => {
    const cloudflare = emit(rules, 'cloudflare')
    expect(cloudflare.files['public/_redirects']).toContain('/eski-yazi/ /hello-world/ 301\n')
    expect(cloudflare.files['public/_redirects']).not.toContain('!')
    expect(cloudflare.files['vercel.json']).toBeUndefined()
    expect(cloudflare.redirects?.host_files).toEqual(['public/_redirects (cloudflare)'])

    const vercel = emit(rules, 'vercel')
    expect(vercel.files['public/_redirects']).toBeUndefined()
    expect(vercel.redirects?.host_files).toEqual(['vercel.json (vercel)'])

    const netlify = emit(rules, 'netlify')
    expect(netlify.files['vercel.json']).toBeUndefined()
    expect(netlify.files['public/_redirects']).toContain('301!')
  })

  it('leaves a path the host would read as a pattern to the fallback, and says so', () => {
    const out = hostRedirectFiles({
      '/tag/:old/': { status: 301, destination: '/x/' },
      '/a*b/': { status: 301, destination: '/y/' },
      '/v1:beta/': { status: 302, destination: '/z/' },
    })
    expect(out.skipped).toEqual(['/tag/:old/', '/a*b/'])
    expect(out.files['public/_redirects']).toContain('/v1:beta/ /z/ 302!')
    // path-to-regexp would read an unescaped ":" as a parameter.
    expect(JSON.parse(out.files['vercel.json']!).redirects[0].source).toBe('/v1\\:beta')
    const result = emit([{ from: '/tag/:old/', to: '/x/' }])
    expect(result.warnings).toContain('redirects: 1 rules contain ":" or "*", which host redirect files read as patterns — served by the meta-refresh fallback only: /tag/:old/')
    expect(result.files['public/_redirects']).toBeUndefined()
  })

  it('stops the Cloudflare and Vercel files at their rule limit and reports the rest; Netlify takes all', () => {
    const many = Array.from({ length: 1002 }, (_, i) => ({ from: `/old-${String(i).padStart(4, '0')}/`, to: '/hello-world/' }))
    const result = emit(many)
    expect(JSON.parse(result.files['vercel.json']!).redirects).toHaveLength(2000)
    expect(result.files['public/_redirects']!.trim().split('\n')).toHaveLength(1 + 2004)
    expect(result.redirects?.host_over_limit).toEqual(['/old-1000/', '/old-1001/'])
    expect(result.warnings.some((w) => w.startsWith('redirects: 2 rules not written to vercel.json (vercel) — 1000 rules'))).toBe(true)
    const cloudflare = emit(many, 'cloudflare')
    expect(cloudflare.files['public/_redirects']!.trim().split('\n')).toHaveLength(1 + 2000)
    expect(emit(many, 'netlify').redirects?.host_over_limit).toEqual([])
    expect(emit(many.slice(0, 1000)).redirects?.host_over_limit).toEqual([])
  })
})

describe('letter case', () => {
  it('returns a rule that differs from a built page only in case, so no host serves it over the page', () => {
    const result = emit([{ from: '/About/', to: '/about/' }, { from: '/Hello-World', to: '/hello-world/' }, { from: '/Old/', to: '/about/' }])
    expect(result.redirects?.manual.map((m) => m.reason)).toEqual([
      'from differs only in letter case from the page at /about/ (route about) — a case-insensitive host or file system would serve the redirect over it; the page is kept',
      'from differs only in letter case from the page at /hello-world/ (route post) — a case-insensitive host or file system would serve the redirect over it; the page is kept',
    ])
    expect(result.files['public/_redirects']).not.toContain('/About')
    expect(result.files['public/_redirects']).toContain('/Old/ /about/ 301!')
  })
})


describe('hostRedirects — host files only, no meta-refresh page', () => {
  const emitHost = (hostRedirects: RawRedirect[], redirects?: RawRedirect[], options: Record<string, unknown> = {}) =>
    emitAstroProject({ ir, content, ...(redirects ? { redirects } : {}), hostRedirects, options: { feed: false, ...options } })

  it('writes the rule to _redirects and vercel.json but not to astro.config, so the build makes no page for it', () => {
    const out = emitHost([{ from: '/hello-world/photo/', to: '/hello-world/', status: 301 }])
    expect(out.files['public/_redirects']).toContain('/hello-world/photo/ /hello-world/ 301!\n')
    expect(JSON.parse(out.files['vercel.json']!).redirects).toContainEqual({ source: '/hello-world/photo/', destination: '/hello-world/', statusCode: 301 })
    expect(out.files['astro.config.mjs']).not.toContain('redirects:')
    expect(out.redirects?.written.map((r) => r.from)).toEqual(['/hello-world/photo/'])
    expect(out.redirects?.manual).toEqual([])
  })

  it('beside the site\'s own rules: those go to astro.config too, the host-only ones only to the host files', () => {
    const out = emitHost([{ from: '/photo/', to: '/hello-world/' }], [{ from: '/eski/', to: '/hello-world/' }])
    expect(out.files['astro.config.mjs']).toContain('"/eski/"')
    expect(out.files['astro.config.mjs']).not.toContain('"/photo/"')
    const lines = out.files['public/_redirects']!.split('\n')
    // The site's own rules first: past a host limit, host-only rules are the ones left out.
    expect(lines.indexOf('/eski/ /hello-world/ 301!')).toBeLessThan(lines.indexOf('/photo/ /hello-world/ 301!'))
  })

  it('the same checks as redirects: a built page, a query string and a pattern come back as manual', () => {
    const out = emitHost([
      { from: '/about/', to: '/hello-world/' },
      { from: '/?attachment_id=5', to: '/hello-world/' },
      { from: '/x/', to: '/y/', match: 'start' },
    ])
    expect(out.redirects?.written).toEqual([])
    expect(out.redirects?.manual.map((m) => m.redirect.from)).toEqual(['/about/', '/?attachment_id=5', '/x/'])
    expect(out.files['public/_redirects']).toBeUndefined()
    expect(out.warnings).toContain('hostRedirects: 3 of 3 host-only rules not written — set them up at the host (EmitResult.redirects.manual has each with its reason)')
  })

  it('a from naming a file is fine in a host file (it matches the address itself), not in astro.config', () => {
    const host = emitHost([{ from: '/old-page.php', to: '/hello-world/' }])
    expect(host.redirects?.manual).toEqual([])
    expect(host.files['public/_redirects']).toContain('/old-page.php /hello-world/ 301!')
    const page = emitAstroProject({ ir, content, redirects: [{ from: '/old-page.php', to: '/hello-world/' }], options: { feed: false } })
    expect(page.redirects?.manual[0]?.reason).toMatch(/^from ends in a file name/)
  })

  it('never over a file the build writes: the host file answers before the filesystem', () => {
    // Both slash forms reach the host file, and Netlify matches case-insensitively.
    const files = ['/feed.xml', '/category/news/feed.xml', '/llms.txt', '/robots.txt', '/robots.txt/', '/Feed.xml', '/404.html', '/sitemap-index.xml', '/sitemap-0.xml', '/_astro/x.js', '/styles/legacy/s.css']
    const out = emitHost(files.map((from) => ({ from, to: '/hello-world/' })))
    expect(out.redirects?.written).toEqual([])
    expect(out.redirects?.manual.map((m) => m.reason)).toEqual(files.map(() => 'from is a file the build writes — the host file would serve the redirect over it'))
    expect(out.files['public/_redirects']).toBeUndefined()
  })

  it('WordPress\'s own sitemap and a producer\'s /assets/ are not the build\'s files: those rules are written', () => {
    const out = emitHost([{ from: '/sitemap.xml', to: '/sitemap-index.xml' }, { from: '/sitemap_index.xml', to: '/sitemap-index.xml' }, { from: '/assets/old.jpg', to: '/hello-world/' }])
    expect(out.redirects?.manual).toEqual([])
    expect(out.files['public/_redirects']).toContain('/sitemap.xml /sitemap-index.xml 301!')
  })

  it('an address the site\'s own rules or the feed already redirect is theirs', () => {
    const out = emitAstroProject({
      ir, content,
      redirects: [{ from: '/eski/', to: '/about/' }],
      hostRedirects: [{ from: '/eski/', to: '/hello-world/' }, { from: '/feed/', to: '/hello-world/' }],
    })
    expect(out.files['public/_redirects']).toContain('/eski/ /about/ 301!')
    expect(out.files['public/_redirects']).not.toContain('/eski/ /hello-world/')
    expect(out.redirects?.manual.map((m) => [m.redirect.from, m.reason])).toEqual([
      ['/eski/', 'another rule already redirects /eski/'],
      ['/feed/', 'another rule already redirects /feed/'],
    ])
  })

  it('a rule the host file reads as a pattern has no fallback, so it is manual, not a meta-refresh warning', () => {
    const out = emitHost([{ from: '/tag/:old/', to: '/x/' }])
    expect(out.redirects?.manual.map((m) => m.reason)).toEqual(['from contains ":" or "*", which host redirect files read as a pattern'])
    expect(out.warnings.some((w) => w.includes('served by the meta-refresh fallback only'))).toBe(false)
  })

  const own = Array.from({ length: 999 }, (_, i) => ({ from: `/old-${String(i).padStart(4, '0')}/`, to: '/hello-world/' }))
  const bulk = Array.from({ length: 3 }, (_, i) => ({ from: `/att-${i}/`, to: '/hello-world/' }))

  it('past a named host\'s limit host-only rules go last and to manual: nothing serves them there', () => {
    for (const host of ['vercel', 'cloudflare'] as const) {
      const out = emitHost(bulk, own, { redirectHost: host })
      expect(out.redirects?.written.map((r) => r.from)).toContain('/att-0/')
      expect(out.redirects?.written.map((r) => r.from)).not.toContain('/att-1/')
      expect(out.redirects?.manual.map((m) => m.redirect.from)).toEqual(['/att-1/', '/att-2/'])
      expect(out.redirects?.manual[0]!.reason).toMatch(/^left out of .* at its rule limit \(1000 rules\) — a host-only rule has no meta-refresh page/)
      expect(out.redirects?.host_over_limit).toEqual([])
      expect(out.warnings.some((w) => w.startsWith('redirects: '))).toBe(false)
    }
    expect(emitHost(bulk, own, { redirectHost: 'netlify' }).redirects?.manual).toEqual([])
  })

  it('with no host named the Netlify file holds them: written, named in host_over_limit, not manual', () => {
    const out = emitHost(bulk, own)
    expect(out.files['public/_redirects']).toContain('/att-2/ /hello-world/ 301!')
    expect(out.redirects?.written.map((r) => r.from)).toEqual(expect.arrayContaining(['/att-0/', '/att-1/', '/att-2/']))
    expect(out.redirects?.manual).toEqual([])
    expect(out.redirects?.host_over_limit).toEqual(['/att-1/', '/att-2/'])
    expect(out.warnings).toContain('hostRedirects: 2 host-only rules not written to vercel.json at its rule limit (1000 rules) — public/_redirects (Netlify) has them; on Vercel they are not served. Name the host (options.redirectHost) to have them reported as manual')
    expect(out.warnings.some((w) => w.startsWith('redirects: '))).toBe(false)
  })
})
