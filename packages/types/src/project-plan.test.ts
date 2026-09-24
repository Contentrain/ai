import { describe, expect, it } from 'vitest'
import { PROJECT_PLAN_FORMAT, validateProjectPlan, type ProjectPlan } from './project-plan.js'

/** A small blog with a composed About page — the shape the planner writes for a block-theme site. */
const plan = (): ProjectPlan => ({
  format: PROJECT_PLAN_FORMAT,
  source: { origin: 'https://example.com', builder: 'gutenberg', facts: 'abc123', mapping: 'gutenberg@1' },
  site: {
    url: 'https://example.com',
    title: 'Example',
    locale: 'en',
    permalinks: { post: '/:slug/', page: '/:path/', category: '/category/:slug/', tag: '/tag/:slug/', author: '/author/:slug/', blog: '/' },
    home: { kind: 'posts' },
    postsPerPage: 6,
    menus: { primary: 'primary', footer: 'footer' },
    redirects: { '/old-about/': '/about/', '/gone/': { status: 410, destination: '/' } },
    tokens: { roles: { 'color-accent': '#9dff20', 'color-accent-ink': '#000000', 'font-sans': 'Inter, sans-serif', 'container-prose': '650px' } },
  },
  models: [
    { id: 'posts', kind: 'collection', origin: 'import' },
    { id: 'pages', kind: 'collection', origin: 'import' },
    {
      id: 'about-features', kind: 'collection', origin: 'plan',
      fields: { title: { type: 'string', required: true }, body: { type: 'markdown' }, icon: { type: 'image' } },
      extract: [{ from: 'repeat:1x2y', pages: [11], entryId: 'about:index', fields: { title: '0.1|text', body: '0.2|text', icon: '0.0|src' } }],
    },
  ],
  components: [
    { id: 'Header', origin: 'kit', kit: { id: 'header' }, props: { title: { type: 'string', required: true } } },
    { id: 'PostCard', origin: 'kit', kit: { id: 'post-card', variant: { layout: 'stacked' } }, props: { title: { type: 'string', required: true }, image: { type: 'image' }, date: { type: 'date' }, href: { type: 'url', required: true } } },
    { id: 'FeatureGrid', origin: 'kit', kit: { id: 'card-grid' }, props: { items: { type: 'array', required: true } } },
    { id: 'Prose', origin: 'kit', kit: { id: 'prose' }, props: { body: { type: 'markdown', required: true } } },
  ],
  routes: [
    { id: 'home', kind: 'home', pattern: '/', template: 't4', body: 'composed', sections: [
      { component: 'Header', region: 'header', bind: { kind: 'model', model: 'site', props: { title: 'title' } } },
      { component: 'PostCard', bind: { kind: 'collection', model: 'posts', sort: '-date', limit: 6, item: { title: 'title', image: 'featured_image', date: 'date', href: 'slug' } } },
    ] },
    { id: 'post', kind: 'post', pattern: '/:slug/', template: 't3', source: { model: 'posts' }, body: 'rich-text', sections: [
      { component: 'Prose', bind: { kind: 'entry', props: { body: 'content' } } },
    ] },
    { id: 'about', kind: 'page', pattern: '/about/', template: 't2', source: { model: 'pages', where: { slug: 'about' } }, body: 'composed', sections: [
      { component: 'FeatureGrid', bind: { kind: 'collection', model: 'about-features', item: { items: 'title' } } },
    ] },
  ],
  decisions: [{ id: 'field_type:repeat:1x2y:0.2|text', answer: 'markdown', by: 'rule' }],
})

describe('validateProjectPlan', () => {
  it('accepts a well-formed plan', () => {
    expect(validateProjectPlan(plan())).toEqual({ errors: [], warnings: [] })
  })

  it('catches broken references, permalinks and bindings', () => {
    const p = plan()
    p.site.permalinks.post = '/:slug'
    p.site.tokens.roles = { ...p.site.tokens.roles, 'color-brand': '#fff' } as never
    p.components.push({ id: 'hero', origin: 'kit', props: {} })
    p.routes[1]!.sections.push({ component: 'Missing', bind: { kind: 'static', props: {} } })
    p.routes[0]!.sections.push({ component: 'Prose', bind: { kind: 'entry', props: { body: 'content' } } })
    p.routes[2]!.sections[0] = { component: 'FeatureGrid', bind: { kind: 'collection', model: 'nope', item: { cards: 'title' } } }
    p.models[2]!.extract![0]!.fields.subtitle = '0.3|innerHTML'
    const { errors } = validateProjectPlan(p)
    expect(errors).toEqual(expect.arrayContaining([
      'site.permalinks.post must start and end with "/" (/:slug)',
      'tokens.roles.color-brand is not a kit role',
      'component hero is not a PascalCase name',
      'kit component hero names no kit id',
      'route post section 1: component Missing is not declared',
      'route home section 2: binds the route entry but the route has no source',
      'route about section 0: model nope is not declared',
      'route about section 0: FeatureGrid has no prop cards',
      'route about section 0: required prop FeatureGrid.items is not bound',
      'model about-features extraction fills unknown field subtitle',
      'model about-features field subtitle: path 0.3|innerHTML is not "<path>|<prop>" or "attr:<name>"',
    ]))
  })

  it('requires a home route', () => {
    const p = plan()
    p.routes = p.routes.filter(r => r.kind !== 'home')
    expect(validateProjectPlan(p).errors).toContain('no home route')
  })
})
