// Links to what the public can see. A migrated store keeps drafts, private
// pages and the source site's absolute URLs; a public build points at none of
// them. Every internal link resolves through the route table — the published
// set — or is dropped: a menu item without a public target is left out, a link
// in a body becomes its text. External links pass through unchanged.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getCollection, getEntry, type CollectionEntry } from 'astro:content'
import { safeUrl } from '../components/kit/_shared/safe-url'
import type { NavItem } from '../components/kit/_shared/types'
import { byId, getRedirects, getSite, pageHref, postHref, resolve, termHref } from './content'
import { optimizedImages } from './body-images'
import { entriesOf, entryById, entryHref, termHref as customTermHref, termsById } from './custom'
import { siteConfig } from '../site.config'
import { routeTable } from './site-routes'

/** Addresses outside the route table that the site serves: search, the feed. */
const SERVED = new Set(['/search/', '/rss.xml'])
/** A file in public/ (media, documents): served as it is, not a route. */
const FILE = /\/[^/]+\.[a-z\d]{2,5}$/i
const SCHEMES = new Set(['mailto:', 'tel:', 'sms:'])
const BASE = 'http://link.invalid'

/** A host as links compare it: `http://WWW.Site.com:8080` and `https://site.com` are the same site. */
const bareHost = (hostname: string) => hostname.toLowerCase().replace(/^www\./, '')
const hostOf = (url: string) => {
  try { return bareHost(new URL(url.includes('//') ? url : `http://${url}`).hostname) } catch { return undefined }
}

const inPublic = (path: string) => {
  try { return existsSync(join(process.cwd(), 'public', decodeURI(path))) } catch { return false }
}

/** A path as the site builds it: directories end in a slash (trailingSlash: 'always'), files do not. */
export const sitePath = (path: string): string => (FILE.test(path) || path.endsWith('/') ? path : `${path}/`)

let hosts: Promise<ReadonlySet<string>> | undefined

/** The hosts whose links are this site's: its own, the store's site url and the source's (fixed at build time). */
function internalHosts(): Promise<ReadonlySet<string>> {
  hosts ??= getSite().then(site => new Set([BASE, import.meta.env.SITE, site.url, ...siteConfig.sourceHosts].flatMap((url) => {
    const host = url ? hostOf(url) : undefined
    return host ? [host] : []
  })))
  return hosts
}

/**
 * A URL as this site's path when it points at this site (any scheme, `www.` or case), null when it
 * points elsewhere, undefined when it is no web address. For targets the published set cannot check
 * whole, such as a prefix redirect's `/b/:splat`.
 */
export async function ownPath(url: string): Promise<string | null | undefined> {
  let parsed: URL
  try { parsed = new URL(url.trim(), `${BASE}/`) } catch { return undefined }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  return (await internalHosts()).has(bareHost(parsed.hostname)) ? parsed.pathname : null
}

type Linker = (url: string | undefined) => string | undefined
let linker: Promise<Linker> | undefined

/**
 * A function from a stored URL to the address to print: a site path for an internal link to a public
 * address, the URL itself for an external one, undefined for anything else (a draft, a private page,
 * a deleted entry, a `javascript:` URL). A link to an old address follows the site's redirects to
 * where it lands now; one that ends in a 410 or a loop is not public.
 *
 * @public generated section views call it
 */
export function publicLinks(): Promise<Linker> {
  linker ??= (async () => {
    const [routes, internal, redirects] = await Promise.all([routeTable(), internalHosts(), getRedirects()])
    // Keyed by path and query: a rule for `/old.php?id=3` or `/?page_id=5` stands for that address only, not its path.
    const ruleKey = (url: URL) => `${sitePath(url.pathname)}${url.search}`
    const rules = new Map(redirects.filter(entry => !entry.data.from.includes('*')).map(entry => [ruleKey(new URL(entry.data.from, `${BASE}/`)), entry.data]))
    // WordPress's own short links (`/?p=12`, `/?page_id=7`) point at the entry, wherever it lives now.
    const byWpId = new Map<number, string>()
    for (const [href, route] of routes) {
      if (route.view === 'post' && route.post.data.wp_id !== undefined) byWpId.set(route.post.data.wp_id, href)
      if (route.view === 'page' && route.page.data.wp_id !== undefined) byWpId.set(route.page.data.wp_id, href)
      if (route.view === 'entry' && typeof route.entry.data.wp_id === 'number') byWpId.set(route.entry.data.wp_id, href)
    }
    const link = (url: string | undefined, followed: ReadonlySet<string>): string | undefined => {
      const raw = url?.trim()
      if (!raw) return undefined
      if (raw.startsWith('#')) return raw
      let parsed: URL
      try { parsed = new URL(raw, `${BASE}/`) } catch { return undefined }
      if (SCHEMES.has(parsed.protocol)) return raw
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
      if (!internal.has(bareHost(parsed.hostname))) return raw
      const shortLink = parsed.pathname === '/' ? Number(parsed.searchParams.get('p') ?? parsed.searchParams.get('page_id') ?? Number.NaN) : Number.NaN
      const path = sitePath(parsed.pathname)
      const key = ruleKey(parsed)
      // The entry's own address wins; the collection's rule answers a short link to an entry that is gone.
      const rule = (!Number.isNaN(shortLink) && byWpId.has(shortLink)) || (!parsed.search && routes.has(path)) ? undefined : rules.get(key) ?? (routes.has(path) ? undefined : rules.get(path))
      if (!Number.isNaN(shortLink)) return byWpId.get(shortLink) ?? (rule && !followed.has(key) && rule.status !== 410 ? link(rule.to, new Set([...followed, key])) : undefined)
      if (rule) return followed.has(key) || rule.status === 410 ? undefined : link(rule.to, new Set([...followed, key]))
      // A file the media stage copied into public/ is served here; one it could not copy stays at its old address.
      if (FILE.test(path)) return inPublic(path) ? `${path}${parsed.search}${parsed.hash}` : raw
      return routes.has(path) || SERVED.has(path) ? `${path}${parsed.search}${parsed.hash}` : undefined
    }
    return url => link(url, new Set())
  })()
  return linker
}

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const decode = (value: string) => value.replaceAll('&amp;', '&').replaceAll('&#038;', '&').replaceAll('&quot;', '"')
const encode = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

const IMG = /<img\b[^>]*>/gi
const IMG_SRC = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const WP_IMAGE = /\bwp-image-(\d+)\b/
/** The attribute's value with its quotes, for a name that stands alone (`alt`, not `data-alt`). */
const attributeOf = (name: string) => new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*')`, 'i')
/** Whether the tag has an `alt` at all: quoted, unquoted or bare (`<img alt>`). */
const HAS_ALT = /\salt(?=[\s/>=])/i
const attributeText = (value: string) => encode(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;')

type MediaEntry = CollectionEntry<'media'>
interface MediaIndex { byWpId: ReadonlyMap<number, MediaEntry>, byPath: ReadonlyMap<string, MediaEntry> }
let mediaIndex: Promise<MediaIndex> | undefined

/** A file's address without WordPress's size suffix (`harbour-1024x683.jpg`, `harbour-scaled.jpg` are `harbour.jpg`). */
function originalPath(src: string): string | undefined {
  let path: string
  try { path = decodeURI(new URL(src, `${BASE}/`).pathname) } catch { return undefined }
  return path.replace(/-(?:\d+x\d+|scaled)(?=\.[a-z\d]+$)/i, '')
}

/** The media library by WordPress id and by the address of the file, read once per build. */
function media(): Promise<MediaIndex> {
  mediaIndex ??= getCollection('media').then((entries) => {
    const byWpId = new Map<number, MediaEntry>()
    const byPath = new Map<string, MediaEntry>()
    // By id, so two library entries for one file (a re-upload) always resolve to the same one.
    for (const entry of entries.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      if (entry.data.wp_id !== undefined) byWpId.set(entry.data.wp_id, entry)
      const path = originalPath(entry.data.url)
      if (path !== undefined && !byPath.has(path)) byPath.set(path, entry)
    }
    return { byWpId, byPath }
  })
  return mediaIndex
}

/**
 * An image in a body that carries no `alt` takes the library's: the migration drops an alt that only repeated
 * the library's, so an edit in Studio's media library reaches every image that inherits it. An `alt` the body
 * does have is the image's own for this use, and so is an empty one (decorative): neither is touched. The entry
 * is found by the `wp-image-<id>` class WordPress puts on the image, else by the address of its file. A
 * `title` replaces one the image already carries and is never added, because a library title is a file name,
 * not a tooltip.
 */
function mediaText(html: string, index: MediaIndex): string {
  return html.replace(IMG, (tag) => {
    const id = WP_IMAGE.exec(tag)?.[1]
    const src = IMG_SRC.exec(tag)
    const path = originalPath(decode(src?.[1] ?? src?.[2] ?? ''))
    const entry = (id === undefined ? undefined : index.byWpId.get(Number(id))) ?? (path === undefined ? undefined : index.byPath.get(path))
    if (!entry) return tag
    const { alt, title } = entry.data
    let next = tag
    if (alt && !HAS_ALT.test(next)) next = next.replace(/\s*\/?>$/, end => ` alt="${attributeText(alt)}"${end}`)
    const hasTitle = attributeOf('title')
    if (title && hasTitle.test(next)) next = next.replace(hasTitle, `$1"${attributeText(title)}"`)
    return next
  })
}

/**
 * Rich text made public: internal links become site paths, links to what is not public become their text,
 * images without an alt take their media library entry's, and local raster images are served optimized.
 */
export async function publicHtml(html: string): Promise<string>
export async function publicHtml(html: string | undefined): Promise<string | undefined>
export async function publicHtml(html: string | undefined): Promise<string | undefined> {
  if (!html) return html
  let result = html
  if (result.includes('<a')) {
    const link = await publicLinks()
    result = result.replace(ANCHOR, (anchor, attributes: string, inner: string) => {
      const match = HREF.exec(attributes)
      if (!match) return anchor
      const stored = decode(match[1] ?? match[2] ?? '')
      const href = link(stored)
      // A link to what is not public, or to a `javascript:` / `data:` address, is its text.
      if (href === undefined || safeUrl(href) === undefined) return inner
      return href === stored ? anchor : `<a${attributes.replace(HREF, `href="${encode(href)}"`)}>${inner}</a>`
    })
  }
  return result.includes('<img') ? optimizedImages(mediaText(result, await media())) : result
}

/**
 * A list field's items with their URL and rich-text fields made public. A URL that is not public is
 * removed from its item, which keeps its text: a card that pointed at a draft stays, unlinked.
 *
 * @public generated section views call it
 */
export async function publicItems<T extends object>(items: readonly T[] | undefined, urls: readonly string[], html: readonly string[]): Promise<T[] | undefined> {
  if (!items) return undefined
  const link = await publicLinks()
  const publicValue = async (key: string, value: unknown): Promise<unknown> => {
    if (typeof value !== 'string') return value
    if (urls.includes(key)) return link(value)
    return html.includes(key) ? publicHtml(value) : value
  }
  return Promise.all(items.map(async (item) => {
    const entries = await Promise.all(Object.entries(item).map(async ([key, value]) => [key, await publicValue(key, value)] as const))
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as T
  }))
}

type MenuItem = CollectionEntry<'menuItems'>

/** Where a menu item points: its target entry's public address, else its own URL made public. */
async function itemHref(item: MenuItem, link: (url: string | undefined) => string | undefined): Promise<string | undefined> {
  const target = item.data.target
  if (!target) return link(item.data.url)
  // The entry must be published (the collections hold nothing else) and its address public.
  switch (target.model) {
    case 'posts': {
      const post = await getEntry('posts', target.ref)
      return post ? link(postHref(post)) : undefined
    }
    case 'pages': {
      const pages = await byId('pages')
      const page = pages.get(target.ref)
      return page ? link(pageHref(page, pages)) : undefined
    }
    case 'categories':
    case 'tags': {
      const terms = await byId(target.model)
      const term = terms.get(target.ref)
      return term ? link(termHref(target.model === 'categories' ? 'category' : 'tag', term, terms)) : undefined
    }
    default: {
      // A custom post type's entry or one of its taxonomy's terms: through the type the site was configured with, so
      // the address is the one the route table serves (an entry or term that is not published has none).
      const collection = collectionOf(target.model)
      for (const type of siteConfig.types ?? []) {
        if (type.collection === collection) {
          const entry = await entryById(collection, target.ref)
          return entry ? link(entryHref(type, entry)) : undefined
        }
        const taxonomy = type.taxonomies?.find(candidate => candidate.collection === collection)
        if (taxonomy) {
          // A nested term's address carries its parents: the taxonomy's terms are read for the chain.
          const terms = taxonomy.pattern.includes(':path') ? termsById(collection, await entriesOf(collection)) : undefined
          const term = terms?.get(`${collection}:${target.ref}`) ?? await entryById(collection, target.ref)
          return term ? link(customTermHref(taxonomy, term, terms)) : undefined
        }
      }
      return undefined
    }
  }
}

/** The collection a model id is read from: `project-type` → `projectType` (a model id is kebab-case, its collection camelCase). */
const collectionOf = (model: string): string => model.replace(/[-_]([a-z\d])/g, (_, char: string) => char.toUpperCase())

/**
 * A menu as a tree, ordered as the editor ordered it. An item whose target is not public — a draft,
 * a private page, a deleted entry — is left out with the items under it: its label may be a draft's
 * title. An unknown menu is empty.
 *
 * @public generated section views call it (a plan's `menu:` binding)
 */
export async function getMenu(slug: string): Promise<NavItem[]> {
  const menu = (await getCollection('menus', entry => entry.data.slug === slug))[0]
  return menu ? menuItems(menu) : []
}

/** The theme locations each area answers to: WordPress themes name them differently. */
const AREAS = {
  header: (location: string) => ['header', 'primary', 'main', 'menu-1', 'top'].includes(location),
  footer: (location: string) => location.startsWith('footer'),
} as const

/**
 * The menus an area shows, as WordPress places them: a menu assigned to theme locations shows where
 * they are, so moving or unassigning it in Studio moves it on the site; a menu with no location shows
 * where site.config names it. Each comes with its name, the navigation's accessible name.
 */
export async function menusAt(area: keyof typeof AREAS): Promise<Array<{ name: string, items: NavItem[] }>> {
  const configured = area === 'header' ? [siteConfig.menus.primary] : [...siteConfig.menus.footer]
  const all = await getCollection('menus')
  const placed = all.filter(menu => (menu.data.locations?.length ? menu.data.locations.some(AREAS[area]) : configured.includes(menu.data.slug)))
  const rank = (menu: Menu) => {
    const index = configured.indexOf(menu.data.slug)
    return index === -1 ? configured.length : index
  }
  const ordered = placed.toSorted((a, b) => rank(a) - rank(b) || String(a.data.locations ?? '').localeCompare(String(b.data.locations ?? '')))
  return Promise.all((area === 'header' ? ordered.slice(0, 1) : ordered).map(async menu => ({ name: menu.data.name, items: await menuItems(menu) })))
}

type Menu = CollectionEntry<'menus'>

async function menuItems(menu: Menu): Promise<NavItem[]> {
  const [items, link] = await Promise.all([resolve(menu.data.items), publicLinks()])
  const hrefs = new Map(await Promise.all(items.map(async item => [item.id, await itemHref(item, link)] as const)))
  const sorted = items.filter(item => hrefs.get(item.id) !== undefined).toSorted((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))
  const node = (item: MenuItem): NavItem => ({
    label: item.data.title,
    href: hrefs.get(item.id)!,
    newTab: item.data.open_in_new_tab,
    children: sorted.filter(child => child.data.parent?.id === item.id).map(node),
  })
  return sorted.filter(item => !item.data.parent).map(node)
}
