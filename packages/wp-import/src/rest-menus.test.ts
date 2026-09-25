import { describe, it, expect } from 'vitest'
import { blockMenus, classicMenus, inlineMenus, navigationItems, navigationLocations, parseBlocks, plainPostId, usedParts, type MenuContext } from './rest-menus'
import { fetchRestRawIR, parseWxr, rawToContentrain } from './index'
import { FIXTURE } from './wxr.test'

const ctx: MenuContext = {
  origin: 'https://s.example',
  postSlug: (id) => ({ 11: 'about', 12: 'team', 10: 'one' } as Record<number, string>)[id],
  termSlug: (taxonomy, id) => (taxonomy === 'category' && id === 2 ? 'news' : undefined),
  pages: [
    { id: 11, parent: null, menu_order: 1, title: 'About', link: 'https://s.example/about/', slug: 'about' },
    { id: 12, parent: 11, menu_order: 0, title: 'Team', link: 'https://s.example/about/team/', slug: 'team' },
    { id: 13, parent: null, menu_order: 0, title: 'Contact', link: 'https://s.example/contact/', slug: 'contact' },
  ],
}

const NAV = '<!-- wp:navigation-link {"label":"Blog","url":"/","kind":"custom","isTopLevelLink":true} /-->'
  + '<!-- wp:navigation-submenu {"label":"About","type":"page","id":11,"url":"/about/","kind":"post-type"} -->'
  + '<!-- wp:navigation-link {"label":"Team","type":"page","id":12,"url":"/about/team/","kind":"post-type","opensInNewTab":true} /-->'
  + '<!-- /wp:navigation-submenu -->'
  + '<!-- wp:navigation-link {"label":"News","type":"category","id":2,"url":"/category/news/","kind":"taxonomy"} /-->'
  + '<!-- wp:search {"label":"Search"} /-->'

describe('block navigation', () => {
  it('parses nested block markup', () => {
    const tree = parseBlocks(NAV)
    expect(tree.map((b) => b.name)).toEqual(['core/navigation-link', 'core/navigation-submenu', 'core/navigation-link', 'core/search'])
    expect(tree[1]!.children.map((b) => b.attrs.label)).toEqual(['Team'])
  })

  it('turns links and submenus into items with targets, nesting and negative ids', () => {
    let n = 0
    const items = navigationItems(NAV, ctx, () => -++n)
    expect(items.map((i) => [i.id, i.title, i.parent])).toEqual([[-1, 'Blog', null], [-2, 'About', null], [-3, 'Team', -2], [-4, 'News', null]])
    expect(items[0]).toMatchObject({ url: 'https://s.example/', target: { kind: 'url', url: 'https://s.example/', resolved: true } })
    expect(items[1]!.target).toEqual({ kind: 'post', post_type: 'page', id: 11, slug: 'about', resolved: true })
    expect(items[2]).toMatchObject({ target_attr: '_blank', url: 'https://s.example/about/team/' })
    expect(items[3]!.target).toEqual({ kind: 'term', taxonomy: 'category', id: 2, slug: 'news', resolved: true })
  })

  it('expands a page list into the published pages, nested by parent', () => {
    let n = 0
    const items = navigationItems('<!-- wp:home-link {"label":"Start"} /--><!-- wp:page-list /-->', ctx, () => -++n)
    expect(items.map((i) => [i.title, i.parent])).toEqual([['Start', null], ['Contact', null], ['About', null], ['Team', -3]])
  })

  it('finds each navigation\'s template-part area; an empty navigation block without ref shows the latest one, an inline one none', () => {
    const navs = [{ id: 5, date_gmt: '2026-01-01T00:00:00' }, { id: 9, date_gmt: '2026-02-01T00:00:00' }]
    const parts = [
      { area: 'header', content: { raw: '<!-- wp:group --><!-- wp:navigation /--><!-- /wp:group -->' } },
      { area: 'footer', content: { raw: '<!-- wp:navigation {"ref":5,"overlayMenu":"never"} /-->' } },
      { area: 'uncategorized', content: { raw: '<!-- wp:navigation {"ref":5} /-->' } },
      { area: 'footer', content: { raw: '<!-- wp:navigation {"overlayMenu":"never"} --><!-- wp:navigation-link {"label":"Blog","url":"#"} /--><!-- /wp:navigation -->' } },
    ]
    expect([...navigationLocations(parts, navs)]).toEqual([[9, ['header']], [5, ['footer']]])
  })

  it('keeps only published navigations and keeps slugs unique against classic menus', () => {
    const menus = blockMenus([
      { id: 9, slug: 'main', status: 'publish', title: { raw: 'Header nav' }, content: { raw: NAV } },
      { id: 8, slug: 'old', status: 'draft', title: { raw: 'Old' }, content: { raw: NAV } },
    ], [{ area: 'header', content: { raw: '<!-- wp:navigation {"ref":9} /-->' } }], ctx, new Set(['main']))
    expect(menus).toHaveLength(1)
    expect(menus[0]).toMatchObject({ id: 9, slug: 'main-nav', name: 'Header nav', locations: ['header'] })
    expect(menus[0]!.items).toHaveLength(4)
  })
})

// Twenty Twenty-Five's footer, as REST serves the template part (its pattern already expanded): two inline navigations.
const TT5_FOOTER = '<!-- wp:group {"layout":{"type":"constrained"}} --><!-- wp:columns --><!-- wp:column -->'
  + '<!-- wp:navigation {"overlayMenu":"never","layout":{"type":"flex","orientation":"vertical"}} -->'
  + '<!-- wp:navigation-link {"label":"Blog","url":"#"} /--><!-- wp:navigation-link {"label":"About","url":"#"} /--><!-- wp:navigation-link {"label":"FAQs","url":"#"} /--><!-- wp:navigation-link {"label":"Authors","url":"#"} /-->'
  + '<!-- /wp:navigation --><!-- /wp:column --><!-- wp:column -->'
  + '<!-- wp:navigation {"overlayMenu":"never","layout":{"type":"flex","orientation":"vertical"}} -->'
  + '<!-- wp:navigation-link {"label":"Events","url":"#"} /--><!-- wp:navigation-submenu {"label":"Shop","url":"/shop/"} --><!-- wp:navigation-link {"label":"Gift cards","url":"/shop/gift-cards/"} /--><!-- /wp:navigation-submenu -->'
  + '<!-- wp:navigation-link {"label":"Secret launch","type":"page","id":99,"url":"/?page_id=99","kind":"post-type"} /-->'
  + '<!-- /wp:navigation --><!-- /wp:column --><!-- /wp:columns --><!-- /wp:group -->'
const TEMPLATES = [{ slug: 'index', content: { raw: '<!-- wp:template-part {"slug":"header","area":"header"} /--><!-- wp:group --><!-- wp:template-part {"slug":"footer","area":"footer"} /--><!-- /wp:group -->' } }]

describe('inline navigation in template parts', () => {
  it('counts only the parts a template uses; without templates, the part named after its area', () => {
    const parts = [
      { slug: 'header', area: 'header' }, { slug: 'header-large-title', area: 'header' },
      { slug: 'footer', area: 'footer' }, { slug: 'footer-columns', area: 'footer' }, { area: 'footer' },
    ]
    expect(usedParts(parts, TEMPLATES).map((p) => p.slug)).toEqual(['header', 'footer', undefined])
    expect(usedParts(parts).map((p) => p.slug)).toEqual(['header', 'footer', undefined])
    expect(usedParts(parts, [{ slug: 'page', content: { raw: '<!-- wp:template-part {"slug":"footer-columns"} /-->' } }]).map((p) => p.slug)).toEqual(['footer-columns', undefined])
  })

  it('turns each inline navigation of a used part into a menu of its area: order, nesting, # links kept; hidden targets left out', () => {
    let n = 0
    const dropped = { count: 0 }
    const menus = inlineMenus(usedParts([{ slug: 'footer', area: 'footer', content: { raw: TT5_FOOTER } }], TEMPLATES), ctx, new Set(), () => -++n, dropped)
    expect(menus.map((m) => [m.slug, m.name, m.locations])).toEqual([['footer-navigation-1', 'Footer navigation 1', ['footer']], ['footer-navigation-2', 'Footer navigation 2', ['footer']]])
    expect(menus[0]!.items.map((i) => [i.title, i.url, i.parent])).toEqual([['Blog', '#', null], ['About', '#', null], ['FAQs', '#', null], ['Authors', '#', null]])
    const shop = menus[1]!.items.find((i) => i.title === 'Shop')!
    expect(menus[1]!.items.map((i) => [i.title, i.parent])).toEqual([['Events', null], ['Shop', null], ['Gift cards', shop.id]])
    expect(menus[1]!.items[2]!.url).toBe('https://s.example/shop/gift-cards/')
    // Page 99 is not proven public: its link (and title) stays out.
    expect(JSON.stringify(menus)).not.toContain('Secret launch')
    expect(dropped.count).toBe(1)
    expect(menus.every((m) => (m.id ?? 0) < 0 && m.items.every((i) => i.id < 0))).toBe(true)
  })

  it('names a navigation by its aria label, skips an empty or referenced one, and keeps slugs unique', () => {
    let n = 0
    const raw = '<!-- wp:navigation {"ariaLabel":"Legal"} --><!-- wp:navigation-link {"label":"Privacy","url":"/privacy/"} /--><!-- /wp:navigation -->'
      + '<!-- wp:navigation {"ref":5} /--><!-- wp:navigation /-->'
    const menus = inlineMenus([{ slug: 'footer', area: 'footer', content: { raw } }], ctx, new Set(['legal']), () => -++n)
    expect(menus.map((m) => [m.slug, m.name])).toEqual([['legal-2', 'Legal']])
  })

  it('reads with the wp_navigation menus, only from used parts', () => {
    const parts = [
      { slug: 'header', area: 'header', content: { raw: '<!-- wp:navigation {"ref":9} /-->' } },
      { slug: 'footer', area: 'footer', content: { raw: TT5_FOOTER } },
      { slug: 'footer-columns', area: 'footer', content: { raw: TT5_FOOTER.replace('Blog', 'Unused') } },
    ]
    const menus = blockMenus([{ id: 9, slug: 'navigation', status: 'publish', title: { raw: 'Header' }, content: { raw: NAV } }], parts, ctx, new Set(), { count: 0 }, TEMPLATES)
    expect(menus.map((m) => [m.slug, m.locations])).toEqual([['navigation', ['header']], ['footer-navigation-1', ['footer']], ['footer-navigation-2', ['footer']]])
    expect(JSON.stringify(menus)).not.toContain('Unused')
    // Item ids stay unique across the wp_navigation menu and the inline ones.
    const ids = menus.flatMap((m) => m.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('follows a part inside a used part (once each); a navigation that refers to a draft wp_navigation shows nothing', () => {
    const parts = [
      { slug: 'header', area: 'header', content: { raw: '<!-- wp:group --><!-- wp:template-part {"slug":"site-nav"} /--><!-- wp:template-part {"slug":"header"} /--><!-- /wp:group -->' } },
      { slug: 'site-nav', area: 'uncategorized', content: { raw: '<!-- wp:navigation --><!-- wp:navigation-link {"label":"Docs","url":"/docs/"} /--><!-- /wp:navigation --><!-- wp:navigation {"ref":8} /-->' } },
      { slug: 'footer', area: 'footer', content: { raw: '<!-- wp:navigation {"ref":8} /-->' } },
    ]
    const menus = blockMenus([{ id: 8, slug: 'old', status: 'draft', title: { raw: 'Old plans' }, content: { raw: NAV } }], parts, ctx, new Set(), { count: 0 }, TEMPLATES)
    expect(menus.map((m) => [m.slug, m.locations, m.items.map((i) => i.title)])).toEqual([['header-navigation', ['header'], ['Docs']]])
    expect(JSON.stringify(menus)).not.toContain('Old plans')
  })

  it('stores an inline menu with its area and claims no WordPress id for it', async () => {
    let n = 0
    const { raw } = await parseWxr(FIXTURE)
    raw.menus = inlineMenus([{ slug: 'footer', area: 'footer', content: { raw: TT5_FOOTER } }], ctx, new Set(), () => -++n)
    const { files } = rawToContentrain(raw)
    const file = Object.keys(files).find((f) => f.includes('content/') && f.includes('/menus/'))!
    const stored = Object.values(JSON.parse(files[file]!)) as Array<Record<string, unknown>>
    expect(stored.map((m) => [m.name, m.locations, 'wp_id' in m]).toSorted((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([['Footer navigation 1', ['footer'], false], ['Footer navigation 2', ['footer'], false]])
  })
})

describe('unpublished targets never reach a menu', () => {
  it('leaves out classic items that are drafts or point at hidden content, moving their children up', () => {
    const dropped = { count: 0 }
    const [menu] = classicMenus([{ id: 3, name: 'Main', slug: 'main' }], [
      { id: 30, title: { raw: '', rendered: 'Secret plan' }, type: 'post_type', object: 'page', object_id: 14, parent: 0, menu_order: 1, url: 'https://s.example/?page_id=14', menus: 3, status: 'publish' },
      { id: 31, title: { raw: 'Under the secret' }, type: 'post_type', object: 'page', object_id: 11, parent: 30, menu_order: 2, url: 'https://s.example/about/', menus: 3, status: 'publish' },
      { id: 32, title: { raw: 'Unsaved item' }, type: 'custom', object: 'custom', parent: 0, menu_order: 3, url: 'https://x.example/', menus: 3, status: 'draft' },
    ], ctx, dropped)
    expect(menu!.items.map((i) => [i.id, i.parent, i.parent_unresolved])).toEqual([[31, null, undefined]])
    expect(dropped.count).toBe(2)
    expect(JSON.stringify(menu)).not.toMatch(/Secret plan|page_id=14|Unsaved/)
  })

  it('leaves out an item whose target this import never read (fail-closed): no title, no address', () => {
    const dropped = { count: 0 }
    const [menu] = classicMenus([{ id: 3, name: 'Main', slug: 'main' }], [
      { id: 40, title: { raw: '', rendered: 'Beyond the page cap' }, type: 'post_type', object: 'page', object_id: 999, parent: 0, menu_order: 1, url: 'https://s.example/beyond/', menus: 3, status: 'publish' },
      { id: 41, title: { raw: 'Zero id' }, type: 'post_type', object: 'team_member', object_id: 0, parent: 0, menu_order: 2, url: 'https://s.example/team/x/', menus: 3, status: 'publish' },
    ], ctx, dropped)
    expect(menu!.items).toEqual([])
    expect(dropped.count).toBe(2)
    let n = 0
    const block = navigationItems('<!-- wp:navigation-link {"label":"Beyond","type":"page","id":999,"url":"/beyond/","kind":"post-type"} /-->', ctx, () => -++n, dropped)
    expect(block).toEqual([])
    expect(JSON.stringify([menu, block])).not.toMatch(/Beyond|beyond|Zero/)
  })

  it('leaves out block links to hidden content; a hidden submenu\'s links take its place', () => {
    let n = 0
    const dropped = { count: 0 }
    const items = navigationItems(
      '<!-- wp:navigation-link {"label":"Secret plan","type":"page","id":14,"url":"/secret-plan/","kind":"post-type"} /-->'
      + '<!-- wp:navigation-submenu {"label":"Secret hub","type":"page","id":14,"url":"/secret-plan/","kind":"post-type"} -->'
      + '<!-- wp:navigation-link {"label":"Team","type":"page","id":12,"url":"/about/team/","kind":"post-type"} /-->'
      + '<!-- /wp:navigation-submenu -->',
      ctx, () => -++n, dropped)
    expect(items.map((i) => [i.title, i.parent])).toEqual([['Team', null]])
    expect(dropped.count).toBe(2)
    expect(JSON.stringify(items)).not.toMatch(/Secret|secret-plan/)
  })
})

describe('custom links to a plain permalink', () => {
  it('name the post they point at, on this site only', () => {
    expect(plainPostId('/?page_id=14', ctx.origin)).toBe(14)
    expect(plainPostId('https://s.example/?p=10&preview=true', ctx.origin)).toBe(10)
    expect(plainPostId('https://other.example/?p=10', ctx.origin)).toBeUndefined()
    expect(plainPostId('/about/', ctx.origin)).toBeUndefined()
    expect(plainPostId('/?s=bread', ctx.origin)).toBeUndefined()
  })

  it('are left out when that post is not proven public — block and classic menus alike', () => {
    let n = 0
    const dropped = { count: 0 }
    const block = navigationItems('<!-- wp:navigation-link {"label":"Secret plan","url":"/?page_id=14","kind":"custom"} /--><!-- wp:navigation-link {"label":"About","url":"/?page_id=11","kind":"custom"} /--><!-- wp:navigation-link {"label":"Search","url":"/?s=bread"} /-->', ctx, () => -++n, dropped)
    expect(block.map((i) => i.title)).toEqual(['About', 'Search'])
    const classic = classicMenus([{ id: 1, slug: 'main', name: 'Main' }], [
      { id: 20, menus: 1, type: 'custom', url: 'https://s.example/?p=99', title: { raw: 'Unreleased post' }, menu_order: 1 },
      { id: 21, menus: 1, type: 'custom', url: 'https://s.example/?p=10', title: { raw: 'One' }, menu_order: 2 },
    ], ctx, dropped)
    expect(classic[0]!.items.map((i) => i.title)).toEqual(['One'])
    expect(dropped.count).toBe(2)
  })
})

describe('classic menus', () => {
  it('groups items by menu, orders them, resolves targets and carries locations', () => {
    const menus = classicMenus(
      [{ id: 3, name: 'Main &amp; more', slug: 'main', locations: ['primary'] }, { id: 4, name: 'Footer', slug: 'footer', locations: [] }],
      [
        { id: 21, title: { raw: '', rendered: 'About' }, type: 'post_type', object: 'page', object_id: 11, parent: 0, menu_order: 2, url: 'https://s.example/about/', menus: 3, status: 'publish' },
        { id: 20, title: { raw: 'Home' }, type: 'custom', object: 'custom', object_id: 20, parent: 0, menu_order: 1, url: 'https://s.example/', menus: 3, target: '_blank', classes: ['', 'cta'] },
        { id: 22, title: { raw: 'Projects' }, type: 'post_type_archive', object: 'project', parent: 21, menu_order: 3, url: 'https://s.example/projects/', menus: 3 },
        { id: 23, title: { raw: 'Custom' }, type: 'custom', object: 'custom', parent: 77, menu_order: 1, url: '', menus: 4 },
      ],
      ctx,
    )
    expect(menus.map((m) => [m.slug, m.name, m.locations])).toEqual([['main', 'Main & more', ['primary']], ['footer', 'Footer', undefined]])
    expect(menus[0]!.items.map((i) => [i.id, i.title, i.target.kind])).toEqual([[20, 'Home', 'url'], [21, 'About', 'post'], [22, 'Projects', 'archive']])
    expect(menus[0]!.items[0]).toMatchObject({ target_attr: '_blank', classes: ['cta'] })
    expect(menus[0]!.items[2]!.parent).toBe(21)
    expect(menus[1]!.items[0]).toMatchObject({ parent_unresolved: true, url: null, target: { kind: 'unknown', resolved: false } })
  })
})

// ── fetchRestRawIR ──────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function site(opts: { menus?: number } = {}): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = []
  const fetchImpl = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const u = String(url)
    const auth = !!(init?.headers as Record<string, string>)?.authorization
    calls.push(u + (auth ? ' [auth]' : ''))
    if (u.includes('/users/me')) return json({ id: 1 })
    if (u.includes('/types')) return json({ page: { slug: 'page', rest_base: 'pages' } })
    if (u.includes('/pages?')) {
      const pages = [{ id: 11, slug: 'about', status: 'publish', link: 'https://s.example/about/', title: { rendered: 'About' }, content: { rendered: '' }, parent: 0 }]
      return json(auth ? [...pages, { id: 14, slug: 'secret-plan', status: 'draft', link: 'https://s.example/?page_id=14', title: { rendered: 'Secret plan' }, content: { rendered: '' }, parent: 0 }] : pages)
    }
    if (/\/(menus|menu-items|navigation|template-parts)\?/.test(u)) {
      if (!auth) return json({ code: 'rest_cannot_view' }, 401)
      if (opts.menus && !u.includes('/template-parts?')) return json({ code: 'rest_cannot_view' }, opts.menus)
      if (u.includes('/menus?')) return json([{ id: 3, name: 'Main', slug: 'main', locations: ['primary'] }])
      if (u.includes('/menu-items?')) return json([
        { id: 20, title: { raw: 'About' }, type: 'post_type', object: 'page', object_id: 11, parent: 0, menu_order: 1, url: 'https://s.example/about/', menus: 3, status: 'publish' },
        { id: 21, title: { raw: '', rendered: 'Secret plan' }, type: 'post_type', object: 'page', object_id: 14, parent: 0, menu_order: 2, url: 'https://s.example/?page_id=14', menus: 3, status: 'publish' },
      ])
      if (u.includes('/navigation?')) {
        expect(u).toContain('status=publish')
        return json([{ id: 9, slug: 'navigation', status: 'publish', date_gmt: '2026-01-01T00:00:00', title: { raw: 'Navigation' }, content: { raw: NAV } }])
      }
      return json([{ area: 'header', content: { raw: '<!-- wp:navigation {"ref":9} /-->' } }])
    }
    if (/\/(categories|tags|users|media|comments|posts)\?/.test(u)) return json([])
    return new Response('nope', { status: 404 })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('fetchRestRawIR menus', () => {
  it('reads classic menus and block navigation with a credential, with their locations', async () => {
    const { fetchImpl } = site()
    const { raw, gaps, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl, auth: { user: 'u', appPassword: 'p' } })
    expect(gaps).toEqual([])
    // Two left out: the draft page's classic item, and the block link to page 12, which this site never listed.
    expect(warnings).toEqual(['menus: 2 item(s) are drafts or point at content not proven public (unpublished, password-protected, or not read by this import) — left out'])
    expect(JSON.stringify(raw.menus)).not.toMatch(/Secret plan|secret-plan|page_id=14/)
    expect(raw.menus!.map((m) => [m.slug, m.locations, m.items.length])).toEqual([['main', ['primary'], 1], ['navigation', ['header'], 3]])
    expect(raw.menus![0]!.items[0]!.target).toEqual({ kind: 'post', post_type: 'page', id: 11, slug: 'about', resolved: true })
  })

  it('names the gap instead of silently returning no menus without a credential', async () => {
    const { fetchImpl, calls } = site()
    const { raw, gaps, warnings } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl })
    expect(raw.menus).toBeUndefined()
    expect(gaps).toEqual(['menus_require_auth'])
    expect(warnings).toEqual([])
    expect(calls.some((c) => /\/(menus|navigation)\?/.test(c))).toBe(false)
  })

  it('names the gap when the credential may not edit theme options', async () => {
    const { fetchImpl } = site({ menus: 403 })
    const { raw, gaps, credential } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl, auth: { user: 'u', appPassword: 'p' } })
    expect(raw.menus).toBeUndefined()
    expect(gaps).toEqual(['menus_require_auth'])
    // A missing right on menus is not a rejected credential: the content listings were read with it.
    expect(credential.status).toBe('accepted')
  })

  it('stores locations on menus and claims no WordPress id for block navigation items', async () => {
    const { fetchImpl } = site()
    const { raw } = await fetchRestRawIR({ origin: 'https://s.example', fetchImpl, auth: { user: 'u', appPassword: 'p' } })
    const { files } = rawToContentrain(raw)
    const model = JSON.parse(files['.contentrain/models/menus.json']!)
    expect(model.fields.locations).toMatchObject({ type: 'array', items: 'string' })
    const menus = Object.values(JSON.parse(files['.contentrain/content/site/menus/en.json'] ?? files[Object.keys(files).find((f) => f.includes('/menus/'))!]!)) as Array<Record<string, unknown>>
    expect(menus.map((m) => m.locations).toSorted()).toEqual([['header'], ['primary']])
    const itemsFile = Object.keys(files).find((f) => f.includes('content/') && f.includes('/menu-items/'))!
    const items = Object.values(JSON.parse(files[itemsFile]!)) as Array<Record<string, unknown>>
    expect(items).toHaveLength(4)
    expect(JSON.stringify(items)).not.toMatch(/Secret plan|secret-plan|page_id=14/)
    expect(items.filter((i) => 'wp_id' in i).map((i) => i.wp_id)).toEqual([20])
  })
})
