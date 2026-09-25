import { readFileSync } from 'node:fs'
import type { RawMenu } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { blockMenus, type MenuContext } from './rest-menus'

// The menu parity fixture: the cases the Contentrain Bridge copies and checks against its own export.

interface PublicPost { id: number; type: string; parent: number; menu_order: number; title: string; slug: string; link: string }
interface PublicTerm { taxonomy: string; id: number; slug: string; link: string }
interface Navigation { id: number; slug: string; title: string; status: string; date_gmt: string; content: string }
interface ExpectedMenu { slug: string; name: string; locations?: string[]; items: Array<{ title: string; url: string; parent: string[] }> }
interface Case {
  name: string
  taken?: string[]
  templates: Array<{ slug: string; content: string }>
  parts: Array<{ slug: string; area: string; content: string }>
  navigations: Navigation[]
  expect: { menus: ExpectedMenu[]; dropped: number }
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/menu-parity.json', import.meta.url), 'utf8')) as {
  origin: string
  public: { posts: PublicPost[]; terms: PublicTerm[] }
  cases: Case[]
}

/** What the importer knows after reading the site: the public posts and terms, by id. */
function context(): MenuContext {
  const posts = new Map(fixture.public.posts.map((p) => [p.id, p]))
  const term = (taxonomy: string, id: number) => fixture.public.terms.find((t) => t.taxonomy === taxonomy && t.id === id)
  return {
    origin: fixture.origin,
    postSlug: (id) => posts.get(id)?.slug,
    termSlug: (taxonomy, id) => term(taxonomy, id)?.slug,
    postLink: (id) => posts.get(id)?.link,
    termLink: (taxonomy, id) => term(taxonomy, id)?.link,
    pages: fixture.public.posts.filter((p) => p.type === 'page').map((p) => ({ id: p.id, parent: p.parent, menu_order: p.menu_order, title: p.title, link: p.link, slug: p.slug })),
  }
}

/** What the fixture compares of a menu: slug, name, locations, and each item's title, address and ancestors. */
function shape(menu: RawMenu): ExpectedMenu {
  const byId = new Map(menu.items.map((i) => [i.id, i]))
  const ancestors = (parent: number | null): string[] => {
    const out: string[] = []
    for (let p = parent; p !== null; p = byId.get(p)?.parent ?? null) out.unshift(byId.get(p)?.title ?? '?')
    return out
  }
  const out: ExpectedMenu = { slug: menu.slug, name: menu.name, items: menu.items.map((i) => ({ title: i.title, url: i.url ?? '', parent: ancestors(i.parent ?? null) })) }
  if (menu.locations) out.locations = menu.locations
  return out
}

describe('menu parity fixture', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const dropped = { count: 0 }
    // REST sends a post's content and title as `{ raw }` under `context=edit`.
    const menus = blockMenus(
      c.navigations.map((n) => ({ id: n.id, slug: n.slug, status: n.status, date_gmt: n.date_gmt, title: { raw: n.title }, content: { raw: n.content } })),
      c.parts.map((p) => ({ slug: p.slug, area: p.area, content: { raw: p.content } })),
      context(),
      new Set(c.taken ?? []),
      dropped,
      c.templates.map((t) => ({ slug: t.slug, content: { raw: t.content } })),
    )
    expect(menus.map(shape)).toEqual(c.expect.menus)
    expect(dropped.count).toBe(c.expect.dropped)
  })
})
