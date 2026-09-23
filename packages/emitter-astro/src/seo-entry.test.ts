import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProjectIR, RawSeoEntry } from '@contentrain/types'
import { CHROME_BODY_SLOT, MIGRATION_CONTRACT_VERSION } from '@contentrain/types'
import { emitAstroProject, seoFromRawEntry, stripSeoTags } from './index'

// MG-15 §2–3: what the source's SEO plugin set for a page — its composed title,
// hand-written share cards, its JSON-LD graph (FAQ, HowTo, Product) — survives
// the migration instead of being re-derived from the entry.

const TMP = join(dirname(fileURLToPath(import.meta.url)), '..', '.vitest-tmp-seo-entry')
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

/** What Yoast renders for a post with an FAQ block: one graph, page and site nodes mixed. */
const YOAST_GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': ['WebPage', 'FAQPage'], '@id': 'https://example.com/hello/', url: 'https://example.com/hello/', name: 'Hello – Example', isPartOf: { '@id': 'https://example.com/#website' }, mainEntity: [{ '@id': 'https://example.com/hello/#faq-1' }] },
    { '@type': 'Question', '@id': 'https://example.com/hello/#faq-1', name: 'Why?', acceptedAnswer: { '@type': 'Answer', text: 'Because.' } },
    { '@type': 'WebSite', '@id': 'https://example.com/#website', url: 'https://example.com/', potentialAction: [{ '@type': 'SearchAction', target: 'https://example.com/?s={search_term_string}' }] },
    { '@type': 'Organization', '@id': 'https://example.com/#organization', name: 'Example' },
  ],
}

describe('seoFromRawEntry', () => {
  const yoast: RawSeoEntry = {
    resolved: true,
    title: 'Hello – Example',
    description: 'What the editor wrote.',
    canonical: 'https://example.com/hello/',
    robots: { index: 'index', follow: 'follow' },
    robots_served: ['noindex', 'follow'],
    open_graph: { title: 'Share title', description: 'Share text', image: 'https://example.com/share.jpg', type: 'article', url: 'https://example.com/hello/' },
    twitter: { card: 'summary', title: 'Tweet title' },
    schema: { types: ['WebPage', 'FAQPage'], graph: YOAST_GRAPH },
  }

  it("maps the serving plugin's rendered values to the emitter's fields", () => {
    expect(seoFromRawEntry({ yoast }, { serving: 'yoast', url: 'http://example.com/hello' })).toEqual({
      seo_title: 'Hello – Example',
      description: 'What the editor wrote.',
      // robots_served is what the page carried; the stored `index` setting lost to it.
      noindex: true,
      open_graph: { title: 'Share title', description: 'Share text', image: 'https://example.com/share.jpg' },
      twitter: { card: 'summary', title: 'Tweet title' },
      schema: YOAST_GRAPH,
    })
  })

  it('keeps a canonical only when it sends the page somewhere else', () => {
    expect(seoFromRawEntry({ yoast: { canonical: 'https://example.com/other/' } }, { url: 'https://example.com/hello/' }).canonical).toBe('https://example.com/other/')
    expect(seoFromRawEntry({ yoast: { canonical: 'https://example.com/hello/' } }, { url: 'https://example.com/hello' }).canonical).toBeUndefined()
  })

  it('reads the serving plugin first, else the first plugin with data', () => {
    const blocks = { yoast: { resolved: true, title: 'Y' }, rank_math: { resolved: true, title: 'R' } }
    expect(seoFromRawEntry(blocks, { serving: 'rank_math' }).seo_title).toBe('R')
    expect(seoFromRawEntry(blocks, { serving: 'wordpress-core' }).seo_title).toBe('Y')
    expect(seoFromRawEntry({ aioseo: { resolved: true, title: 'A' } }).seo_title).toBe('A')
    expect(seoFromRawEntry(undefined)).toEqual({})
  })

  it('drops unrendered templates and keeps literal values from a stored block', () => {
    const stored: RawSeoEntry = {
      resolved: false,
      title: '%title% %sep% %sitename%',
      description: 'A literal description.',
      open_graph: { title: '%title% | %sitename%', description: '%customfield(teaser)%' },
      twitter: { title: 'Literal tweet' },
      robots: { index: 'noindex', follow: 'nofollow' },
    }
    expect(seoFromRawEntry({ rank_math: stored })).toEqual({
      description: 'A literal description.',
      noindex: true,
      nofollow: true,
      twitter: { title: 'Literal tweet' },
    })
    expect(seoFromRawEntry({ yoast: { title: '%%title%% %%sep%% %%sitename%%', description: '%%excerpt%%' } })).toEqual({})
    expect(seoFromRawEntry({ aioseo: { title: '#post_title #separator_sa #site_title', description: '#tagline' } })).toEqual({})
  })

  it('reads a template in its own plugin\'s syntax only, so a hashtag or a percentage survives', () => {
    const title = (provider: 'yoast' | 'rank_math' | 'aioseo', value: string) => seoFromRawEntry({ [provider]: { title: value } }).seo_title
    expect(title('aioseo', 'Why #vuejs matters – Blog')).toBe('Why #vuejs matters – Blog')
    expect(title('aioseo', 'Issue #fix_this and #postgres')).toBe('Issue #fix_this and #postgres')
    expect(title('yoast', 'Top #post_title tips')).toBe('Top #post_title tips')
    expect(title('rank_math', '50% off, 20% more')).toBe('50% off, 20% more')
    expect(title('yoast', '100%%50 odds')).toBe('100%%50 odds')
  })
})

describe('seoFromRawEntry — a block the exporter rendered (BR-16)', () => {
  // Rank Math inactive, its templates rendered by the Bridge; one variable it
  // could not render was taken out of the string and listed.
  const rendered: RawSeoEntry = {
    resolved: false,
    title: '%title% %sep% %sitename%',
    description: '%excerpt%',
    robots: { index: 'index', follow: 'follow', advanced: ['noimageindex'] },
    twitter: { card: 'summary' },
    rendered: {
      title: 'Hello – Example',
      description: 'What the editor wrote.',
      canonical: 'https://example.com/other/',
      robots: { index: 'noindex', follow: 'follow' },
      open_graph: { title: 'Share', image: 'https://example.com/share.jpg' },
      twitter: { title: 'Tweet' },
    },
    rendered_by: 'bridge',
    template_source: { title: 'post_type', description: 'default', robots: 'post' },
    unresolved: ['%customfield(teaser)%'],
  }

  it('reads rendered over stored: final text, robots, share cards, the card kept from the block', () => {
    expect(seoFromRawEntry({ rank_math: rendered }, { url: 'https://example.com/hello/' })).toEqual({
      seo_title: 'Hello – Example',
      description: 'What the editor wrote.',
      canonical: 'https://example.com/other/',
      noindex: true,
      open_graph: { title: 'Share', image: 'https://example.com/share.jpg' },
      twitter: { title: 'Tweet', card: 'summary' },
    })
  })

  it('robots: robots_served first, then rendered, then the stored setting', () => {
    expect(seoFromRawEntry({ rank_math: { ...rendered, robots_served: ['index', 'follow'] } }).noindex).toBeUndefined()
    expect(seoFromRawEntry({ rank_math: { ...rendered, rendered: { title: 'T' } } })).not.toHaveProperty('noindex')
    expect(seoFromRawEntry({ rank_math: { ...rendered, rendered: { title: 'T' }, robots: { index: 'noindex' } } }).noindex).toBe(true)
  })

  it('field by field: a value the rendering lacks falls back to the stored literal, a stored template does not', () => {
    const partial = seoFromRawEntry({ yoast: {
      title: '%%title%% %%sep%% %%sitename%%',
      canonical: 'https://example.com/y/',
      description: 'Literal.',
      open_graph: { image: 'https://example.com/og.jpg', title: '%%title%%' },
      twitter: { card: 'summary_large_image' },
      rendered: { title: 'Rendered', open_graph: { title: 'Share' }, twitter: { title: 'Tweet' } },
    } })
    expect(partial).toEqual({
      seo_title: 'Rendered',
      canonical: 'https://example.com/y/',
      description: 'Literal.',
      open_graph: { image: 'https://example.com/og.jpg', title: 'Share' },
      twitter: { card: 'summary_large_image', title: 'Tweet' },
    })
  })

  it("the exporter's rendered schema nodes stand in when the block has no graph", () => {
    const faq = { '@type': 'FAQPage', mainEntity: [] }
    expect(seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [faq] } } } }).schema).toEqual({ '@context': 'https://schema.org', '@graph': [faq] })
    // An unresolved block's top-level graph is the stored nodes: the rendering wins.
    expect(seoFromRawEntry({ rank_math: { schema: { types: ['Article'], graph: YOAST_GRAPH }, rendered: { schema: { graph: [faq] } } } }).schema).toEqual({ '@context': 'https://schema.org', '@graph': [faq] })
    expect(seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [] } } } })).not.toHaveProperty('schema')
  })

  it("never prints a template token in the JSON-LD: an unresolved block's stored graph is not read, a rendered node with a token is left out", () => {
    // What the Bridge wrote for Rank Math before BR-16's fix: the stored nodes as the top-level graph.
    const stored = [{ '@type': 'Article', headline: '%title%', author: { '@type': 'Person', name: '%name%' } }]
    expect(seoFromRawEntry({ rank_math: { resolved: false, schema: { types: ['Article'], graph: stored } } })).not.toHaveProperty('schema')
    // Without a rendering, the block's own graph is read node by node: a literal node stays.
    const literal = { '@type': 'Organization', name: 'Example' }
    expect(seoFromRawEntry({ rank_math: { resolved: false, schema: { types: ['Article'], graph: [...stored, literal] } } }).schema).toEqual({ '@context': 'https://schema.org', '@graph': [literal] })
    const mixed = seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [
      { '@type': 'FAQPage', name: 'Questions' },
      { '@type': 'Article', headline: 'Hello %sep% %sitename%' },
      { '@type': 'HowTo', step: [{ '@type': 'HowToStep', text: 'Use %customfield(x)%' }] },
    ] } } } })
    expect(mixed.schema).toEqual({ '@context': 'https://schema.org', '@graph': [{ '@type': 'FAQPage', name: 'Questions' }] })
    const allTokens = seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [{ '@type': 'Article', headline: '%title%' }] } } } })
    expect(allTokens).not.toHaveProperty('schema')
    // Percent-encoded non-Latin addresses are text, not tokens: %E4%B8%AD holds "%AD%".
    const cjk = { '@type': 'Article', url: 'https://x.com/%E4%B8%AD%E6%96%87/', image: 'https://x.com/%EF%BB%BF.jpg' }
    expect(seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [cjk] } } } }).schema).toEqual({ '@context': 'https://schema.org', '@graph': [cjk] })
    expect(seoFromRawEntry({ rank_math: { rendered: { title: 'Hello', open_graph: { image: 'https://x.com/%E4%B8%AD.jpg' } } } }).open_graph).toEqual({ image: 'https://x.com/%E4%B8%AD.jpg' })
    // Turkish slugs and images — ş ç ğ ı, percent-encoded — keep their schema.
    const tr = { '@type': 'Article', url: 'https://x.com/%C5%9Feker-%C3%A7ay-da%C4%9F-%C4%B1s%C4%B1/', image: 'https://x.com/g%C3%B6rsel.jpg' }
    expect(seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [tr] } } } }).schema).toEqual({ '@context': 'https://schema.org', '@graph': [tr] })
    // A token beside an encoded address is still caught.
    expect(seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [{ ...cjk, headline: '%title%' }] } } } })).not.toHaveProperty('schema')
    // A literal percentage is not a token.
    expect(seoFromRawEntry({ rank_math: { rendered: { schema: { graph: [{ '@type': 'Offer', description: '50% off, 20% more' }] } } } }).schema).toBeDefined()
    // The graph the running plugin rendered is read as it is.
    expect(seoFromRawEntry({ yoast: { resolved: true, schema: { types: ['WebPage'], graph: YOAST_GRAPH } } }).schema).toBe(YOAST_GRAPH)
  })

  it('a resolved block is read as it is, rendered ignored', () => {
    expect(seoFromRawEntry({ yoast: { resolved: true, title: 'Live', rendered: { title: 'Bridge' } } }).seo_title).toBe('Live')
  })

  it('never prints a template token, even one left in a rendered string', () => {
    const leaked = seoFromRawEntry({ rank_math: { rendered: { title: 'Hello %sep% Example', description: 'Fine.' } } })
    expect(leaked).toEqual({ description: 'Fine.' })
  })

  it('reads SEOPress: rendered when present, else stored with its %%variables%% dropped', () => {
    expect(seoFromRawEntry({ seopress: { rendered: { title: 'Hello – Example' } } }, { serving: 'seopress' }).seo_title).toBe('Hello – Example')
    expect(seoFromRawEntry({ seopress: { title: '%%post_title%% %%sep%% %%sitetitle%%', description: 'Literal.' } })).toEqual({ description: 'Literal.' })
    // Behind the three older plugins in the fallback order, as it was added last.
    expect(seoFromRawEntry({ seopress: { title: 'S' }, aioseo: { title: 'A' } }).seo_title).toBe('A')
  })
})

describe("seoFromRawEntry on the Bridge's real BR-16 output (wordpress-bridge #18)", () => {
  const entry = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'types', 'src', 'fixtures', 'bridge-br16', 'seo-entries.json'), 'utf8'))['post:23'] as Partial<Record<'yoast' | 'rank_math' | 'aioseo' | 'seopress', RawSeoEntry>>
  const TOKEN = /%%[a-z0-9_-]+%%|%[a-z_]+(?:\([^)]*\))?%|#(?:post_title|site_title|separator_sa|tagline|post_excerpt|taxonomy_title)\b/i

  it('reads every provider block into fields, and no template token reaches them', () => {
    for (const provider of ['yoast', 'rank_math', 'aioseo', 'seopress'] as const) {
      const fields = seoFromRawEntry({ [provider]: entry[provider] }, { serving: provider })
      expect(fields.seo_title, provider).toBeTruthy()
      expect(TOKEN.test(JSON.stringify(fields)), provider).toBe(false)
    }
  })

  it("the running plugin's graph is printed; a rendered Rank Math node stands in for its own", () => {
    expect(seoFromRawEntry({ yoast: entry.yoast }).schema).toBe(entry.yoast!.schema!.graph)
    expect(seoFromRawEntry({ rank_math: entry.rank_math }).schema).toEqual({ '@context': 'https://schema.org', '@graph': entry.rank_math!.rendered!.schema!.graph })
  })
})

describe('sourceStructuredData (emitted runtime)', () => {
  it("keeps the plugin's graph — FAQ included — minus the SearchAction", () => {
    const data = rt.sourceStructuredData(YOAST_GRAPH)
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@graph'].map((n: { '@type': unknown }) => n['@type'])).toEqual([['WebPage', 'FAQPage'], 'Question', 'WebSite', 'Organization'])
    expect(data['@graph'][2]).toEqual({ '@type': 'WebSite', '@id': 'https://example.com/#website', url: 'https://example.com/' })
  })

  it('drops the nodes the kept head already carries, matched by address rather than by spelling', () => {
    const types = (ids: string[]) => rt.sourceStructuredData(YOAST_GRAPH, ids)['@graph'].map((n: { '@type': unknown }) => n['@type'])
    for (const id of ['https://example.com/#website', 'http://example.com#website', 'https://EXAMPLE.com//#website']) {
      expect(types([id])).toEqual([['WebPage', 'FAQPage'], 'Question', 'Organization'])
    }
    expect(types(['https://example.com/#website', 'https://example.com/#organization'])).toEqual([['WebPage', 'FAQPage'], 'Question'])
    // The path is an address: its case counts.
    expect(types(['https://example.com/HELLO/'])).toHaveLength(4)
    expect(types(['https://other.example/#website'])).toHaveLength(4)
  })

  it('takes a node array or a single node, and gives up on anything it cannot print', () => {
    expect(rt.sourceStructuredData([{ '@type': 'HowTo', name: 'x' }])).toEqual({ '@context': 'https://schema.org', '@graph': [{ '@type': 'HowTo', name: 'x' }] })
    expect(rt.sourceStructuredData({ '@context': 'https://schema.org', '@type': 'Product', name: 'p' })['@graph'][0]['@type']).toBe('Product')
    expect(rt.sourceStructuredData('{"@type":"x"}')).toBeUndefined()
    expect(rt.sourceStructuredData({ '@graph': [{ name: 'untyped' }] })).toBeUndefined()
    expect(rt.sourceStructuredData(undefined)).toBeUndefined()
  })

  it('cannot be closed early by a value holding </script>', () => {
    const data = rt.sourceStructuredData([{ '@type': 'Question', name: '</script><script>alert(1)</script>' }])
    expect(rt.jsonLd(data)).not.toContain('</script>')
  })
})

describe('the document title and the entry title', () => {
  it('an entry: the plugin title is <title>; the entry title stays the headline and the last crumb', () => {
    const seo = rt.postSeo({ slug: 'hello', title: 'Hello', body: '', seo_title: 'Hello – Example', open_graph: { title: 'Share' }, twitter: { card: 'summary' }, schema: YOAST_GRAPH })
    expect(seo).toMatchObject({ title: 'Hello – Example', headline: 'Hello', openGraph: { title: 'Share' }, twitter: { card: 'summary' }, schema: YOAST_GRAPH })
    expect(rt.postSeo({ slug: 'a', title: 'A', body: '' })).toMatchObject({ title: 'A', headline: 'A', openGraph: undefined, schema: undefined })

    const data = rt.pageStructuredData({ url: 'https://example.com/hello/', site, title: 'Hello – Example', headline: 'Hello', article: true, breadcrumbs: [{ name: 'Home', path: '/' }] })
    const [page, trail, article] = data['@graph']
    expect(page.name).toBe('Hello – Example')
    expect(trail.itemListElement.at(-1).name).toBe('Hello')
    expect(article.headline).toBe('Hello')
  })
})

describe('emitted pages', () => {
  const content = {
    posts: [{ slug: 'hello', title: 'Hello', body: '<p>x</p>', seo_title: 'Hello – Example', open_graph: { title: 'Share' }, schema: YOAST_GRAPH }],
    queries: { q: [{ params: {}, items: [], title: 'News – Example', open_graph: { image: '/og/news.png' }, twitter: { card: 'summary' }, schema: [{ '@type': 'CollectionPage' }] }] },
  }
  const result = emitAstroProject({ ir, content })

  it('carry the overrides in their data and hand them to the Seo component', () => {
    expect(JSON.parse(result.files['src/data/posts.json']!)[0]).toMatchObject({ seo_title: 'Hello – Example', open_graph: { title: 'Share' }, schema: YOAST_GRAPH })
    expect(result.files['src/pages/news.astro']).toContain('openGraph: page.open_graph, twitter: page.twitter, schema: page.schema')
    expect(result.warnings.some((w) => w.includes('schema'))).toBe(false)
  })

  it('share cards fall back tag by tag: twitter → Open Graph → the page', () => {
    const seo = result.files['src/components/Seo.astro']!
    expect(seo).toContain('const ogTitle = openGraph?.title || title')
    expect(seo).toContain('const ogImage = absoluteUrl(openGraph?.image, site) ?? imageUrl')
    expect(seo).toContain('const ogImageTags = ogImage === imageUrl ? imageTags : {}')
    expect(seo).toContain('const twTitle = twitter?.title || ogTitle')
    expect(seo).toContain('const twImage = absoluteUrl(twitter?.image, site) ?? ogImage')
    expect(seo).toContain(`const twCard = twitter?.card === 'summary' || twitter?.card === 'summary_large_image' ? twitter.card : twImage ? 'summary_large_image' : 'summary'`)
    expect(seo).toContain('const structured = sourceStructuredData(schema, headLdIds) ?? pageStructuredData({')
    expect(seo).toContain('<meta name="twitter:card" content={twCard} />')
  })

  it('warn about a schema value that is not JSON-LD, instead of dropping it silently', () => {
    const bad = emitAstroProject({ ir, content: { posts: [{ slug: 'a', title: 'A', body: '', schema: '{"@type":"FAQPage"}' }], queries: { q: [{ params: {}, items: [], schema: [{ name: 'untyped' }] }] } } })
    expect(bad.warnings).toContain('collection posts: 1 schema values are not JSON-LD objects — those pages print the generated structured data instead')
    expect(bad.warnings).toContain('query q: 1 schema values are not JSON-LD objects — those pages print the generated structured data instead')
  })
})

describe('the layout names what the head carries', () => {
  it('passes every structured-data @id the kept head holds, so the page graph does not repeat them', () => {
    const head = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"https://example.com/template/"},{"@type":"WebSite","@id":"https://example.com/#website"},{"@type":"Organization","@id":"https://example.com/#organization","logo":{"@id":"https://example.com/#logo"}},{"@type":"ImageObject","@id":"https://example.com/#logo"}]}</script>'
    const withHead = emitAstroProject({ ir: { ...ir, families: [{ ...ir.families[0]!, chrome: [{ id: 'head', position: 'head', html: head }, ...ir.families[0]!.chrome!] }] } })
    expect(withHead.files['src/layouts/F.astro']).toContain('headLdIds={["https://example.com/#website","https://example.com/#organization","https://example.com/#logo"]}')
    expect(emitAstroProject({ ir }).files['src/layouts/F.astro']).not.toContain('headLdIds=')
  })
})

describe('the head keeps the site handle', () => {
  it('twitter:site stays; the per-page twitter tags go', () => {
    const { html, removed } = stripSeoTags('<meta name="twitter:site" content="@example"><meta name="twitter:creator" content="@ada"><meta name="twitter:title" content="T">')
    expect(html).toBe('<meta name="twitter:site" content="@example">')
    expect(removed).toEqual(['twitter:*'])
  })
})
