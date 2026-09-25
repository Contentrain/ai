// Menus over REST → RawMenu[].
//
// Two sources, both behind `edit_theme_options` (an application password):
//   - classic menus: `/wp/v2/menus` (with the theme locations each is assigned to) and `/wp/v2/menu-items`;
//   - block-theme navigation: published `wp_navigation` posts, whose block markup is the menu. A block
//     menu's location is the template part (`header` / `footer`) that references it — or, for a
//     navigation block without a `ref`, the most recent published one, which is what WordPress shows.
// Block menu items have no ids of their own; they get negative ids, unique within the import, so they
// can never collide with a WordPress post id.

import type { RawMenu, RawMenuItem, RawMenuTarget } from '@contentrain/types'
import { strip } from './core.js'

export interface RestMenu { id: number; name?: string; slug?: string; locations?: string[] }

export interface RestMenuItem {
  id: number
  title?: { rendered?: string; raw?: string }
  status?: string
  url?: string
  description?: string
  type?: string
  object?: string
  object_id?: number
  parent?: number
  menu_order?: number
  target?: string
  classes?: string[]
  menus?: number
}

export interface RestNavigation {
  id: number
  slug?: string
  date_gmt?: string
  status?: string
  title?: { rendered?: string; raw?: string }
  content?: { raw?: string }
}

export interface RestTemplatePart { area?: string; content?: { raw?: string } }

/** What a target is checked against: the posts and terms this import read. */
export interface MenuContext {
  origin: string
  postSlug: (id: number) => string | undefined
  termSlug: (taxonomy: string, id: number) => string | undefined
  /** Published pages, for `core/page-list` (id, parent, order, title, link). */
  pages: Array<{ id: number; parent: number | null; menu_order: number; title: string; link: string | null; slug: string }>
}

const targetOf = (kind: string | undefined, object: string | undefined, id: number | undefined, url: string | undefined, ctx: MenuContext): RawMenuTarget => {
  const objectId = id && id > 0 ? id : null
  if (kind === 'post_type' && object) {
    const slug = objectId ? ctx.postSlug(objectId) : undefined
    return { kind: 'post', post_type: object, id: objectId, slug: slug ?? null, resolved: slug !== undefined }
  }
  if (kind === 'taxonomy' && object) {
    const slug = objectId ? ctx.termSlug(object, objectId) : undefined
    return { kind: 'term', taxonomy: object, id: objectId, slug: slug ?? null, resolved: slug !== undefined }
  }
  if (kind === 'post_type_archive' && object) return { kind: 'archive', post_type: object, resolved: true }
  if (url) return { kind: 'url', url, resolved: true }
  return { kind: 'unknown', resolved: false }
}

/** Classic menus and their items; each menu names the theme locations it is assigned to. */
export function classicMenus(menus: RestMenu[], items: RestMenuItem[], ctx: MenuContext): RawMenu[] {
  const out: RawMenu[] = []
  for (const m of [...menus].toSorted((a, b) => a.id - b.id)) {
    const own = items.filter((i) => i.menus === m.id).toSorted((a, b) => (a.menu_order ?? 0) - (b.menu_order ?? 0) || a.id - b.id)
    const ids = new Set(own.map((i) => i.id))
    const menu: RawMenu = {
      id: m.id,
      slug: m.slug ?? '',
      name: strip(m.name ?? m.slug ?? ''),
      items: own.map((i) => {
        const item: RawMenuItem = {
          id: i.id,
          title: i.title?.raw || i.title?.rendered || '',
          order: i.menu_order ?? 0,
          parent: i.parent || null,
          url: i.url || null,
          target: targetOf(i.type, i.object, i.object_id, i.url, ctx),
          target_attr: i.target || null,
          classes: (i.classes ?? []).filter(Boolean),
          description: i.description ?? '',
          status: i.status ?? 'publish',
        }
        if (i.parent && !ids.has(i.parent)) item.parent_unresolved = true
        return item
      }),
    }
    const locations = (m.locations ?? []).filter(Boolean).toSorted()
    if (locations.length) menu.locations = locations
    out.push(menu)
  }
  return out
}

// ── Block navigation ─────────────────────────────────────────────────────────

interface Block { name: string; attrs: Record<string, unknown>; children: Block[] }

/** Serialized block comments (`<!-- wp:name {attrs} /-->`, `<!-- /wp:name -->`). Same grammar as the facts builder parser. */
const BLOCK_TOKEN = /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+({(?:(?!}\s+\/?-->)[\s\S])*?}\s+)?(\/)?-->/g

export function parseBlocks(content: string): Block[] {
  const root: Block = { name: 'root', attrs: {}, children: [] }
  const stack: Block[] = [root]
  const token = new RegExp(BLOCK_TOKEN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = token.exec(content))) {
    const [, closer, ns, local, json, selfClose] = m
    if (closer) {
      if (stack.length > 1) stack.pop()
      continue
    }
    let attrs: Record<string, unknown> = {}
    if (json) {
      try { attrs = JSON.parse(json) as Record<string, unknown> } catch { attrs = {} }
    }
    const block: Block = { name: `${ns ? ns.slice(0, -1) : 'core'}/${local}`, attrs, children: [] }
    stack[stack.length - 1]!.children.push(block)
    if (!selfClose) stack.push(block)
  }
  return root.children
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const absolute = (url: string | undefined, origin: string): string | undefined => {
  if (!url) return undefined
  try { return new URL(url, `${origin}/`).href } catch { return url }
}
/** The block editor's link kinds → the classic menu item types. */
const KIND: Record<string, string> = { 'post-type': 'post_type', taxonomy: 'taxonomy', custom: 'custom' }

/**
 * Menu items of one `wp_navigation` body. Links and submenus become items; a page list becomes the
 * published pages it lists; a home link points at `/`. Other blocks (search, social icons, spacers) are not links.
 */
export function navigationItems(content: string, ctx: MenuContext, nextId: () => number): RawMenuItem[] {
  const items: RawMenuItem[] = []
  const push = (b: { title: string; url?: string; kind?: string; object?: string; id?: number; newTab?: boolean; className?: string; description?: string }, parent: number | null): number => {
    const id = nextId()
    const url = absolute(b.url, ctx.origin)
    items.push({
      id,
      title: b.title,
      order: items.length + 1,
      parent,
      url: url ?? null,
      target: targetOf(b.kind, b.object, b.id, url, ctx),
      target_attr: b.newTab ? '_blank' : null,
      classes: (b.className ?? '').split(/\s+/).filter(Boolean),
      description: b.description ?? '',
      status: 'publish',
    })
    return id
  }
  const pageList = (parentPage: number, parent: number | null) => {
    const kids = ctx.pages.filter((p) => (p.parent ?? 0) === parentPage).toSorted((a, b) => a.menu_order - b.menu_order || a.title.localeCompare(b.title))
    for (const p of kids) {
      const id = push({ title: p.title, url: p.link ?? undefined, kind: 'post_type', object: 'page', id: p.id }, parent)
      pageList(p.id, id)
    }
  }
  const walk = (blocks: Block[], parent: number | null) => {
    for (const b of blocks) {
      const a = b.attrs
      if (b.name === 'core/navigation-link' || b.name === 'core/navigation-submenu') {
        const kind = KIND[str(a.kind) ?? ''] ?? (str(a.type) === 'category' || str(a.type) === 'tag' || str(a.type) === 'post_tag' ? 'taxonomy' : a.id ? 'post_type' : 'custom')
        const object = kind === 'taxonomy' && str(a.type) === 'tag' ? 'post_tag' : str(a.type)
        const id = push({ title: strip(a.label), url: str(a.url), kind, object, id: typeof a.id === 'number' ? a.id : undefined, newTab: a.opensInNewTab === true, className: str(a.className), description: str(a.description) }, parent)
        walk(b.children, id)
      } else if (b.name === 'core/home-link') {
        push({ title: strip(a.label) || 'Home', url: '/', className: str(a.className) }, parent)
      } else if (b.name === 'core/page-list') {
        pageList(typeof a.parentPageID === 'number' ? a.parentPageID : 0, parent)
      } else {
        walk(b.children, parent)
      }
    }
  }
  walk(parseBlocks(content), null)
  return items
}

/**
 * Where each navigation is shown: the template parts (`header`, `footer`) whose navigation block
 * refers to it. An empty navigation block without a `ref` shows the fallback — the most recent published one;
 * one with links of its own shows those (an inline menu, not a `wp_navigation` post).
 */
export function navigationLocations(parts: RestTemplatePart[], navigations: RestNavigation[]): Map<number, string[]> {
  const out = new Map<number, Set<string>>()
  const fallback = [...navigations].toSorted((a, b) => (b.date_gmt ?? '').localeCompare(a.date_gmt ?? '') || b.id - a.id)[0]?.id
  const find = (blocks: Block[], area: string) => {
    for (const b of blocks) {
      if (b.name === 'core/navigation') {
        // No ref and links of its own: an inline navigation, not any wp_navigation post. No ref, empty: the fallback.
        const ref = typeof b.attrs.ref === 'number' ? b.attrs.ref : b.children.length ? undefined : fallback
        if (ref !== undefined) (out.get(ref) ?? out.set(ref, new Set()).get(ref)!).add(area)
        continue
      }
      find(b.children, area)
    }
  }
  for (const p of parts) {
    const area = p.area && p.area !== 'uncategorized' ? p.area : undefined
    if (area && p.content?.raw) find(parseBlocks(p.content.raw), area)
  }
  return new Map([...out].map(([id, set]) => [id, [...set].toSorted()]))
}

/** Published `wp_navigation` posts → RawMenu[], slugs kept unique against the classic menus already read. */
export function blockMenus(navigations: RestNavigation[], parts: RestTemplatePart[], ctx: MenuContext, taken: Set<string>): RawMenu[] {
  const published = navigations.filter((n) => (n.status ?? 'publish') === 'publish').toSorted((a, b) => a.id - b.id)
  const locations = navigationLocations(parts, published)
  let next = 0
  const out: RawMenu[] = []
  for (const n of published) {
    let slug = n.slug || `navigation-${n.id}`
    while (taken.has(slug)) slug = `${slug}-nav`
    taken.add(slug)
    const menu: RawMenu = {
      id: n.id,
      slug,
      name: strip(n.title?.raw || n.title?.rendered || '') || slug,
      items: navigationItems(n.content?.raw ?? '', ctx, () => -++next),
    }
    const where = locations.get(n.id)
    if (where?.length) menu.locations = where
    out.push(menu)
  }
  return out
}
