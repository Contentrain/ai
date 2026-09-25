// Menus over REST → RawMenu[].
//
// Two sources, both behind `edit_theme_options` (an application password):
//   - classic menus: `/wp/v2/menus` (with the theme locations each is assigned to) and `/wp/v2/menu-items`;
//   - block-theme navigation: published `wp_navigation` posts, whose block markup is the menu. A block
//     menu's location is the template part (`header` / `footer`) that references it — or, for a
//     navigation block without a `ref`, the most recent published one, which is what WordPress shows;
//   - inline navigation: a navigation block in a template part that carries its own links (Twenty
//     Twenty-Five's footer columns). It is a menu of that part's area, with no WordPress record behind it.
// Only template parts a template uses count: a theme ships alternatives (`footer-columns`, `header-large-title`)
// that no page shows. Block menu items, and inline menus, have no ids of their own; they get negative ids,
// unique within the import, so they can never collide with a WordPress id.

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

export interface RestTemplatePart { slug?: string; area?: string; title?: { rendered?: string; raw?: string }; content?: { raw?: string } }
export interface RestTemplate { slug?: string; content?: { raw?: string } }

/** What a target is checked against: the posts and terms this import read. */
export interface MenuContext {
  origin: string
  /**
   * Slug of a post this import read and saw published and unprotected — the only kind a menu item may
   * point at. Anything else (a draft, a private or scheduled post, one behind a password, or one this
   * import never read: a type outside REST, past a page cap) is left out, fail-closed: a menu item's label
   * is often its target's title, and that title must not reach the store.
   */
  postSlug: (id: number) => string | undefined
  termSlug: (taxonomy: string, id: number) => string | undefined
  /**
   * Public address of such a post or term. A menu item that names one points there, whatever address the item
   * kept: a block stores the url it had when it was saved (`/old-about/`), and a typed `?page_id=5` is a form the
   * migrated site cannot serve.
   */
  postLink?: (id: number) => string | undefined
  termLink?: (taxonomy: string, id: number) => string | undefined
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

/** The public address of the post or term a target names, when it is one this import proved public. */
const publicLink = (target: RawMenuTarget, ctx: MenuContext): string | undefined => {
  if (!target.resolved || !('id' in target) || !target.id) return undefined
  if (target.kind === 'post') return ctx.postLink?.(target.id)
  if (target.kind === 'term') return ctx.termLink?.(target.taxonomy, target.id)
  return undefined
}

/**
 * Items that are left out: a draft item, or one whose post target is not proven visible. Their children move up
 * to the nearest kept ancestor, as WordPress's walker shows them.
 */
function hiddenItems(items: RestMenuItem[], drop: (i: RestMenuItem) => boolean): { gone: Set<number>; lift: (parent: number | null) => number | null } {
  const parentOf = new Map(items.filter(drop).map((i) => [i.id, i.parent || null]))
  const lift = (parent: number | null): number | null => {
    const seen = new Set<number>()
    let p = parent
    while (p !== null && parentOf.has(p) && !seen.has(p)) { seen.add(p); p = parentOf.get(p) ?? null }
    return p
  }
  return { gone: new Set(parentOf.keys()), lift }
}

/** A host without case or a leading `www.`: example.com and www.example.com are one site (as the Bridge reads it). */
const bareHost = (u: URL): string => u.hostname.toLowerCase().replace(/^www\./, '')

/**
 * The post a plain permalink names (`/?page_id=14`, `/?p=14`) on this site, `www.` or not: a custom link typed by
 * hand carries no post id, but it points at a post all the same, and its label is often that post's title.
 */
export function plainPostId(url: string | undefined, origin: string): number | undefined {
  if (!url || !url.includes('?')) return undefined
  try {
    const u = new URL(url, `${origin}/`)
    if (bareHost(u) !== bareHost(new URL(origin))) return undefined
    const id = Number(u.searchParams.get('page_id') ?? u.searchParams.get('p'))
    return Number.isSafeInteger(id) && id > 0 ? id : undefined
  } catch { return undefined }
}

/** Classic menus and their items; each menu names the theme locations it is assigned to. `dropped` counts left-out items. */
export function classicMenus(menus: RestMenu[], items: RestMenuItem[], ctx: MenuContext, dropped = { count: 0 }): RawMenu[] {
  const out: RawMenu[] = []
  for (const m of [...menus].toSorted((a, b) => a.id - b.id)) {
    const all = items.filter((i) => i.menus === m.id).toSorted((a, b) => (a.menu_order ?? 0) - (b.menu_order ?? 0) || a.id - b.id)
    const hidden = (i: RestMenuItem): boolean => {
      if ((i.status ?? 'publish') !== 'publish') return true
      if (i.type === 'post_type') return !(i.object_id && ctx.postSlug(i.object_id))
      // A custom link to `?page_id=` / `?p=` names a post: the same proof applies.
      const id = plainPostId(i.url, ctx.origin)
      return id !== undefined && !ctx.postSlug(id)
    }
    const { gone, lift } = hiddenItems(all, hidden)
    dropped.count += gone.size
    const own = all.filter((i) => !gone.has(i.id))
    const ids = new Set(own.map((i) => i.id))
    const menu: RawMenu = {
      id: m.id,
      slug: m.slug ?? '',
      name: strip(m.name ?? m.slug ?? ''),
      items: own.map((i) => {
        const target = targetOf(i.type, i.object, i.object_id, i.url, ctx)
        const typed = target.kind === 'url' ? plainPostId(i.url, ctx.origin) : undefined
        const item: RawMenuItem = {
          id: i.id,
          title: i.title?.raw || i.title?.rendered || '',
          order: i.menu_order ?? 0,
          parent: lift(i.parent || null),
          url: publicLink(target, ctx) ?? (typed !== undefined ? ctx.postLink?.(typed) : undefined) ?? (i.url || null),
          target,
          target_attr: i.target || null,
          classes: (i.classes ?? []).filter(Boolean),
          description: i.description ?? '',
          status: i.status ?? 'publish',
        }
        if (item.parent && !ids.has(item.parent)) item.parent_unresolved = true
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
  // `#` (a placeholder link) stays on the page it is on; made absolute it would point at the home page.
  if (url.startsWith('#')) return url
  try { return new URL(url, `${origin}/`).href } catch { return url }
}
/** The block editor's link kinds → the classic menu item types. */
const KIND: Record<string, string> = { 'post-type': 'post_type', taxonomy: 'taxonomy', custom: 'custom' }

/**
 * Menu items of one `wp_navigation` body. Links and submenus become items; a page list becomes the
 * published pages it lists; a home link points at `/`. Other blocks (search, social icons, spacers) are not links.
 */
export function navigationItems(content: string, ctx: MenuContext, nextId: () => number, dropped = { count: 0 }): RawMenuItem[] {
  return blockItems(parseBlocks(content), ctx, nextId, dropped)
}

/** Menu items of navigation blocks already parsed (a `wp_navigation` body, or an inline navigation's links). */
function blockItems(tree: Block[], ctx: MenuContext, nextId: () => number, dropped: { count: number }): RawMenuItem[] {
  const items: RawMenuItem[] = []
  const push = (b: { title: string; url?: string; kind?: string; object?: string; id?: number; typed?: number; newTab?: boolean; className?: string; description?: string }, parent: number | null): number => {
    const id = nextId()
    const url = absolute(b.url, ctx.origin)
    const target = targetOf(b.kind, b.object, b.id, url, ctx)
    items.push({
      id,
      title: b.title,
      order: items.length + 1,
      parent,
      // A public post or term is linked at its public address (see `MenuContext.postLink`).
      url: publicLink(target, ctx) ?? (b.typed !== undefined ? ctx.postLink?.(b.typed) : undefined) ?? url ?? null,
      target,
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
        // A link to a post not proven visible is left out (fail-closed); its children show in its place. A custom link
        // to `?page_id=` / `?p=` names a post too.
        const postId = kind === 'post_type' && typeof a.id === 'number' ? a.id : kind === 'custom' ? plainPostId(str(a.url), ctx.origin) : undefined
        if (postId !== undefined && !ctx.postSlug(postId)) {
          dropped.count++
          walk(b.children, parent)
          continue
        }
        const id = push({ title: strip(a.label), url: str(a.url), kind, object, id: typeof a.id === 'number' ? a.id : undefined, typed: kind === 'custom' ? postId : undefined, newTab: a.opensInNewTab === true, className: str(a.className), description: str(a.description) }, parent)
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
  walk(tree, null)
  return items
}

/** Template-part slugs the templates use, at any depth (a part inside a group, a part inside a part is not followed). */
function partSlugs(blocks: Block[], out = new Set<string>()): Set<string> {
  for (const b of blocks) {
    if (b.name === 'core/template-part' && typeof b.attrs.slug === 'string') out.add(b.attrs.slug)
    partSlugs(b.children, out)
  }
  return out
}

/**
 * The template parts a page can show: those a template references. Without the templates (not readable), the
 * part named after its area (`header`, `footer`) — what a theme's templates use unless they say otherwise.
 * Parts without a slug (older callers) all count.
 */
export function usedParts(parts: RestTemplatePart[], templates: RestTemplate[] = []): RestTemplatePart[] {
  const used = new Set<string>()
  for (const t of templates) if (t.content?.raw) partSlugs(parseBlocks(t.content.raw), used)
  return parts.filter((p) => !p.slug || (used.size ? used.has(p.slug) : p.slug === p.area))
}

const AREA_ORDER = ['header', 'footer']
const areaOf = (p: RestTemplatePart): string | undefined => (p.area && p.area !== 'uncategorized' ? p.area : undefined)

/**
 * A part's blocks with the parts it holds in their place (a header holding a `navigation` part), each part once:
 * what the part shows, in its area.
 */
function partTree(part: RestTemplatePart, all: RestTemplatePart[]): Block[] {
  const bySlug = new Map(all.filter((p) => p.slug).map((p) => [p.slug!, p]))
  const seen = new Set(part.slug ? [part.slug] : [])
  const expand = (blocks: Block[]): Block[] => blocks.flatMap((b) => {
    if (b.name === 'core/template-part') {
      const inner = typeof b.attrs.slug === 'string' ? bySlug.get(b.attrs.slug) : undefined
      if (!inner?.content?.raw || seen.has(inner.slug!)) return []
      seen.add(inner.slug!)
      return expand(parseBlocks(inner.content.raw))
    }
    return [{ ...b, children: expand(b.children) }]
  })
  return expand(parseBlocks(part.content?.raw ?? ''))
}
const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const slugOf = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Inline navigations of the used template parts → RawMenu[], in area order (header, footer, others) and document
 * order within a part. A part's single inline navigation is named after its area (`Footer navigation`), several
 * are numbered; a navigation's own `ariaLabel` wins. Links keep their order and nesting; a link to content not
 * proven public is left out, as in every other menu.
 */
export function inlineMenus(parts: RestTemplatePart[], ctx: MenuContext, taken: Set<string>, nextId: () => number, dropped = { count: 0 }, all: RestTemplatePart[] = parts): RawMenu[] {
  const out: RawMenu[] = []
  const ordered = parts.filter((p) => areaOf(p) && p.content?.raw).toSorted((a, b) => (AREA_ORDER.indexOf(areaOf(a)!) + 1 || 99) - (AREA_ORDER.indexOf(areaOf(b)!) + 1 || 99))
  for (const p of ordered) {
    const area = areaOf(p)!
    const navs: Block[] = []
    const find = (blocks: Block[]) => { for (const b of blocks) { if (b.name === 'core/navigation') { if (typeof b.attrs.ref !== 'number' && b.children.length) navs.push(b) } else find(b.children) } }
    find(partTree(p, all))
    navs.forEach((nav, i) => {
      const name = strip(nav.attrs.ariaLabel) || `${titleCase(area)} navigation${navs.length > 1 ? ` ${i + 1}` : ''}`
      const base = slugOf(name) || `${area}-navigation`
      let slug = base
      for (let k = 2; taken.has(slug); k++) slug = `${base}-${k}`
      taken.add(slug)
      const items = blockItems(nav.children, ctx, nextId, dropped)
      if (items.length) out.push({ id: nextId(), slug, name, items, locations: [area] })
    })
  }
  return out
}

/**
 * Where each navigation is shown: the template parts (`header`, `footer`) whose navigation block
 * refers to it. An empty navigation block without a `ref` shows the fallback — the most recent published one;
 * one with links of its own shows those (an inline menu, not a `wp_navigation` post).
 */
export function navigationLocations(parts: RestTemplatePart[], navigations: RestNavigation[], all: RestTemplatePart[] = parts): Map<number, string[]> {
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
    const area = areaOf(p)
    if (area && p.content?.raw) find(partTree(p, all), area)
  }
  return new Map([...out].map(([id, set]) => [id, [...set].toSorted()]))
}

/**
 * Published `wp_navigation` posts, then the inline navigations of the used template parts → RawMenu[], slugs kept
 * unique against the classic menus already read. `templates` says which parts are used (see `usedParts`).
 */
export function blockMenus(navigations: RestNavigation[], allParts: RestTemplatePart[], ctx: MenuContext, taken: Set<string>, dropped = { count: 0 }, templates: RestTemplate[] = []): RawMenu[] {
  const parts = usedParts(allParts, templates)
  const published = navigations.filter((n) => (n.status ?? 'publish') === 'publish').toSorted((a, b) => a.id - b.id)
  const locations = navigationLocations(parts, published, allParts)
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
      items: navigationItems(n.content?.raw ?? '', ctx, () => -++next, dropped),
    }
    const where = locations.get(n.id)
    if (where?.length) menu.locations = where
    out.push(menu)
  }
  out.push(...inlineMenus(parts, ctx, taken, () => -++next, dropped, allParts))
  return out
}
