import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  SourceAccessKind,
  RawIR,
  RawPost,
  RawMenuTarget,
  CapabilityKey,
  CapabilityManifest,
  ProjectIR,
  RouteModel,
  LayoutFamily,
  QueryBinding,
  ComponentDef,
  ComponentType,
  CssStrategy,
  MigrationHandoff,
  HandoffOffer,
} from './index'
import {
  MIGRATION_CONTRACT_VERSION,
  SOURCE_ACCESS_LADDER,
  CAPABILITY_KEYS,
  COMPONENT_TYPES,
  LEGACY_CSS_LAYER,
} from './index'

// ─── Fixtures: realistic documents, typed against the contracts ───

const rawIr: RawIR = {
  version: MIGRATION_CONTRACT_VERSION,
  provenance: { kind: 'wxr', fetched_at: '2026-08-24T12:00:00Z', tool: 'wxr2raw/1.0' },
  site: { url: 'https://example.com', title: 'Example', language: 'en-US', wxr_version: '1.2' },
  authors: [{ id: 1, login: 'admin', display_name: 'Admin', email: null }],
  terms: [
    { id: 2, taxonomy: 'category', slug: 'news', name: 'News', parent: null, parent_resolved: null },
    { id: 3, taxonomy: 'category', slug: 'events', name: 'Events', parent: 'news', parent_resolved: true },
  ],
  posts: [
    {
      id: 10,
      type: 'post',
      status: 'publish',
      slug: 'hello',
      title: 'Hello',
      link: 'https://example.com/hello/',
      author: 'admin',
      date: '2026-01-01T00:00:00Z',
      modified: '2026-01-02T00:00:00Z',
      content: '<p>Body</p>',
      excerpt: '',
      sticky: false,
      terms: [{ taxonomy: 'category', slug: 'news', name: 'News', resolved: true }],
      meta: { _thumbnail_id: '77', custom_key: 'x' },
      serialized_keys: [],
      acf: { subtitle: { value: 'A subtitle', field_key: 'field_abc123' } },
    },
  ],
  attachments: [{ id: 77, title: 'Hero', slug: 'hero', url: 'https://example.com/wp-content/uploads/hero.jpg', mime: 'image/jpeg' }],
  menus: [
    {
      id: 5,
      slug: 'primary',
      name: 'Primary',
      items: [
        { id: 100, title: 'Home', target: { kind: 'url', url: 'https://example.com/', resolved: true } },
        { id: 101, title: 'News', target: { kind: 'term', taxonomy: 'category', id: 2, slug: 'news', resolved: true } },
      ],
    },
  ],
  comments: [
    { id: 500, post: 10, parent: null, parent_resolved: null, author: 'Reader', date: '2026-01-03T00:00:00Z', content: 'Nice', approved: '1' },
  ],
  redirects: [{ from: '/old', to: '/hello/', status: 301, source: 'redirection' }],
  language_pairs: [{ post: 10, translations: { tr: 42 } }],
}

const manifest: CapabilityManifest = {
  version: MIGRATION_CONTRACT_VERSION,
  site_url: 'https://example.com',
  access: { html_status: 200, rest_status: 200, achieved: 'rest_public' },
  theme: 'twentytwentyfour',
  plugins: ['jetpack'],
  custom_post_types: [{ slug: 'recipe', rest_visible: false, count: null }],
  comments: { active: true, form_status: 'open', rest_total: 412, plugin: null },
  capabilities: {
    seo: { present: true, plugin: 'yoast', evidence: ['dom', 'rest'] },
    forms: { present: false },
  },
  behaviors: ['carousel', 'search-overlay'],
}

const projectIr: ProjectIR = {
  version: MIGRATION_CONTRACT_VERSION,
  site: { url: 'https://example.com', locales: ['en'] },
  routes: [
    { id: 'r-front', pattern: '/', kind: 'front', family: 'f-front' },
    {
      id: 'r-term',
      pattern: '/category/:term/page/:page',
      kind: 'term',
      family: 'f-archive',
      params: [
        { name: 'term', source: 'term_slug' },
        { name: 'page', source: 'page_number' },
      ],
      query: 'q-term',
      variant_rules: [{ param: 'term', in: ['events'], variant: 'with_banner' }],
    },
  ],
  families: [
    { id: 'f-front', kind: 'front', css: { strategy: 'localcss' } },
    {
      id: 'f-archive',
      kind: 'term',
      chrome: [{ id: 'header', position: 'before_body', html: '<header>…</header>' }],
      slots: [{ kind: 'title', selector: '.archive-title' }],
      components: [{ component: 'c-card', variant: 'compact' }],
      css: { strategy: 'purge_set', files: ['styles/f-archive.css'] },
      columns: { desktop: 4, mobile: 1 },
      variants: [{ key: 'with_banner' }],
      evidence: { pages: ['/category/news/'], holdout_score: 86.5 },
    },
  ],
  components: [
    { id: 'c-card', type: 'card', source: 'rest', variants: [{ key: 'compact' }, { key: 'featured' }] },
    { id: 'c-comments', type: 'comments', source: 'runtime' },
  ],
  queries: [
    {
      id: 'q-term',
      source: 'posts',
      taxonomy: { taxonomy: 'category', term_param: 'term' },
      order: { by: 'date', direction: 'desc' },
      per_page: 12,
      pagination: 'numbered',
      excerpt_source: 'content_first_paragraph',
    },
  ],
  tokens: { colors: { primary: '#0a2540' } },
  css_default: 'purge_set',
  viewport_strategy: 'split',
  content_models: ['posts', 'authors'],
}

const handoff: MigrationHandoff = {
  version: MIGRATION_CONTRACT_VERSION,
  site_url: 'https://example.com',
  generated_at: '2026-08-24T12:00:00Z',
  repository: { provider: 'github', owner: 'acme', name: 'site', default_branch: 'main' },
  preview_url: 'https://preview.example.dev',
  content_summary: { models: 6, entries: 240, locales: ['en'] },
  capabilities: [
    { key: 'comments', disposition: 'needs_runtime', counts: { found: 412 } },
    { key: 'seo', disposition: 'migrated_static' },
  ],
  offers: [
    {
      capability: 'comments',
      provider: 'keep_wordpress',
      warning: 'keeping comments on WordPress means the WordPress server stays live',
      cost_comparison: {
        self_host: { currency: 'USD', monthly: 40, assumptions: ['hosting', 'maintenance time'] },
        managed: { currency: 'USD', monthly: 15 },
      },
    },
  ],
}

// ─── Tests ───

describe('migration contracts', () => {
  it('documents survive a JSON round-trip unchanged (plain-data guarantee)', () => {
    for (const doc of [rawIr, manifest, projectIr, handoff]) {
      expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)
    }
  })

  it('version constant stamps every root document', () => {
    expect(MIGRATION_CONTRACT_VERSION).toBe(1)
    for (const doc of [rawIr, manifest, projectIr, handoff]) {
      expect(doc.version).toBe(MIGRATION_CONTRACT_VERSION)
    }
  })

  it('source access ladder is ordered from least to most complete', () => {
    expect(SOURCE_ACCESS_LADDER).toEqual(['rest_public', 'rest_auth', 'wxr', 'bridge'])
    expectTypeOf<(typeof SOURCE_ACCESS_LADDER)[number]>().toEqualTypeOf<SourceAccessKind>()
  })

  it('capability vocabulary covers the launch-critical set', () => {
    for (const key of ['comments', 'seo', 'redirects', 'forms', 'media', 'i18n'] as const) {
      expect(CAPABILITY_KEYS).toContain(key)
    }
    expectTypeOf<(typeof CAPABILITY_KEYS)[number]>().toEqualTypeOf<CapabilityKey>()
  })

  it('component vocabulary covers the measured region classes', () => {
    for (const t of ['nav', 'related', 'comments', 'ads', 'author', 'taxonomy', 'card'] as const) {
      expect(COMPONENT_TYPES).toContain(t)
    }
    expectTypeOf<(typeof COMPONENT_TYPES)[number]>().toEqualTypeOf<ComponentType>()
  })

  it('menu targets narrow by kind', () => {
    const t = rawIr.menus![0]!.items[1]!.target
    if (t.kind === 'term') {
      expectTypeOf(t.taxonomy).toEqualTypeOf<string>()
      expect(t.slug).toBe('news')
    } else {
      throw new Error('expected a term target')
    }
    const url: RawMenuTarget = { kind: 'url', url: 'https://x', resolved: true }
    expect(url.resolved).toBe(true)
  })

  it('raw posts keep unresolved references marked, not dropped', () => {
    const post: RawPost = rawIr.posts[0]!
    expect(post.terms[0]!.resolved).toBe(true)
    expect(post.acf!.subtitle!.field_key).toMatch(/^field_/)
  })

  it('pagination is a route parameter, never a family', () => {
    const route: RouteModel = projectIr.routes[1]!
    expect(route.pattern).toContain(':page')
    expect(route.params!.some((p) => p.source === 'page_number')).toBe(true)
    // The paginated pattern maps to the same family as page 1 would.
    expect(route.family).toBe('f-archive')
  })

  it('families carry css strategy and the legacy layer name is stable', () => {
    const family: LayoutFamily = projectIr.families[1]!
    expectTypeOf(family.css.strategy).toEqualTypeOf<CssStrategy>()
    expect(LEGACY_CSS_LAYER).toBe('legacy')
  })

  it('query bindings encode order, count, and excerpt provenance', () => {
    const q: QueryBinding = projectIr.queries![0]!
    expect(q.order).toEqual({ by: 'date', direction: 'desc' })
    expect(q.per_page).toBe(12)
    expect(q.excerpt_source).toBe('content_first_paragraph')
  })

  it('runtime components are distinguishable from rest-derivable ones', () => {
    const byId = new Map(projectIr.components!.map((c) => [c.id, c]))
    expect((byId.get('c-comments') as ComponentDef).source).toBe('runtime')
    expect((byId.get('c-card') as ComponentDef).source).toBe('rest')
  })

  it('handoff offers carry the informed-decline apparatus', () => {
    const offer: HandoffOffer = handoff.offers![0]!
    expect(offer.provider).toBe('keep_wordpress')
    expect(offer.warning).toContain('stays live')
    expect(offer.cost_comparison!.self_host!.monthly).toBeGreaterThan(0)
  })
})
