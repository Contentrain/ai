import { describe, it, expect } from 'vitest'
import type { ProjectIR } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import type { EmitInput } from './index'
import { emitAstroProject, stripSeoTags } from './index'

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
    const graph = '<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":["Article","CreativeWork"]}]}</script>'
    expect(stripSeoTags(graph).html).toBe('')
    const siteOnly = '<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"BreadcrumbList"}]}</script>'
    expect(stripSeoTags(siteOnly).html).toBe(siteOnly)
  })

  it('is a no-op on a head with none of these tags', () => {
    const plain = '<meta charset="utf-8" /><link rel="icon" href="/favicon.ico" />'
    expect(stripSeoTags(plain)).toEqual({ html: plain, removed: [] })
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
    expect(result.files['src/pages/news.astro']).toContain(`seo={{ description: page.description, image: page.image, canonical: page.canonical, type: 'website' }}`)
    expect(result.files['src/pages/about.astro']).toContain(`seo={{ type: 'website' }}`)
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
})
