import { describe, expect, it } from 'vitest'
import { fieldDepth, footerMenusOf, PROJECT_PLAN_FORMAT, validateProjectPlan, type ProjectPlan } from './project-plan.js'

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
    menus: { primary: 'primary-menu', footer: ['footer-menu', 'footer-legal'] },
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
  decisions: [
    { id: 'field_type:repeat:1x2y:0.2|text', answer: 'markdown', by: 'rule' },
    { id: 'plan:architect', answer: '3f2a9c1e7b04d586', by: 'sonnet', model: 'claude-sonnet-5' },
  ],
})

describe('validateProjectPlan', () => {
  it('accepts a well-formed plan', () => {
    expect(validateProjectPlan(plan())).toEqual({ errors: [], warnings: [] })
  })

  it('accepts the theme\'s type scale and section rhythm as roles', () => {
    const p = plan()
    p.site.tokens.roles = { ...p.site.tokens.roles, 'text-nav': '1.125rem', 'text-heading-1': 'clamp(2rem, 5vw, 3rem)', 'text-heading-2': '2rem', 'text-heading-3': '1.5rem', 'spacing-section': '5rem' }
    expect(validateProjectPlan(p).errors).toEqual([])
  })

  it('catches broken references, permalinks, values and bindings', () => {
    const p = plan()
    p.site.permalinks.post = '/:slug'
    p.site.tokens.roles = { ...p.site.tokens.roles, 'color-sparkle': '#fff' } as never
    p.components.push({ id: 'hero', origin: 'kit' })
    p.routes[1]!.sections.push({ component: 'Missing', bind: { kind: 'static', props: {} } })
    p.routes[0]!.sections.push({ component: 'Prose', bind: { kind: 'entry', props: { body: 'field:content' } } })
    p.routes[1]!.sections[0] = { component: 'Prose', bind: { kind: 'entry', props: { text: 'content' as never } } }
    p.routes[2]!.sections[0] = { component: 'FeatureGrid', bind: { kind: 'collection', model: 'nope', into: 'items', item: { title: 'field:title' } } }
    p.models[2]!.extract![0]!.fields!.subtitle = '0.3|innerHTML'
    const { errors } = validateProjectPlan(p)
    expect(errors).toEqual(expect.arrayContaining([
      'site.permalinks.post must start and end with "/" (/:slug)',
      'tokens.roles.color-sparkle is not a kit role',
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

  it('titles a page singleton by a section heading, one object deep', () => {
    const p = plan()
    const page = {
      id: 'page-about', kind: 'singleton', origin: 'plan', name: 'About page', domain: 'pages', i18n: true, title_field: 'hero.heading',
      fields: {
        hero: { type: 'object', required: true, fields: { heading: { type: 'string', required: true }, image: { type: 'image' } } },
        work: { type: 'array', items: { type: 'object', fields: { caption: { type: 'string' } } } },
      },
    } as (typeof p.models)[number]
    p.models.push(page)
    const titleErrors = () => validateProjectPlan(p).errors.filter(e => e.includes('page-about') && e.includes('title_field'))
    expect(titleErrors()).toEqual([])
    page.title_field = 'hero.image'
    expect(titleErrors()).toEqual(['plan model page-about: title_field hero.image is image, not a text-like type'])
    page.title_field = 'work.caption'
    expect(titleErrors()).toEqual(['plan model page-about: title_field work.caption goes through work (array), not an object field'])
    page.title_field = 'hero.heading.text'
    expect(titleErrors()).toEqual(['plan model page-about: title_field hero.heading.text reaches more than one object deep'])
    page.title_field = 'hero.title'
    expect(titleErrors()).toEqual(['plan model page-about: title_field hero.title is not one of its fields'])
  })

  it('gives every entry one address: disjoint wp_id sets and one catch-all per model', () => {
    const p = plan()
    p.routes.push({ id: 'landing', kind: 'page', pattern: '/:path/', template: 't5', source: { model: 'pages', where: { wp_id: [11, 12] } }, body: 'composed', sections: [] })
    p.routes.push({ id: 'page-2', kind: 'page', pattern: '/:path/', template: 't2', source: { model: 'pages' }, body: 'rich-text', sections: [] })
    const { errors } = validateProjectPlan(p)
    expect(errors).toContain('model pages: entry 11 is in routes about and landing')
    expect(errors).toContain('model pages: routes page, page-2 are all catch-alls')
  })

  it('takes up to four distinct footer menus', () => {
    const p = plan()
    p.site.menus.footer = ['a', 'b', 'a', '', 'c', 'd']
    expect(validateProjectPlan(p).errors).toEqual([
      'site.menus.footer has 6 menus; the footer takes at most 4',
      'site.menus.footer has an empty menu slug',
      'site.menus.footer names a menu twice',
    ])
    p.site.menus.footer = []
    expect(validateProjectPlan(p).errors).toEqual([])
  })

  it('still reads a plan written before footer menus were a list', () => {
    const p = plan()
    p.site.menus.footer = 'footer-menu'
    expect(validateProjectPlan(p).errors).toEqual([])
    expect(footerMenusOf(p.site)).toEqual(['footer-menu'])
    p.site.menus.footer = 'none'
    expect(validateProjectPlan(p).errors).toEqual([])
    expect(footerMenusOf(p.site)).toEqual([])
    p.site.menus.footer = ['a', 'b']
    expect(footerMenusOf(p.site)).toEqual(['a', 'b'])
  })

  it('accepts the layouts a plan carries for custom post types, by their single route id', () => {
    const p = plan()
    p.site.entryLayouts = { 'type-project': { adjacent: true } }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.entryLayouts = { 'type-project': { adjacent: 'yes' as unknown as boolean } }
    expect(validateProjectPlan(p).errors).toEqual(['site.entryLayouts.type-project.adjacent is not true or false'])
    p.site.entryLayouts = { 'type-project': { adjacent: false, more: 3 } }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.entryLayouts = { 'type-project': { adjacent: false, more: 21 } }
    expect(validateProjectPlan(p).errors).toEqual(['site.entryLayouts.type-project.more is not a count from 0 to 20'])
  })

  it('accepts and checks the footer the source prints: feed link, top border, copyright line or none', () => {
    const p = plan()
    p.site.footer = { feed: false, border: true, copyright: false }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.footer = { feed: true, border: false, copyright: '© {year} Golden Hearth Bakery' }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.footer = { feed: 'yes' as unknown as boolean, border: 1 as unknown as boolean, copyright: '<b>x</b>' }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.footer.feed is not a boolean',
      'site.footer.border is not a boolean',
      'site.footer.copyright is not false or a line of plain text (1–200 characters, no markup)',
    ])
    p.site.footer = { copyright: true as unknown as false }
    expect(validateProjectPlan(p).errors).toEqual(['site.footer.copyright is not false or a line of plain text (1–200 characters, no markup)'])
  })

  it('accepts and checks the interface text the source theme printed', () => {
    const p = plan()
    p.site.uiStrings = { 'blog.read_more': 'Devamını oku', 'nav.skip': 'İçeriğe geç' }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.uiStrings = { 'Read More': 'x', 'blog.read_more': '<b>x</b>', 'nav.skip': '  ' }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.uiStrings key Read More is not a ui-strings key',
      'site.uiStrings.blog.read_more is not a plain text of 1 to 200 characters',
      'site.uiStrings.nav.skip is not a plain text of 1 to 200 characters',
    ])
    p.site.uiStrings = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k.k${i}`, 'x']))
    expect(validateProjectPlan(p).errors).toEqual(['site.uiStrings holds more than 100 strings'])
  })

  it('accepts and checks the size the "more" list prints its titles at', () => {
    const p = plan()
    p.site.post = { header: ['title'], adjacent: false, more: 2, moreText: '21.7632px' }
    p.site.entryLayouts = { 'type-project': { adjacent: false, more: 2, moreText: 'clamp(1.5rem, 2vw, 2rem)' } }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.post = { header: ['title'], adjacent: false, more: 2, moreText: 'large' }
    p.site.entryLayouts = { 'type-project': { adjacent: false, more: 2, moreText: 'url(x)' } }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.post.moreText large is not a CSS size',
      'site.entryLayouts.type-project.moreText url(x) is not a CSS size',
    ])
  })

  it('accepts and checks what the source header does differently (it goes into style attributes)', () => {
    const p = plan()
    p.site.chrome = { header: { border: false, brandWeight: '400', brandTracking: '-0.5px', offsetTop: 'clamp(20px, calc(20px + (43.6px - 20px) * ((100vw - 390px) / 890)), 43.6px)', padTop: '0px', padBottom: '43px' } }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.chrome = { header: { brandTracking: 'normal' } }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.chrome = { header: { border: true as never, brandWeight: 'bold', brandTracking: '1px;x:y', offsetTop: 'url(x)', padTop: '1rem;background:red', padBottom: '-4px' } }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.chrome.header.border is not false',
      'site.chrome.header.brandWeight bold is not a font weight',
      'site.chrome.header.brandTracking 1px;x:y is not a letter spacing',
      'site.chrome.header.offsetTop url(x) is not a CSS size',
      'site.chrome.header.padTop 1rem;background:red is not a CSS size',
      'site.chrome.header.padBottom -4px is not a CSS size',
    ])
  })

  it('accepts and checks the size the previous/next links print at (it goes into a style attribute)', () => {
    const p = plan()
    p.site.post = { header: ['title'], adjacent: true, adjacentText: 'clamp(1rem, 1rem + ((1vw - 0.2rem) * 0.196), 1.125rem)', more: 0 }
    expect(validateProjectPlan(p).errors).toEqual([])
    for (const bad of ['medium', 'url(x)', '1rem;background:url(//evil/x)', '1rem} a{color:red', 'calc(1rem + url(x))']) {
      p.site.post = { header: ['title'], adjacent: true, adjacentText: bad, more: 0 }
      expect(validateProjectPlan(p).errors).toEqual([`site.post.adjacentText ${bad} is not a CSS size`])
    }
  })

  it('accepts and checks the list details copied from the source: the current post in "more", the muted tone', () => {
    const p = plan()
    p.site.post = { header: ['title'], adjacent: false, more: 2, moreIncludesCurrent: true }
    p.site.lists = { display: 'cards', heading: false, tone: 'muted' }
    p.site.entryLayouts = { 'type-project': { adjacent: false, more: 2, moreIncludesCurrent: true, moreOf: 'posts' } }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.post = { header: ['title'], adjacent: false, more: 2, moreIncludesCurrent: 'yes' as unknown as boolean }
    p.site.lists = { display: 'cards', heading: false, tone: 'loud' as 'muted' }
    p.site.entryLayouts = { 'type-project': { adjacent: false, moreIncludesCurrent: 1 as unknown as boolean, moreOf: 'pages' as 'posts' } }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.post.moreIncludesCurrent is not true or false',
      'site.lists.tone loud is not muted',
      'site.entryLayouts.type-project.moreIncludesCurrent is not true or false',
      'site.entryLayouts.type-project.moreOf pages is not posts',
    ])
  })

  it('checks the post layout and list display a plan copies from the source templates', () => {
    const p = plan()
    p.site.post = { header: ['title', 'cover', 'byline'], adjacent: true, more: 4 }
    p.site.lists = { display: 'full', heading: true }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.lists = { display: 'list', heading: false }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.lists = { display: 'cards', heading: false, surface: true, byline: true }
    p.site.tokens.roles = { 'color-page': 'rgb(240, 245, 250)', 'color-card': 'rgb(255, 255, 255)', 'shadow-card': 'rgba(16, 24, 40, 0.05) 0px 6px 15px -2px', 'spacing-card': '24px', 'color-brand': '#E67828', 'color-brand-ink': 'rgb(51, 51, 51)' }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.post = { header: ['title', 'title'], adjacent: false, more: 30 }
    p.site.lists = { display: 'grid' as 'cards', heading: false }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.post.header lists a part twice or one the starter does not have',
      'site.post.more is not a count from 0 to 20',
      'site.lists.display grid is not cards, list or full',
    ])
  })

  it('checks the list text size and the header and footer the source theme prints', () => {
    const p = plan()
    p.site.lists = { display: 'full', heading: true, text: 'clamp(1rem, 1rem + ((1vw - 0.2rem) * 0.196), 1.125rem)' }
    p.site.chrome = { brand: '2.5rem', tagline: true, copyright: 'All rights reserved', titleLinks: true, navLinks: true, footerAlign: 'center' }
    p.site.tokens.roles['color-link'] = '#c36'
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.lists.text = 'red; color: blue'
    p.site.chrome = { brand: 'clamp(url(x))', copyright: '<b>x</b>', navLinks: 'yes' as unknown as boolean, footerAlign: 'middle' as 'center' }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.lists.text red; color: blue is not a CSS size',
      'site.chrome.brand clamp(url(x)) is not a CSS size',
      'site.chrome.navLinks is not a boolean',
      'site.chrome.footerAlign middle is not start or center',
      'site.chrome.copyright is not a line of plain text (1–200 characters, no markup)',
    ])
  })

  it('checks the footer columns packed at the end edge', () => {
    const p = plan()
    p.site.chrome = { footerColumns: { gap: 128, size: 17.88, narrowGap: 63 } }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.chrome = { footerColumns: { gap: 128 } }
    expect(validateProjectPlan(p).errors).toEqual([])
    for (const footerColumns of [{ gap: -1 }, { gap: 128, size: 0 }, { gap: 128, narrowGap: 9999 }, { gap: Number.NaN }, { size: 16 } as unknown as { gap: number }]) {
      p.site.chrome = { footerColumns }
      expect(validateProjectPlan(p).errors, JSON.stringify(footerColumns)).toEqual(['site.chrome.footerColumns is not a gap (0–400 px), a link size (1–100 px) and a narrow gap (0–400 px)'])
    }
  })

  it('checks the frames the header, footer and lists are held to', () => {
    const p = plan()
    p.site.chrome = { frame: [{ min: 768, width: 600 }, { min: 1280, width: 1140 }], listFrame: [{ min: 768, width: 600 }], postFrame: [{ min: 1024, width: 630 }] }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.chrome = { frame: [{ min: 1280, width: 1140 }, { min: 768, width: 600 }], listFrame: [] }
    expect(validateProjectPlan(p).errors).toEqual([
      'site.chrome.frame steps are not whole pixel widths in ascending order of min',
      'site.chrome.listFrame is not a list of 1–8 steps',
    ])
    p.site.chrome = { postFrame: [{ min: 1024, width: 630 }, { min: 1024, width: 700 }] }
    expect(validateProjectPlan(p).errors).toEqual(['site.chrome.postFrame steps are not whole pixel widths in ascending order of min'])
    p.site.chrome = { listColumns: [{ min: 390, columns: 1 }, { min: 1280, columns: 3 }] }
    expect(validateProjectPlan(p).errors).toEqual([])
    p.site.chrome = { listColumns: [{ min: 768, columns: 0 }] }
    expect(validateProjectPlan(p).errors).toEqual(['site.chrome.listColumns steps are not a whole pixel min in ascending order and 1–6 columns'])
    p.site.chrome = { frame: [{ min: 768, width: 0 }] }
    expect(validateProjectPlan(p).errors).toEqual(['site.chrome.frame steps are not whole pixel widths in ascending order of min'])
  })

  it('takes a section width of content or wide', () => {
    const p = plan()
    p.routes[1]!.sections[0]!.width = 'content'
    expect(validateProjectPlan(p).errors).toEqual([])
    p.routes[1]!.sections[0]!.width = 'full' as 'wide'
    expect(validateProjectPlan(p).errors.some(e => e.endsWith('width full is not content or wide'))).toBe(true)
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

  it('builds a page from its singleton: section bindings, extraction into a section field, route page', () => {
    const p = plan()
    p.models.push({
      id: 'page-about', kind: 'singleton', origin: 'plan', name: 'About page', domain: 'pages',
      fields: {
        hero: { type: 'object', fields: {
          heading: { type: 'string', required: true }, lead: { type: 'text' },
          actions: { type: 'array', items: { type: 'object', fields: { label: { type: 'string' }, href: { type: 'url' } } } },
          image: { type: 'object', fields: { src: { type: 'image' }, alt: { type: 'string' } } },
        } },
      },
      extract: [{ from: 'core/cover', pages: [11], entryId: 'page-about', field: 'hero', rule: 'gutenberg:section:hero.cover', fields: { heading: 'attr:title' } }],
    })
    p.components.push({ id: 'Hero', origin: 'kit', kit: { id: 'hero' } })
    const about = p.routes[2]!
    about.page = 'page-about'
    about.sections = [{ id: 'hero', rule: 'gutenberg:section:hero.cover', component: 'Hero', variant: { layout: 'split' }, bind: { kind: 'section', model: 'page-about', field: 'hero' } }]
    expect(validateProjectPlan(p)).toEqual({ errors: [], warnings: [] })

    about.sections.push({ id: 'hero', rule: 'jew', component: 'Hero', bind: { kind: 'section', model: 'page-about', field: 'story' } })
    p.models.at(-1)!.extract![0]!.field = 'story'
    const page = p.routes[3]!
    page.page = 'posts'
    const { errors } = validateProjectPlan(p)
    expect(errors).toEqual(expect.arrayContaining([
      'route about section 1: rule jew is not <builder>:section:<id>, <builder>:element:<match>, opus or prose',
      'route about section 1: page-about has no field story',
      'route about: section id hero is used twice',
      'model page-about extraction from core/cover fills story, which is not an object field',
      'route page: page posts is a collection; a page is a singleton, or a collection that is the route\'s source',
      'route page: a page model needs body composed',
    ]))
  })

  it('takes fixed props and element rules on a section, and a template route\'s own entry', () => {
    const p = plan()
    p.models.push({ id: 'service-pages', kind: 'collection', origin: 'plan', name: 'Service pages', domain: 'pages', title_field: 'title', fields: {
      title: { type: 'string', required: true },
      hero: { type: 'object', fields: { heading: { type: 'string', required: true }, image_alt: { type: 'string' } } },
    }, extract: [{ from: 'elementor/image-box', pages: [21, 22], entryId: 'page-slug', field: 'hero', rule: 'elementor:element:elementor/image-box', fields: { heading: 'dom:h3' } }] })
    p.components.push({ id: 'Split', origin: 'site', props: { heading: { type: 'string', required: true }, imageAlt: { type: 'string' }, tone: { type: 'string' } }, brief: { template: 't2', regions: ['0.0'] } })
    p.routes.push({ id: 'service', kind: 'page', pattern: '/services/:slug/', template: 't2', source: { model: 'service-pages' }, page: 'service-pages', body: 'composed', sections: [
      { id: 'hero', rule: 'elementor:element:elementor/image-box', component: 'Split', bind: { kind: 'section', model: 'service-pages', field: 'hero', props: { tone: 'const:muted' } } },
    ] })
    expect(validateProjectPlan(p)).toEqual({ errors: [], warnings: [] })

    const hero = p.routes.at(-1)!.sections[0]!
    hero.bind = { kind: 'section', model: 'service-pages', field: 'hero', props: { tone: 'muted' as never, width: 'const:wide' } }
    hero.rule = 'gutenberg:element:core/template-part:header'
    p.routes.at(-1)!.source = { model: 'pages' }
    const { errors } = validateProjectPlan(p)
    expect(errors).toEqual(expect.arrayContaining([
      'route service section 0: section of service-pages names no entry and service-pages is neither a singleton nor this route\'s page',
      'route service section 0: tone = muted is not a plan value (field: media: ref: href: term: ui: site: menu: page: const:)',
      'route service section 0: Split has no prop width',
      'route service: page service-pages is a collection; a page is a singleton, or a collection that is the route\'s source',
    ]))
    expect(errors.join('\n')).not.toContain('rule')
  })

  it('keeps a section field at depth 2 and its keys the component\'s props in snake_case', () => {
    const p = plan()
    p.models.push({ id: 'page-home', kind: 'singleton', origin: 'plan', name: 'Home', domain: 'pages', fields: {
      services: { type: 'object', fields: { items: { type: 'array', items: { type: 'object', fields: { title: { type: 'string' }, image: { type: 'object', fields: { src: { type: 'image' } } } } } } } },
      intro: { type: 'object', fields: { text: { type: 'markdown' }, image_alt: { type: 'string' }, imageAlt: { type: 'string' } } },
    } })
    p.components.push({ id: 'Intro', origin: 'site', props: { body: { type: 'markdown' }, imageAlt: { type: 'string' } }, brief: { template: 't4', regions: ['0.0'] } })
    p.routes[0]!.sections.push(
      { id: 'services', component: 'FeatureGrid', bind: { kind: 'section', model: 'page-home', field: 'services' } },
      { id: 'intro', component: 'Intro', bind: { kind: 'section', model: 'page-home', field: 'intro' } },
    )
    const { errors } = validateProjectPlan(p)
    expect(errors).toEqual(expect.arrayContaining([
      'route home section 1: page-home.services nests deeper than 2 (an object inside a list item\'s object)',
      'route home section 2: Intro has no prop for field page-home.intro.text (fields are the props in snake_case)',
      'route home section 2: Intro has no prop for field page-home.intro.imageAlt (fields are the props in snake_case)',
    ]))
    expect(errors.join('\n')).not.toContain('intro.image_alt')
  })

  it('counts object levels, not lists', () => {
    expect(fieldDepth({ type: 'string' })).toBe(0)
    expect(fieldDepth({ type: 'array', items: 'string' })).toBe(0)
    expect(fieldDepth({ type: 'object', fields: { a: { type: 'string' } } })).toBe(1)
    expect(fieldDepth({ type: 'object', fields: { a: { type: 'array', items: { type: 'object', fields: { b: { type: 'url' } } } } } })).toBe(2)
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
