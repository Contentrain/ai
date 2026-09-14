import { describe, it, expect } from 'vitest'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitInput } from './index'
import { bodySeoLeaks, emitAstroProject, stripSeoTags } from './index'
import { robotsTxt } from './scaffold'

// A migrated page used to inherit the template page's head verbatim: every post
// carried one canonical, one og:title and one Article JSON-LD naming a different
// post. These tests hold both halves of the fix — the template's tags leave the
// head, and the emitter renders per-page ones from the entry.

const THEME_HEAD = [
  '<meta charset="utf-8" />',
  '<link rel="preconnect" href="https://fonts.example" />',
  '<title>Template Post – Example</title>',
  '<meta name="description" content="The template post excerpt." />',
  '<link rel="canonical" href="https://example.com/template-post/" />',
  '<meta property="og:title" content="Template Post" />',
  '<meta content="https://example.com/template-post/" property="og:url" />',
  '<meta name="twitter:card" content="summary" />',
  '<link rel="alternate" type="application/rss+xml" href="/feed/" />',
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Template Post"}</script>',
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example"}</script>',
].join('\n')

const ir: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', title: 'Example Site', locales: ['en'] },
  routes: [
    { id: 'r-single', pattern: '/:slug', kind: 'single', family: 'f-single' },
    { id: 'r-archive', pattern: '/news', kind: 'archive', family: 'f-single', query: 'q-news' },
    { id: 'r-about', pattern: '/about', kind: 'page', family: 'f-single', title: 'About us' },
  ],
  families: [
    {
      id: 'f-single',
      kind: 'single',
      chrome: [
        { id: 'head', position: 'head', html: THEME_HEAD },
        { id: 'body', position: 'body', html: `<main>${CHROME_BODY_SLOT}</main>` },
      ],
      css: { strategy: 'localcss' },
    },
  ],
  queries: [{ id: 'q-news', source: 'posts', order: { by: 'date', direction: 'desc' }, per_page: 10, pagination: 'numbered' }],
  css_default: 'purge_set',
}

const input: EmitInput = {
  ir,
  content: {
    posts: [{
      slug: 'hello',
      title: 'Hello',
      body: '<p>Hi</p>',
      excerpt: 'An <b>excerpt</b> with markup.',
      featured: ['hero.jpg', '/media/hero-large.jpg'],
      author: 'Ada Lovelace',
      published_at: '2026-01-01T10:00:00.000Z',
      modified_at: '2026-02-01T10:00:00.000Z',
    }],
    queries: { 'q-news': [{ params: {}, items: [], item_template: '<li>@@title@@</li>', description: 'Latest news' }] },
  },
}

describe('stripSeoTags', () => {
  const { html, removed } = stripSeoTags(THEME_HEAD)

  it('removes the tags the emitter renders per page', () => {
    expect(html).not.toContain('<title>')
    expect(html).not.toContain('name="description"')
    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('og:title')
    expect(html).not.toContain('og:url')
    expect(html).not.toContain('twitter:card')
  })

  it('keeps everything else the theme put in the head', () => {
    expect(html).toContain('<meta charset="utf-8" />')
    expect(html).toContain('rel="preconnect"')
    expect(html).toContain('application/rss+xml')
  })

  it('removes page-scoped structured data and keeps site-wide structured data', () => {
    expect(html).not.toContain('"Article"')
    expect(html).toContain('"Organization"')
  })

  it('names what it removed instead of removing silently', () => {
    expect(removed).toContain('<title>')
    expect(removed).toContain('description')
    expect(removed).toContain('canonical')
    expect(removed).toContain('og:*')
    expect(removed).toContain('twitter:*')
    expect(removed).toContain('page-scoped JSON-LD')
  })

  it('does not depend on attribute order or quoting', () => {
    const out = stripSeoTags(`<meta content='x' property='og:description'><meta property=og:image content=y>`)
    expect(out.html.trim()).toBe('<meta property=og:image content=y>')
    expect(out.removed).toEqual(['og:*'])
  })

  it('leaves JSON-LD it cannot parse rather than guessing', () => {
    const broken = '<script type="application/ld+json">{ not json </script>'
    expect(stripSeoTags(broken).html).toBe(broken)
    expect(stripSeoTags(broken).removed).toEqual([])
  })

  it('reads @graph and @type arrays', () => {
    const graph = '<script type="application/ld+json">{"@graph":[{"@type":["Article","CreativeWork"]},{"@type":"ImageObject"}]}</script>'
    expect(stripSeoTags(graph).html).toBe('')
    const siteOnly = '<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Organization"}]}</script>'
    expect(stripSeoTags(siteOnly)).toEqual({ html: siteOnly, removed: [], kept: [] })
  })

  it('treats every page and article subtype, and a breadcrumb trail, as page-scoped', () => {
    // A breadcrumb names the template page's position; an archive template's
    // CollectionPage names the template archive. Both are wrong everywhere else.
    for (const type of ['CollectionPage', 'ProfilePage', 'FAQPage', 'NewsArticle', 'BlogPosting', 'BreadcrumbList']) {
      const block = `<script type="application/ld+json">{"@type":"${type}","name":"x"}</script>`
      expect(stripSeoTags(block).html, type).toBe('')
    }
    const person = '<script type="application/ld+json">{"@type":"Person","name":"Ada"}</script>'
    expect(stripSeoTags(person).html).toBe(person)
  })

  it('is a no-op on a head with none of these tags', () => {
    const plain = '<meta charset="utf-8" /><link rel="icon" href="/favicon.ico" />'
    expect(stripSeoTags(plain)).toEqual({ html: plain, removed: [], kept: [] })
  })
})

/**
 * An SEO plugin writes the site's identity into the same @graph as the page's
 * own nodes. Removing page-scoped blocks whole took WebSite and Organization
 * with them, so a migrated site lost the structured data that says who it is.
 */
describe('a mixed @graph from an SEO plugin', () => {
  // Shape of a Yoast SEO single-post head, trimmed.
  const yoast = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', '@id': 'https://example.com/template-post/#article', headline: 'Template Post', author: { '@id': 'https://example.com/#/schema/person/ada' }, publisher: { '@id': 'https://example.com/#organization' } },
      { '@type': 'WebPage', '@id': 'https://example.com/template-post/', url: 'https://example.com/template-post/', breadcrumb: { '@id': 'https://example.com/template-post/#breadcrumb' }, primaryImageOfPage: { '@id': 'https://example.com/template-post/#primaryimage' } },
      { '@type': 'ImageObject', '@id': 'https://example.com/template-post/#primaryimage', url: 'https://example.com/hero.jpg' },
      { '@type': 'BreadcrumbList', '@id': 'https://example.com/template-post/#breadcrumb', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home' }] },
      { '@type': 'WebSite', '@id': 'https://example.com/#website', url: 'https://example.com/', name: 'Example </script> Site', publisher: { '@id': 'https://example.com/#organization' }, potentialAction: [{ '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: 'https://example.com/?s={search_term_string}' }, 'query-input': 'required name=search_term_string' }], inLanguage: 'en-US' },
      { '@type': 'Organization', '@id': 'https://example.com/#organization', name: 'Example', url: 'https://example.com/', logo: { '@id': 'https://example.com/#/schema/logo/image/' }, sameAs: ['https://social.example/example'] },
      { '@type': 'ImageObject', '@id': 'https://example.com/#/schema/logo/image/', url: 'https://example.com/logo.png' },
      { '@type': 'Person', '@id': 'https://example.com/#/schema/person/ada', name: 'Ada' },
    ],
  // escaped as a real head carries it: a raw </script> would end the element
  }).replace(/</g, '\\u003c')
  const head = `<meta charset="utf-8" />\n<script type="application/ld+json" class="yoast-schema-graph">${yoast}</script>\n<link rel="icon" href="/favicon.ico" />`
  const out = stripSeoTags(head)
  const block = /<script type="application\/ld\+json" class="yoast-schema-graph">([\s\S]*?)<\/script>/.exec(out.html)
  const graph = JSON.parse(block![1]!) as { '@context': string, '@graph': Array<Record<string, unknown>> }

  it('keeps WebSite and Organization, and what they refer to, in the same script element', () => {
    expect(graph['@context']).toBe('https://schema.org')
    expect(graph['@graph'].map((n) => n['@type'])).toEqual(['WebSite', 'Organization', 'ImageObject'])
    const org = graph['@graph'][1]!
    expect(org.sameAs).toEqual(['https://social.example/example'])
    // the logo the Organization points at comes along; the page's hero image does not
    expect(graph['@graph'][2]!.url).toBe('https://example.com/logo.png')
    expect(out.html).toContain('<meta charset="utf-8" />')
    expect(out.html).toContain('<link rel="icon" href="/favicon.ico" />')
  })

  it('drops the page nodes, and a person only the article referred to', () => {
    expect(out.html).not.toContain('Template Post')
    expect(out.html).not.toContain('BreadcrumbList')
    expect(out.html).not.toContain('hero.jpg')
    expect(out.html).not.toContain('schema/person/ada"')
  })

  it('drops the SearchAction — a static site has no ?s= search — and says so', () => {
    expect(graph['@graph'][0]!.potentialAction).toBeUndefined()
    expect(graph['@graph'][0]!.inLanguage).toBe('en-US')
    expect(out.removed).toEqual(['page-scoped JSON-LD', 'WebSite SearchAction'])
    expect(out.kept).toEqual(['WebSite', 'Organization', 'ImageObject'])
  })

  it('cannot be closed early by a value that contains </script>', () => {
    expect(block![1]).not.toContain('</script>')
    expect(graph['@graph'][0]!.name).toBe('Example </script> Site')
  })

  it('a person the site is published by is site-wide and stays', () => {
    const personal = JSON.stringify({ '@graph': [
      { '@type': 'WebPage', '@id': '#page' },
      { '@type': 'WebSite', '@id': '#website', publisher: { '@id': '#me' } },
      { '@type': ['Person', 'Organization'], '@id': '#me', name: 'Ada' },
    ] })
    const kept = stripSeoTags(`<script type="application/ld+json">${personal}</script>`)
    expect(JSON.parse(/>([\s\S]*)<\/script>/.exec(kept.html)![1]!)['@graph'].map((n: { '@id': string }) => n['@id'])).toEqual(['#website', '#me'])
  })

  it('a top-level array and a single page node are handled the same way', () => {
    const array = stripSeoTags('<script type="application/ld+json">[{"@type":"Article"},{"@type":"Organization","name":"E"}]</script>')
    expect(JSON.parse(/>([\s\S]*)<\/script>/.exec(array.html)![1]!)).toEqual([{ '@type': 'Organization', name: 'E' }])
    expect(stripSeoTags('<script type="application/ld+json">{"@type":"WebPage"}</script>').html).toBe('')
  })

  it('the emit warning names what was kept', () => {
    const result = emitAstroProject({ ...input, ir: { ...ir, families: [{ ...ir.families[0]!, chrome: [{ id: 'head', position: 'head', html: head }, ir.families[0]!.chrome![1]!] }] } })
    const warning = result.warnings.find((w) => w.includes('f-single') && w.includes('page-scoped JSON-LD'))
    expect(warning).toContain('kept the site-wide WebSite, Organization, ImageObject from its structured data')
    expect(JSON.parse(result.files['src/data/chrome/f-single.json']!).head).toContain('"Organization"')
  })
})

describe('emitted SEO', () => {
  const result = emitAstroProject(input)

  it('emits one Seo component and imports it into the layout', () => {
    const seo = result.files['src/components/Seo.astro']!
    expect(seo).toContain('interface Props')
    expect(seo).toContain('<link rel="canonical" href={url} />')
    expect(seo).toContain('og:title')
    expect(seo).toContain('twitter:card')
    // is:inline is explicit: without it `astro check` reports a hint on every
    // generated project, and a clean build is part of the deliverable.
    expect(seo).toContain('<script is:inline type="application/ld+json"')
    const layout = result.files['src/layouts/FSingle.astro']!
    expect(layout).toContain(`import Seo from '../components/Seo.astro'`)
    expect(layout).toContain('<Seo title={title} locale={lang} siteName={"Example Site"} {...(seo ?? {})} />')
    // the layout no longer prints its own title — Seo owns it, so there is one
    expect(layout).not.toContain('<title>{title}</title>')
  })

  it('takes the template head tags out of the chrome data and says so', () => {
    const chrome = JSON.parse(result.files['src/data/chrome/f-single.json']!)
    expect(chrome.head).not.toContain('canonical')
    expect(chrome.head).not.toContain('Template Post')
    expect(chrome.head).toContain('preconnect')
    expect(result.warnings.some((w) => w.includes('f-single') && w.includes('canonical'))).toBe(true)
  })

  it('entry pages carry the post SEO; lists and static pages declare themselves websites', () => {
    expect(result.files['src/pages/[slug].astro']).toContain('seo={postSeo(post)}')
    expect(result.files['src/pages/news.astro']).toContain(`seo={{ description: page.description, image: page.image, imageMeta: page.image_meta, canonical: page.canonical, type: 'website' }}`)
    expect(result.files['src/pages/about.astro']).toContain(`seo={{ type: 'website' }}`)
  })

  it('prints og:image size and type only beside an image', () => {
    const seo = result.files['src/components/Seo.astro']!
    expect(seo).toContain('const imageTags = imageUrl ? imageMetaTags(imageMeta) : {}')
    expect(seo).toContain('<meta property="og:image:width" content={imageTags.width} />')
    expect(seo).toContain('<meta property="og:image:height" content={imageTags.height} />')
    expect(seo).toContain('<meta property="og:image:type" content={imageTags.type} />')
  })

  it('canonical comes from the generated address, not from data', () => {
    // A permalink recomputed by the producer can disagree with what Astro
    // actually emitted; Astro.url cannot.
    const seo = result.files['src/components/Seo.astro']!
    expect(seo).toContain('absoluteUrl(Astro.url.pathname, site)')
    expect(seo).toContain('const site = Astro.site')
    expect(result.files['astro.config.mjs']).toContain('site: "https://example.com"')
  })

  it('warns when no site URL is configured, instead of emitting a canonical to nowhere', () => {
    const noSite = emitAstroProject({ ...input, ir: { ...ir, site: { ...ir.site, url: '' } } })
    expect(noSite.warnings.some((w) => w.includes('site.url is empty'))).toBe(true)
  })

  it('a project without a site title omits og:site_name rather than inventing one', () => {
    const anon = emitAstroProject({ ...input, ir: { ...ir, site: { url: 'https://example.com' } } })
    expect(anon.files['src/layouts/FSingle.astro']).not.toContain('siteName=')
  })

  it('seo:false keeps the source head verbatim and the layout title', () => {
    const off = emitAstroProject({ ...input, options: { seo: false } })
    expect(off.files['src/components/Seo.astro']).toBeUndefined()
    const layout = off.files['src/layouts/FSingle.astro']!
    expect(layout).toContain('<title>{title}</title>')
    expect(layout).not.toContain('Seo')
    expect(JSON.parse(off.files['src/data/chrome/f-single.json']!).head).toContain('og:title')
    expect(off.files['src/pages/[slug].astro']).not.toContain('postSeo')
    expect(off.warnings.some((w) => w.includes('head chrome'))).toBe(false)
  })

  it('is deterministic', () => {
    expect(emitAstroProject(input).files).toEqual(result.files)
  })

  it('reports head-only tags that a faithful clone left in the body, without cutting into content', () => {
    // Measurement rule 33: a browser that closed <head> early leaves the
    // template's canonical in the body; the clone carries it there and no
    // fidelity score sees it.
    expect(bodySeoLeaks('<div><link rel="canonical" href="/x/"><meta property="og:title" content="T"></div>'))
      .toEqual(['canonical', 'og:*'])
    // <title> inside <svg> is legal markup — never treated as a leak
    expect(bodySeoLeaks('<svg><title>Chart</title></svg>')).toEqual([])
    expect(bodySeoLeaks('<main>plain</main>')).toEqual([])

    const leaky = emitAstroProject({
      ...input,
      ir: {
        ...ir,
        families: [{
          id: 'f-leak',
          chrome: [{ id: 'body', position: 'body', html: `<div><link rel="canonical" href="/template/">${CHROME_BODY_SLOT}</div>` }],
          css: { strategy: 'localcss' },
        }],
        routes: [],
      },
    })
    expect(leaky.warnings.some((w) => w.includes('f-leak') && w.includes('head-only canonical'))).toBe(true)
    // reported, not removed — the body chrome is untouched
    expect(JSON.parse(leaky.files['src/data/chrome/f-leak.json']!).body).toContain('rel="canonical"')
  })
})

describe('sitemap and robots.txt', () => {
  const result = emitAstroProject(input)
  const noSite = { ...input, ir: { ...ir, site: { ...ir.site, url: '' } } }

  it('wires @astrojs/sitemap into the build rather than computing a sitemap itself', () => {
    // Only the build knows every URL getStaticPaths produced; a list worked out
    // here would be a second answer that can disagree with the site.
    const pkg = JSON.parse(result.files['package.json']!)
    expect(pkg.dependencies['@astrojs/sitemap']).toBe('^3.7.0')
    const config = result.files['astro.config.mjs']!
    expect(config).toContain(`import sitemap from '@astrojs/sitemap'`)
    expect(config).toContain('integrations: [sitemap()],')
    expect(Object.keys(result.files).some((path) => path.includes('sitemap') && path.endsWith('.xml'))).toBe(false)
  })

  it('robots.txt allows everything and names the sitemap by absolute URL', () => {
    expect(result.files['public/robots.txt']).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap-index.xml\n',
    )
    expect(result.files['public/robots.txt']).not.toContain('Disallow')
  })

  it('resolves the sitemap under a site that lives below the host root', () => {
    expect(robotsTxt('https://example.com/blog')).toContain('Sitemap: https://example.com/blog/sitemap-index.xml')
    expect(robotsTxt('https://example.com/blog/')).toContain('Sitemap: https://example.com/blog/sitemap-index.xml')
    expect(robotsTxt('https://example.com')).toContain('Sitemap: https://example.com/sitemap-index.xml')
  })

  it('without a site URL: no integration, robots.txt without a Sitemap line, and a warning', () => {
    const out = emitAstroProject(noSite)
    expect(JSON.parse(out.files['package.json']!).dependencies['@astrojs/sitemap']).toBeUndefined()
    expect(out.files['astro.config.mjs']).not.toContain('sitemap')
    // A relative Sitemap line is invalid and crawlers skip it; better none.
    expect(out.files['public/robots.txt']).toBe('User-agent: *\nAllow: /\n')
    expect(out.warnings.some((w) => w.includes('no sitemap is generated'))).toBe(true)
    // `site: ""` is an invalid URL to Astro and the project would not build.
    expect(out.files['astro.config.mjs']).not.toContain('site:')
  })

  it('does not follow the seo flag: a producer owning its meta tags still gets a sitemap', () => {
    const off = emitAstroProject({ ...input, options: { seo: false } })
    expect(off.files['astro.config.mjs']).toContain('integrations: [sitemap()],')
    expect(off.files['public/robots.txt']).toContain('Sitemap: ')
    // …and the missing-site warning is still given when seo is off.
    const offNoSite = emitAstroProject({ ...noSite, options: { seo: false } })
    expect(offNoSite.warnings.some((w) => w.includes('no sitemap is generated'))).toBe(true)
  })

  it('sitemap:false leaves both out, and says nothing about them', () => {
    const off = emitAstroProject({ ...input, options: { sitemap: false } })
    expect(off.files['public/robots.txt']).toBeUndefined()
    expect(off.files['astro.config.mjs']).not.toContain('sitemap')
    expect(JSON.parse(off.files['package.json']!).dependencies['@astrojs/sitemap']).toBeUndefined()
    const offNoSite = emitAstroProject({ ...noSite, options: { sitemap: false } })
    expect(offNoSite.warnings.some((w) => w.includes('no sitemap is generated'))).toBe(false)
  })
})
