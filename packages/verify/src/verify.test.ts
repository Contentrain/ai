import { describe, it, expect } from 'vitest'
import type { VerifyDocument, VerifyInput } from './index'
import { verify, formatReport, CHECK_GROUPS } from './index'

const SITE = 'https://example.com'

/** A page that passes everything, so each test can break exactly one thing. */
function page(url: string, over: { head?: string, body?: string, status?: number, headers?: Record<string, string> } = {}): VerifyDocument {
  const canonical = `${SITE}${url === '/' ? '/' : url}`
  return {
    url,
    status: over.status ?? 200,
    headers: over.headers,
    html: `<html lang="en"><head>
<title>${url}</title>
<meta name="description" content="About ${url}">
<meta property="og:title" content="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${canonical}">
${over.head ?? ''}
</head><body>${over.body ?? '<p>content</p>'}</body></html>`,
  }
}

const findings = (input: VerifyInput, check: string) => verify(input).findings.filter(f => f.check === check)
const one = (input: VerifyInput, check: string) => {
  const found = findings(input, check)
  expect(found, check).toHaveLength(1)
  return found[0]!
}

describe('a clean site passes', () => {
  const input: VerifyInput = { site: SITE, documents: [page('/'), page('/about')] }

  it('reports nothing above info and passes the gate', () => {
    const report = verify(input)
    expect(report.counts.error).toBe(0)
    expect(report.counts.warning).toBe(0)
    expect(report.passed).toBe(true)
    expect(report.documents).toBe(2)
    expect(report.groups).toEqual([...CHECK_GROUPS])
  })

  it('says which checks did not run rather than passing silently', () => {
    // A green report over a run that compared nothing is the most dangerous
    // output this package can produce, so the absences are named.
    const report = verify(input)
    const reasons = report.skipped.map(s => s.reason)
    expect(reasons.some(r => r.includes('no baseline'))).toBe(true)
    expect(reasons.some(r => r.includes('no sitemap'))).toBe(true)
    expect(reasons.some(r => r.includes('no redirect rules'))).toBe(true)
  })

  it('runs only the groups it is asked for', () => {
    const report = verify({ ...input, groups: ['identity'] })
    expect(report.groups).toEqual(['identity'])
    expect(report.findings.every(f => f.group === 'identity')).toBe(true)
  })
})

describe('identity', () => {
  it('fails a page with no title', () => {
    const doc = page('/a')
    doc.html = doc.html.replace('<title>/a</title>', '')
    expect(one({ site: SITE, documents: [doc] }, 'identity.title-missing').severity).toBe('error')
  })

  it('fails two titles but not an svg label', () => {
    expect(findings({ site: SITE, documents: [page('/a', { head: '<title>Second</title>' })] }, 'identity.title-duplicate')).toHaveLength(1)
    expect(findings({ site: SITE, documents: [page('/a', { head: '<svg><title>Icon</title></svg>' })] }, 'identity.title-duplicate')).toEqual([])
  })

  /**
   * The failure this exists for: a clone carries the template page's canonical,
   * so every page canonicalises to one URL and the site removes itself from the
   * index. Worse than having no canonical at all, and invisible in a browser.
   */
  it('fails a canonical that points at another page', () => {
    const doc = page('/about')
    doc.html = doc.html.replace(
      `<link rel="canonical" href="${SITE}/about">`,
      `<link rel="canonical" href="${SITE}/template-post">`,
    )
    const found = one({ site: SITE, documents: [doc] }, 'identity.canonical-mismatch')
    expect(found.severity).toBe('error')
    expect(found.detail).toContain('/template-post')
  })

  it('accepts a canonical spelled with a trailing slash or index.html', () => {
    for (const spelling of [`${SITE}/about/`, `${SITE}/about/index.html`, '/about']) {
      const doc = page('/about')
      doc.html = doc.html.replace(`<link rel="canonical" href="${SITE}/about">`, `<link rel="canonical" href="${spelling}">`)
      expect(findings({ site: SITE, documents: [doc] }, 'identity.canonical-mismatch'), spelling).toEqual([])
    }
  })

  it('fails two canonicals', () => {
    expect(one({ site: SITE, documents: [page('/a', { head: `<link rel="canonical" href="${SITE}/b">` })] }, 'identity.canonical-duplicate').severity).toBe('error')
  })

  it('warns on a missing description and incomplete Open Graph', () => {
    const doc = page('/a')
    doc.html = doc.html.replace(/<meta name="description"[^>]*>/, '').replace(/<meta property="og:url"[^>]*>/, '')
    expect(one({ site: SITE, documents: [doc] }, 'identity.description-missing').severity).toBe('warning')
    expect(one({ site: SITE, documents: [doc] }, 'identity.open-graph-incomplete').message).toContain('og:url')
  })
})

describe('indexing', () => {
  it('fails a noindex left over from staging, from the meta or the header', () => {
    expect(one({ site: SITE, documents: [page('/a', { head: '<meta name="robots" content="noindex, nofollow">' })] }, 'indexing.noindex').severity).toBe('error')
    expect(one({ site: SITE, documents: [page('/a', { headers: { 'x-robots-tag': 'noindex' } })] }, 'indexing.noindex').severity).toBe('error')
  })

  it('leaves an indexable page alone', () => {
    expect(findings({ site: SITE, documents: [page('/a', { head: '<meta name="robots" content="index, follow">' })] }, 'indexing.noindex')).toEqual([])
  })

  it('warns when an indexable page is not in the sitemap', () => {
    const input: VerifyInput = {
      site: SITE,
      documents: [page('/'), page('/about')],
      sitemap: `<urlset><url><loc>${SITE}/</loc></url></urlset>`,
    }
    expect(one(input, 'indexing.sitemap-missing-entry').url).toBe('/about')
  })

  it('does not ask a noindex page to be in the sitemap', () => {
    const input: VerifyInput = {
      site: SITE,
      documents: [page('/a', { head: '<meta name="robots" content="noindex">' })],
      sitemap: '<urlset></urlset>',
    }
    expect(findings(input, 'indexing.sitemap-missing-entry')).toEqual([])
  })

  it('warns when the sitemap lists a page the build does not serve', () => {
    const input: VerifyInput = {
      site: SITE,
      documents: [page('/')],
      sitemap: `<urlset><url><loc>${SITE}/</loc></url><url><loc>${SITE}/gone</loc></url></urlset>`,
    }
    expect(one(input, 'indexing.sitemap-stale-entry').url).toBe(`${SITE}/gone`)
  })
})

describe('status', () => {
  it('fails a page whose status changed against the baseline', () => {
    const input: VerifyInput = {
      site: SITE,
      documents: [page('/a', { status: 404 })],
      baseline: { documents: [page('/a', { status: 200 })] },
    }
    expect(one(input, 'status.mismatch').message).toContain('200 → 404')
  })

  /** A "not found" page answering 200 is invisible to every status monitor. */
  it('fails a soft 404', () => {
    const input: VerifyInput = { site: SITE, documents: [page('/gone', { body: '<h1>404 — Page not found</h1>' })] }
    expect(one(input, 'status.soft-404').severity).toBe('error')
  })

  it('does not call a long article about the 404 status code a soft 404', () => {
    const body = `<h1>What a 404 means</h1><p>${'Some real prose about HTTP status codes. '.repeat(40)}</p>`
    expect(findings({ site: SITE, documents: [page('/blog/404-explained', { body })] }, 'status.soft-404')).toEqual([])
  })

  it('warns on a redirect chain and fails a loop', () => {
    const chain: VerifyInput = {
      site: SITE,
      documents: [page('/c')],
      redirects: [{ from: '/a', to: '/b', status: 301 }, { from: '/b', to: '/c', status: 301 }],
    }
    expect(one(chain, 'status.redirect-chain').message).toContain('2 hops')

    const loop: VerifyInput = {
      site: SITE,
      documents: [page('/')],
      redirects: [{ from: '/a', to: '/b', status: 301 }, { from: '/b', to: '/a', status: 301 }],
    }
    expect(verify(loop).findings.filter(f => f.check === 'status.redirect-loop').length).toBeGreaterThan(0)
  })

  it('fails a redirect that points at nothing', () => {
    const input: VerifyInput = { site: SITE, documents: [page('/')], redirects: [{ from: '/old', to: '/new', status: 301 }] }
    expect(one(input, 'status.redirect-target-missing').detail).toBe('/new')
  })

  it('accepts a redirect that leaves the site', () => {
    const input: VerifyInput = { site: SITE, documents: [page('/')], redirects: [{ from: '/old', to: 'https://elsewhere.example/x', status: 301 }] }
    expect(findings(input, 'status.redirect-target-missing')).toEqual([])
  })
})

const alt = (href: string, lang: string) => `<link rel="alternate" hreflang="${lang}" href="${href}">`

describe('international', () => {

  it('accepts a reciprocal pair that lists itself', () => {
    const en = page('/a', { head: alt('/a', 'en') + alt('/tr/a', 'tr') })
    const tr = page('/tr/a', { head: alt('/a', 'en') + alt('/tr/a', 'tr') })
    const report = verify({ site: SITE, documents: [en, tr] })
    expect(report.findings.filter(f => f.group === 'international')).toEqual([])
  })

  /** Search engines ignore one-sided alternates entirely — half is nothing. */
  it('fails a one-sided declaration', () => {
    const en = page('/a', { head: alt('/a', 'en') + alt('/tr/a', 'tr') })
    const tr = page('/tr/a')
    expect(one({ site: SITE, documents: [en, tr] }, 'international.hreflang-not-reciprocal').url).toBe('/a')
  })

  it('warns when a page does not list itself', () => {
    const en = page('/a', { head: alt('/tr/a', 'tr') })
    const tr = page('/tr/a', { head: alt('/a', 'en') + alt('/tr/a', 'tr') })
    expect(one({ site: SITE, documents: [en, tr] }, 'international.hreflang-no-self').url).toBe('/a')
  })

  it('warns when an alternate points at a page that does not exist', () => {
    const en = page('/a', { head: alt('/a', 'en') + alt('/de/a', 'de') })
    expect(one({ site: SITE, documents: [en] }, 'international.hreflang-unknown-target').detail).toBe('/de/a')
  })
})

describe('structured data', () => {
  it('fails a block that does not parse', () => {
    const doc = page('/a', { body: '<script type="application/ld+json">{"@type": }</script>' })
    expect(one({ site: SITE, documents: [doc] }, 'structured.jsonld-invalid').severity).toBe('error')
  })

  it('warns when a type the old page had is gone', () => {
    const before = page('/a', { body: '<script type="application/ld+json">{"@graph":[{"@type":"Article"},{"@type":"Organization"}]}</script>' })
    const after = page('/a', { body: '<script type="application/ld+json">{"@type":"Organization"}</script>' })
    const found = one({ site: SITE, documents: [after], baseline: { documents: [before] } }, 'structured.type-lost')
    expect(found.message).toContain('Article')
    expect(found.message).not.toContain('Organization')
  })
})

describe('navigation', () => {
  it('fails a link to a page the build does not serve', () => {
    const doc = page('/a', { body: '<a href="/missing">gone</a><a href="/b">fine</a>' })
    const found = one({ site: SITE, documents: [doc, page('/b')] }, 'navigation.broken-internal-link')
    expect(found.detail).toBe('/missing')
  })

  it('accepts a link that a redirect rule covers', () => {
    const doc = page('/a', { body: '<a href="/old">moved</a>' })
    const input: VerifyInput = { site: SITE, documents: [doc], redirects: [{ from: '/old', to: '/a', status: 301 }] }
    expect(findings(input, 'navigation.broken-internal-link')).toEqual([])
  })

  it('ignores external, mail, tel and fragment links', () => {
    const body = '<a href="https://elsewhere.example/x">x</a><a href="mailto:a@b.c">m</a><a href="tel:+1">t</a><a href="#top">f</a>'
    expect(findings({ site: SITE, documents: [page('/a', { body })] }, 'navigation.broken-internal-link')).toEqual([])
  })

  it('reports one finding per distinct broken href, not per occurrence', () => {
    const doc = page('/a', { body: '<a href="/missing">1</a><a href="/missing">2</a><a href="/missing">3</a>' })
    expect(findings({ site: SITE, documents: [doc] }, 'navigation.broken-internal-link')).toHaveLength(1)
  })

  it('warns on pagination pointing nowhere and on a lost feed', () => {
    const paged = page('/page/1', { head: '<link rel="next" href="/page/2">' })
    expect(one({ site: SITE, documents: [paged] }, 'navigation.pagination-broken').detail).toBe('/page/2')

    const before = page('/a', { head: '<link rel="alternate" type="application/rss+xml" href="/feed">' })
    expect(one({ site: SITE, documents: [page('/a')], baseline: { documents: [before] } }, 'navigation.feed-lost').severity).toBe('warning')
  })
})

describe('assets', () => {
  it('fails an image that resolves to nothing the build serves', () => {
    const doc = page('/a', { body: '<img src="/img/missing.png" alt="x"><img src="/img/there.png" alt="y">' })
    const input: VerifyInput = { site: SITE, documents: [doc], assets: ['/img/there.png'] }
    expect(one(input, 'assets.broken-image').detail).toBe('/img/missing.png')
  })

  it('ignores data URIs and images hosted elsewhere', () => {
    const body = '<img src="data:image/gif;base64,R0lGOD" alt="x"><img src="https://cdn.example.net/a.png" alt="y">'
    expect(findings({ site: SITE, documents: [page('/a', { body })] }, 'assets.broken-image')).toEqual([])
  })

  it('warns on a missing alt attribute but not on an empty one', () => {
    const input = (body: string): VerifyInput => ({ site: SITE, documents: [page('/a', { body })], assets: ['/i.png'] })
    expect(one(input('<img src="/i.png">'), 'assets.missing-alt').message).toContain('1 image')
    expect(findings(input('<img src="/i.png" alt="">'), 'assets.missing-alt')).toEqual([])
  })

  it('warns when alt text the old page had is gone', () => {
    const before = page('/a', { body: '<img src="/i.png" alt="A goat on a roof">' })
    const after = page('/a', { body: '<img src="/i.png" alt="">' })
    const input: VerifyInput = { site: SITE, documents: [after], baseline: { documents: [before] }, assets: ['/i.png'] }
    expect(one(input, 'assets.alt-lost').detail).toBe('/i.png')
  })
})

describe('the 404 page', () => {
  const notFound = (url: string) => ({
    ...page(url),
    html: page(url).html.replace('<p>content</p>', '<h1>404 \u2014 Page not found</h1>'),
  })

  /**
   * A static host hands this document to a visitor who asked for something
   * else. Every check that assumes "served at this URL" is wrong about it —
   * and the soft-404 check would fail every site that has a correct 404 page,
   * because saying "not found" briefly is exactly what one does.
   */
  it('is not a soft 404', () => {
    const input: VerifyInput = { site: SITE, documents: [notFound('/404.html')] }
    expect(findings(input, 'status.soft-404')).toEqual([])
    // The same body at a real address still is one.
    expect(findings({ site: SITE, documents: [notFound('/gone')] }, 'status.soft-404')).toHaveLength(1)
  })

  it('is not asked for a canonical or a sitemap entry', () => {
    const doc = notFound('/404.html')
    doc.html = doc.html.replace(/<link rel="canonical"[^>]*>/, '')
    const input: VerifyInput = { site: SITE, documents: [doc], sitemap: '<urlset></urlset>' }
    expect(findings(input, 'identity.canonical-missing')).toEqual([])
    expect(findings(input, 'indexing.sitemap-missing-entry')).toEqual([])
  })

  it('is recognised at either spelling a build produces', () => {
    for (const url of ['/404.html', '/404/index.html']) {
      expect(findings({ site: SITE, documents: [notFound(url)] }, 'status.soft-404'), url).toEqual([])
    }
  })
})

describe('a build with no 404 page', () => {
  it('is an error, because a wrong path then lands on the host page', () => {
    const input: VerifyInput = { site: SITE, build: true, documents: [page('/')] }
    expect(one(input, 'status.not-found-page-missing').severity).toBe('error')
  })

  it('passes once the build carries one', () => {
    const input: VerifyInput = { site: SITE, build: true, documents: [page('/'), page('/404.html')] }
    expect(findings(input, 'status.not-found-page-missing')).toEqual([])
  })

  /** A set of pages captured from a running site cannot show a 404.html. */
  it('is not asserted against a capture', () => {
    expect(findings({ site: SITE, documents: [page('/')] }, 'status.not-found-page-missing')).toEqual([])
    expect(verify({ site: SITE, documents: [page('/')] }).skipped.some(s => s.reason.includes('404'))).toBe(true)
  })
})

describe('references to the site the content came from', () => {
  const body = '<img src="https://old.example/wp-content/a.png"><a href="https://old.example/about">x</a>'

  it('is an error: the new site depends on the old one staying up', () => {
    const input: VerifyInput = {
      site: SITE,
      documents: [page('/a', { body })],
      options: { sourceOrigin: 'https://old.example' },
    }
    const found = one(input, 'assets.source-origin-reference')
    expect(found.severity).toBe('error')
    expect(found.message).toContain('2 references')
  })

  it('accepts the host as a bare name too', () => {
    const input: VerifyInput = { site: SITE, documents: [page('/a', { body })], options: { sourceOrigin: 'old.example' } }
    expect(findings(input, 'assets.source-origin-reference')).toHaveLength(1)
  })

  it('scans stylesheets and scripts when their contents are given', () => {
    const input: VerifyInput = {
      site: SITE,
      documents: [page('/a')],
      files: [{ path: '/a.css', content: '.h{background:url(https://old.example/bg.png)}' }],
      options: { sourceOrigin: 'old.example' },
    }
    expect(one(input, 'assets.source-origin-reference').url).toBe('/a.css')
  })

  it('says so when it only saw the HTML', () => {
    const report = verify({ site: SITE, documents: [page('/a')], options: { sourceOrigin: 'old.example' } })
    expect(report.skipped.some(s => s.reason.includes('HTML only'))).toBe(true)
  })

  it('allows a host the project kept on purpose', () => {
    const input: VerifyInput = {
      site: SITE,
      documents: [page('/a', { body })],
      options: { sourceOrigin: 'old.example', allowHosts: ['old.example'] },
    }
    expect(findings(input, 'assets.source-origin-reference')).toEqual([])
  })

  it('does not run without a source origin, and says so', () => {
    const report = verify({ site: SITE, documents: [page('/a', { body })] })
    expect(report.findings.filter(f => f.check === 'assets.source-origin-reference')).toEqual([])
    expect(report.skipped.some(s => s.reason.includes('no sourceOrigin'))).toBe(true)
  })

  it('reports rather than throws on an origin it cannot read', () => {
    const report = verify({ site: SITE, documents: [page('/a')], options: { sourceOrigin: 'not a host' } })
    expect(report.findings.some(f => f.check === 'assets.source-origin-invalid')).toBe(true)
  })
})

describe('html lang', () => {
  it('warns when the page does not declare one', () => {
    const doc = page('/a')
    doc.html = doc.html.replace('<html lang="en">', '<html>')
    expect(one({ site: SITE, documents: [doc] }, 'identity.lang-missing').severity).toBe('warning')
  })

  it('accepts a region subtag and single quotes', () => {
    for (const tag of ['lang="tr-TR"', "lang='de'"]) {
      const doc = page('/a')
      doc.html = doc.html.replace('<html lang="en">', `<html ${tag}>`)
      expect(findings({ site: SITE, documents: [doc] }, 'identity.lang-missing'), tag).toEqual([])
    }
  })
})

describe('working without a site origin', () => {
  it('still resolves relative links and finds the broken one', () => {
    const doc = page('/a', { body: '<a href="/missing">x</a>' })
    const report = verify({ documents: [doc] })
    expect(report.findings.some(f => f.check === 'navigation.broken-internal-link')).toBe(true)
  })
})

describe('formatReport', () => {
  it('puts errors first and ends with the verdict', () => {
    const doc = page('/a', { body: '<a href="/missing">x</a><img src="/i.png">' })
    const text = formatReport(verify({ site: SITE, documents: [doc] }))
    expect(text.indexOf('ERROR')).toBeLessThan(text.indexOf('WARNING'))
    expect(text).toContain('navigation.broken-internal-link')
    expect(text.trimEnd().endsWith('FAIL')).toBe(true)
    expect(formatReport(verify({ site: SITE, documents: [page('/a')] })).trimEnd().endsWith('PASS')).toBe(true)
  })
})
