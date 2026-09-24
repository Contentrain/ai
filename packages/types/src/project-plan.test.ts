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
    menus: { primary: 'primary-menu', footer: 'footer-menu' },
    redirects: { '/old-about/': '/about/', '/gone/': { status: 410, destination: '/' } },
    tokens: { roles: { 'color-accent': '#9dff20', 'color-accent-ink': '#000000', 'font-sans': 'Inter, sans-serif', 'container-prose': '650px' } },
  },
  layout: {
    header: { component: 'Header', variant: { layout: 'split' }, bind: { kind: 'static', props: { siteName: 'site:title', items: 'menu:primary' } }, labels: { menuLabel: 'nav.menu' } },
  },
  models: [
    { id: 'posts', kind: 'collection', origin: 'import' },
    { id: 'pages', kind: 'collection', origin: 'import' },
    {
      id: 'about-features', kind: 'collection', origin: 'plan', name: 'About features', domain: 'pages', i18n: true, title_field: 'title',
      fields: { title: { type: 'string', required: true }, body: { type: 'markdown' }, icon: { type: 'image' } },
      extract: [
        { from: 'repeat:1x2y', pages: [11], entryId: 'about:index', fields: { title: '0.1|text', body: '0.2|text', icon: '0.0|src' } },
        { from: 'core/columns', pages: [12], entryId: 'services:index', rule: 'gutenberg:core/columns', fields: { title: 'dom:h2' } },
      ],
    },
  ],
  components: [
    { id: 'Header', origin: 'kit', kit: { id: 'header' } },
    { id: 'PostCard', origin: 'kit', kit: { id: 'post-card' } },
    { id: 'FeatureGrid', origin: 'kit', kit: { id: 'card-grid' } },
    { id: 'Prose', origin: 'site', props: { body: { type: 'markdown', required: true } }, brief: { template: 't3', regions: ['0.1.1.1'] } },
  ],
  routes: [
    { id: 'home', kind: 'home', pattern: '/', template: 't4', body: 'composed', sections: [
      { component: 'PostCard', variant: { layout: 'stacked' }, bind: { kind: 'collection', model: 'posts', sort: '-date', limit: 6, item: { title: 'field:title', image: 'media:featured_image', category: 'term:categories', href: 'href:self' } } },
    ] },
    { id: 'post', kind: 'post', pattern: '/:slug/', template: 't3', source: { model: 'posts' }, body: 'rich-text', sections: [
      { component: 'Prose', bind: { kind: 'entry', props: { body: 'field:content' } } },
    ] },
    { id: 'about', kind: 'page', pattern: '/:path/', template: 't2', source: { model: 'pages', where: { wp_id: [11] } }, body: 'composed', sections: [
      { component: 'FeatureGrid', bind: { kind: 'collection', model: 'about-features', into: 'items', item: { title: 'field:title', body: 'field:body', image: 'media:icon' } } },
    ] },
    { id: 'page', kind: 'page', pattern: '/:path/', template: 't2', source: { model: 'pages' }, body: 'rich-text', sections: [
      { component: 'Prose', bind: { kind: 'entry', props: { body: 'field:content' } } },
    ] },
  ],
  decisions: [{ id: 'field_type:repeat:1x2y:0.2|text', answer: 'markdown', by: 'rule' }],
})

describe('validateProjectPlan', () => {
  it('accepts a well-formed plan', () => {
    expect(validateProjectPlan(plan())).toEqual({ errors: [], warnings: [] })
  })

  it('catches broken references, permalinks, values and bindings', () => {
    const p = plan()
    p.site.permalinks.post = '/:slug'
    p.site.tokens.roles = { ...p.site.tokens.roles, 'color-brand': '#fff' } as never
    p.components.push({ id: 'hero', origin: 'kit' })
    p.routes[1]!.sections.push({ component: 'Missing', bind: { kind: 'static', props: {} } })
    p.routes[0]!.sections.push({ component: 'Prose', bind: { kind: 'entry', props: { body: 'field:content' } } })
    p.routes[1]!.sections[0] = { component: 'Prose', bind: { kind: 'entry', props: { text: 'content' as never } } }
    p.routes[2]!.sections[0] = { component: 'FeatureGrid', bind: { kind: 'collection', model: 'nope', into: 'items', item: { title: 'field:title' } } }
    p.models[2]!.extract![0]!.fields!.subtitle = '0.3|innerHTML'
    const { errors } = validateProjectPlan(p)
    expect(errors).toEqual(expect.arrayContaining([
      'site.permalinks.post must start and end with "/" (/:slug)',
      'tokens.roles.color-brand is not a kit role',
      'component hero is not a PascalCase name',
      'kit component hero names no kit id',
      'route post section 1: component Missing is not declared',
      'route home section 1: binds the route entry but the route has no source',
      'route post section 0: text = content is not a plan value (field: media: ref: href: term: ui: site: menu: page: const:)',
      'route post section 0: Prose has no prop text',
      'route post section 0: required prop Prose.body is not bound',
      'route about section 0: model nope is not declared',
      'model about-features extraction fills unknown field subtitle',
      'model about-features field subtitle: path 0.3|innerHTML is not "<path>|<prop>", "attr:<name>" or an element expression',
    ]))
  })

  it('requires what a Contentrain model needs of plan models', () => {
    const p = plan()
    p.models[2] = { ...p.models[2]!, name: undefined, title_field: 'icon' }
    expect(validateProjectPlan(p).errors).toEqual([
      'plan model about-features needs name and domain',
      'plan model about-features: title_field icon is image, not a text-like type',
    ])
    delete p.models[2]!.title_field
    expect(validateProjectPlan(p).errors).toContain('plan model about-features has no title_field')
  })

  it('gives every entry one address: disjoint wp_id sets and one catch-all per model', () => {
    const p = plan()
    p.routes.push({ id: 'landing', kind: 'page', pattern: '/:path/', template: 't5', source: { model: 'pages', where: { wp_id: [11, 12] } }, body: 'composed', sections: [] })
    p.routes.push({ id: 'page-2', kind: 'page', pattern: '/:path/', template: 't2', source: { model: 'pages' }, body: 'rich-text', sections: [] })
    const { errors } = validateProjectPlan(p)
    expect(errors).toContain('model pages: entry 11 is in routes about and landing')
    expect(errors).toContain('model pages: routes page, page-2 are all catch-alls')
  })

  it('requires a home route', () => {
    const p = plan()
    p.routes = p.routes.filter(r => r.kind !== 'home')
    expect(validateProjectPlan(p).errors).toContain('no home route')
  })
})
