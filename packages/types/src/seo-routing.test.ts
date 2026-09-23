import { describe, it, expect } from 'vitest'
import type {
  RawIR,
  RawRedirect,
  RawRedirectExcluded,
  RawRouting,
  RawSeo,
  RawSeoEntry,
  RawSeoSettings,
} from './index'
import { SEO_PROVIDERS } from './index'
import seoJson from './fixtures/bridge-b04/seo.json'
import seoEntriesJson from './fixtures/bridge-b04/seo-entries.json'
import routingJson from './fixtures/bridge-b04/routing.json'
import redirectsJson from './fixtures/bridge-b04/redirects.json'

// The Bridge's own output (fixtures/bridge-b04/README.md). A JSON import types
// every string as `string`, so the check is structural: every key the producer
// emits must be a key the type declares — `Record<keyof T, true>` makes the
// compiler hold each list to its type — and every closed vocabulary must hold.

const SEO_KEYS: Record<keyof RawSeo, true> = { format: true, status: true, serving: true, providers: true, settings: true, entries: true, home: true, excluded: true }
const SEO_ENTRY_KEYS: Record<keyof RawSeoEntry, true> = {
  resolved: true, title: true, description: true, canonical: true, robots: true, robots_served: true,
  open_graph: true, twitter: true, focus_keyword: true, schema: true, stored: true,
  rendered: true, rendered_by: true, template_source: true, unresolved: true,
}
const RENDERED_KEYS: Record<keyof NonNullable<RawSeoEntry['rendered']>, true> = {
  title: true, description: true, canonical: true, robots: true, open_graph: true, twitter: true, schema: true,
}
const SEO_SETTINGS_KEYS: Record<keyof RawSeoSettings, true> = {
  separator: true, title_templates: true, description_templates: true, noindex: true, social: true, verification: true, raw: true,
}
const ROUTING_KEYS: Record<keyof RawRouting, true> = {
  format: true, home: true, permalink_structure: true, plain: true, trailing_slash: true, front: true,
  category_base: true, tag_base: true, pagination_base: true, author_base: true, search_base: true,
  feed_base: true, comments_pagination_base: true, author_structure: true, date_structure: true, page_structure: true,
  show_on_front: true, page_on_front: true, page_for_posts: true, posts_per_page: true, post_types: true, taxonomies: true,
}
const POST_TYPE_KEYS: Record<keyof RawRouting['post_types'][number], true> = {
  name: true, hierarchical: true, rewrite: true, permastruct: true, has_archive: true, archive_path: true, query_var: true,
}
const TAXONOMY_KEYS: Record<keyof RawRouting['taxonomies'][number], true> = {
  name: true, object_types: true, hierarchical: true, rewrite: true, permastruct: true,
}
const REDIRECT_KEYS: Record<keyof RawRedirect, true> = {
  from: true, to: true, status: true, source: true, id: true, match: true, regex: true, served_by: true, status_note: true,
}
const EXCLUDED_KEYS: Record<keyof RawRedirectExcluded, true> = { ...REDIRECT_KEYS, reason: true, condition: true }

const undeclared = (value: object, declared: object) => Object.keys(value).filter(key => !(key in declared))

// BR-16 (contentrain-bridge-seo@1, additive): an entry the Bridge rendered
// itself for a plugin that does not serve the head — the shape Opus Bridge
// writes, key for key.
const BR16_ENTRY = {
  resolved: false,
  title: '%title% %sep% %sitename%',
  robots: { index: 'index', follow: 'follow', advanced: ['noimageindex'] },
  rendered: {
    title: 'Hello – Example',
    description: 'What the editor wrote.',
    canonical: 'https://example.com/hello/',
    robots: { index: 'noindex', follow: 'follow' },
    open_graph: { title: 'Share', description: 'Share text', image: 'https://example.com/share.jpg', image_width: 1200, image_height: 630 },
    twitter: { title: 'Tweet', description: 'Tweet text', image: 'https://example.com/share.jpg' },
    schema: { graph: [{ '@type': 'FAQPage', mainEntity: [] }] },
  },
  rendered_by: 'bridge',
  template_source: { title: 'post_type', description: 'default', robots: 'post' },
  unresolved: ['%customfield(teaser)%'],
} satisfies RawSeoEntry

describe('RawSeoEntry — the Bridge-rendered block (BR-16)', () => {
  it('declares every key of an entry and of its rendered values', () => {
    expect(undeclared(BR16_ENTRY, SEO_ENTRY_KEYS)).toEqual([])
    expect(undeclared(BR16_ENTRY.rendered, RENDERED_KEYS)).toEqual([])
  })

  it('a home page that lists posts has its SEO under home, one block per provider', () => {
    const withHome: RawSeo = { status: 'present', serving: 'rank_math', providers: { yoast: { status: 'absent' }, rank_math: { status: 'active' }, aioseo: { status: 'absent' } }, settings: {}, entries: {}, home: { rank_math: BR16_ENTRY } }
    expect(undeclared(withHome, SEO_KEYS)).toEqual([])
    expect(undeclared(withHome.home!.rank_math!, SEO_ENTRY_KEYS)).toEqual([])
  })

  it('SEOPress is a provider, and optional in an older export', () => {
    expect(SEO_PROVIDERS).toContain('seopress')
    const older: RawSeo = { status: 'present', serving: 'yoast', providers: { yoast: { status: 'active' }, rank_math: { status: 'absent' }, aioseo: { status: 'absent' } }, settings: {}, entries: {} }
    expect(older.providers.seopress).toBeUndefined()
  })
})

describe('RawSeo against the Bridge', () => {
  const seo = { ...seoJson, entries: seoEntriesJson } as unknown as RawSeo

  it('declares every key the Bridge writes', () => {
    expect(undeclared(seo, SEO_KEYS)).toEqual([])
    for (const settings of Object.values(seo.settings)) expect(undeclared(settings!, SEO_SETTINGS_KEYS)).toEqual([])
    for (const byProvider of Object.values(seo.entries)) {
      for (const entry of Object.values(byProvider)) expect(undeclared(entry!, SEO_ENTRY_KEYS)).toEqual([])
    }
  })

  it('holds the closed vocabularies', () => {
    expect(seo.status).toBe('present')
    expect(seo.serving).toBe('yoast')
    // SEOPress was added after this export: the three older providers are
    // always named, SEOPress may be, and nothing else is.
    expect(Object.keys(seo.providers).filter((p) => p !== 'seopress').toSorted()).toEqual(SEO_PROVIDERS.filter((p) => p !== 'seopress').toSorted())
    expect(Object.keys(seo.providers).every((p) => (SEO_PROVIDERS as readonly string[]).includes(p))).toBe(true)
    expect(seo.providers.yoast).toEqual({ status: 'active', version: '28.5' })
    expect(seo.providers.rank_math.status).toBe('inactive-with-data')
    for (const key of Object.keys(seo.entries)) expect(key).toMatch(/^(post:\d+|term:[a-z_]+:\d+)$/)
  })

  it('keeps a deliberate noindex and a deliberate cross-domain canonical as values', () => {
    expect(seo.entries['post:12']!.yoast!.robots?.index).toBe('noindex')
    expect(seo.entries['post:13']!.yoast!.canonical).toBe('https://example.org/the-original/')
    // Rendered by the running plugin vs read from storage.
    expect(seo.entries['post:1']!.yoast!.resolved).toBe(true)
    expect(seo.entries['post:11']!.rank_math!.resolved).toBe(false)
  })

  it('reports what it withheld instead of dropping it silently', () => {
    expect(seo.excluded).toEqual([{ reason: 'sensitive-key', source: 'seo/settings/yoast/titles/org-email' }])
  })
})

describe('RawRouting against the Bridge', () => {
  const routing = routingJson as unknown as RawRouting

  it('declares every key the Bridge writes', () => {
    expect(undeclared(routing, ROUTING_KEYS)).toEqual([])
    for (const type of routing.post_types) expect(undeclared(type, POST_TYPE_KEYS)).toEqual([])
    for (const taxonomy of routing.taxonomies) expect(undeclared(taxonomy, TAXONOMY_KEYS)).toEqual([])
  })

  it('states the structure the addresses came from', () => {
    expect(routing.permalink_structure).toBe('/blog/%year%/%postname%/')
    expect(routing.front).toBe('/blog/')
    const book = routing.post_types.find(type => type.name === 'bridge_seo_book')!
    // with_front applied: the CPT lives under the front, the category base does not.
    expect([book.permastruct, book.archive_path]).toEqual(['/blog/library/%bridge_seo_book%', '/blog/library/'])
    expect(routing.taxonomies.find(t => t.name === 'category')!.permastruct).toBe('/topics/%category%')
    expect(routing.page_on_front).toEqual({ id: 36, path: '/', slug: 'seo-home-423e85-423e85' })
    expect(routing.post_types.find(type => type.name === 'post')!.rewrite).toBe(false)
  })
})

describe('RawRedirect and RawRedirectExcluded against the Bridge', () => {
  const doc = redirectsJson as unknown as { redirects: RawRedirect[], excluded: RawRedirectExcluded[] }

  it('declares every key the Bridge writes', () => {
    for (const rule of doc.redirects) expect(undeclared(rule, REDIRECT_KEYS)).toEqual([])
    for (const rule of doc.excluded) expect(undeclared(rule, EXCLUDED_KEYS)).toEqual([])
  })

  it('served rules use the match vocabulary, and only url without regex is a plain mapping', () => {
    const matches = new Set(doc.redirects.map(rule => rule.match))
    for (const match of matches) expect(['url', 'regex', 'start', 'contains', 'end']).toContain(match)
    const plain = doc.redirects.filter(rule => rule.match === 'url' && !rule.regex)
    expect(plain.length).toBeGreaterThan(0)
    expect(plain.length).toBeLessThan(doc.redirects.length)
  })

  it('every excluded rule says why, in the declared vocabulary', () => {
    for (const rule of doc.excluded) {
      expect(rule.reason).toMatch(/^(disabled|source-inactive|slug-reused|no-slug-address|not-a-redirect:.+|conditional-match:.+)$/)
      expect(rule.id.startsWith(`${rule.source}:`) || rule.source === 'wordpress').toBe(true)
    }
    // A conditional rule keeps the source's own match type, which is not a RawRedirectMatch.
    expect(doc.excluded.some(rule => rule.match === 'login' && rule.reason === 'conditional-match:login')).toBe(true)
  })

  it('RawIR carries all three next to the existing redirects', () => {
    const extra: Pick<RawIR, 'seo' | 'routing' | 'redirects' | 'redirects_excluded'> = {
      seo: { ...seoJson, entries: seoEntriesJson } as unknown as RawSeo,
      routing: routingJson as unknown as RawRouting,
      redirects: doc.redirects,
      redirects_excluded: doc.excluded,
    }
    expect(extra.redirects!.length + extra.redirects_excluded!.length).toBe(
      Object.values((redirectsJson as { sources: Record<string, { rules: number }> }).sources).reduce((n, s) => n + s.rules, 0),
    )
  })
})
