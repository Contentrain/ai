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

  it('const: takes layout switches only, never text', () => {
    const p = plan()
    p.routes[0]!.sections.push({ component: 'Prose', bind: { kind: 'static', props: { body: 'const:Welcome to our studio, we build calm software' } } })
    p.routes[0]!.sections.push({ component: 'Prose', bind: { kind: 'static', props: { body: 'const:Hello' } } })
    const bad = validateProjectPlan(p).errors.filter(e => e.includes('is not a plan value'))
    expect(bad).toHaveLength(2)
    const ok = plan()
    ok.layout.header!.bind = { kind: 'static', props: { siteName: 'site:title', items: 'menu:primary', showName: 'const:true', columns: 'const:3', ratio: 'const:1.5', model: 'const:contact-form' } }
    expect(validateProjectPlan(ok).errors).toEqual([])
  })

  it('warns when two routes share a pattern without splitting one model', () => {
    const p = plan()
    p.routes.push({ id: 'landing', kind: 'custom', pattern: '/:slug/', template: 't9', body: 'rich-text', sections: [] })
    expect(validateProjectPlan(p).warnings).toContain('routes post, landing share the pattern /:slug/')
    // about + page on /:path/ split pages by wp_id: no warning (the fixture already has them).
    expect(validateProjectPlan(plan()).warnings).toEqual([])
  })

  it('plans every fact behavior once, with a reason when nothing reproduces it', () => {
    const p = withContactForm()
    expect(validateProjectPlan(p)).toEqual({ errors: [], warnings: [] })
    p.behaviors!.push(
      { fact: 'form:3fa9c21e', outcome: 'component', component: 'ContactForm', model: 'contact' },
      { fact: 'embed:1', outcome: 'component' },
      { fact: 'embed:2', outcome: 'component', component: 'Embed' },
      { fact: 'search:1', outcome: 'starter', feature: 'comments' as never },
      { fact: 'popup:1', outcome: 'needs_review' },
      { fact: 'counter:1', outcome: 'drop', reason: 'no reason given' },
      { fact: 'form:x', outcome: 'component', component: 'ContactForm', model: 'posts' },
      { fact: 'form:y', outcome: 'component', component: 'ContactForm', model: 'nope' },
    )
    expect(validateProjectPlan(p).errors).toEqual([
      'behavior form:3fa9c21e is planned twice',
      'behavior embed:1: outcome component names no component',
      'behavior embed:2: component Embed is not declared',
      'behavior search:1: starter feature comments is not one of search',
      'behavior popup:1: needs_review needs a reason "<code>: <sentence>"',
      'behavior counter:1: drop needs a reason "<code>: <sentence>"',
      'behavior form:x: model posts is not a form model',
      'behavior form:y: model nope is not declared',
    ])
  })

  it('keeps a form model a plan collection whose form names its own fields', () => {
    const p = withContactForm()
    const contact = p.models.find(m => m.id === 'contact')!
    contact.form = { ...contact.form!, exposedFields: ['name', 'fax'], requiredOverrides: { phone: true }, captcha: 'recaptcha' as never }
    p.models.push({ id: 'site', kind: 'singleton', origin: 'import', i18n: false, form: { enabled: true, public: true, exposedFields: [] } })
    expect(validateProjectPlan(p).errors).toEqual([
      'model contact: form field fax is not a model field',
      'model contact: form field phone is not a model field',
      'model contact: form captcha recaptcha is not turnstile',
      'model site: a form model must be a plan collection',
      'model site: form exposes no fields',
    ])
  })

  it('keeps a form model out of i18n: Studio writes every submission in the default locale', () => {
    const p = withContactForm()
    const contact = p.models.find(m => m.id === 'contact')!
    delete contact.i18n
    expect(validateProjectPlan(p).errors).toEqual(['model contact: a form model must be i18n: false (Studio writes submissions in the default locale)'])
    contact.i18n = true
    expect(validateProjectPlan(p).errors).toEqual(['model contact: a form model must be i18n: false (Studio writes submissions in the default locale)'])
  })
})

/** The fixture plus a CF7 contact form (→ ContactForm + a Studio form model), site search, a YouTube embed in a post, and a popup nobody can reproduce yet. */
function withContactForm(): ProjectPlan {
  const p = plan()
  p.components.push({ id: 'ContactForm', origin: 'kit', kit: { id: 'contact-form' } })
  p.models.push({
    id: 'contact', kind: 'collection', origin: 'plan', name: 'Contact', domain: 'forms', i18n: false, title_field: 'name',
    fields: { name: { type: 'string', required: true }, email: { type: 'email', required: true }, topic: { type: 'select', options: ['Sales', 'Support'] }, message: { type: 'text', required: true } },
    form: { enabled: true, public: true, exposedFields: ['name', 'email', 'topic', 'message'], honeypot: true, captcha: 'turnstile', notifications: true },
  })
  p.routes[0]!.sections.push({ component: 'ContactForm', bind: { kind: 'static', props: { model: 'const:contact' } } })
  p.behaviors = [
    { fact: 'form:3fa9c21e', outcome: 'component', component: 'ContactForm', model: 'contact' },
    { fact: 'search:5b6c7d8e', outcome: 'starter', feature: 'search' },
    { fact: 'embed:0c1d2e3f', outcome: 'prose' },
    { fact: 'interactive:9a8b7c6d', outcome: 'needs_review', reason: 'popup: exit-intent popups have no kit counterpart' },
  ]
  return p
}
