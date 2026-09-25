// Links to what the public can see. A migrated store keeps drafts, private
// pages and the source site's absolute URLs; a public build points at none of
// them. Every internal link resolves through the route table — the published
// set — or is dropped: a menu item without a public target is left out, a link
// in a body becomes its text. External links pass through unchanged.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getCollection, getEntry, type CollectionEntry } from 'astro:content'
import type { NavItem } from '../components/kit/_shared/types'
import { byId, getSite, pageHref, postHref, resolve, termHref } from './content'
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
    const [routes, site, redirects] = await Promise.all([routeTable(), getSite(), getCollection('redirects')])
    // The source's hosts are fixed at build time; the site singleton's url is editable in Studio.
    const internal = new Set([BASE, import.meta.env.SITE, site.url, ...siteConfig.sourceHosts].flatMap((url) => {
      const host = url ? hostOf(url) : undefined
      return host ? [host] : []
    }))
    const rules = new Map(redirects.map(entry => [sitePath(new URL(entry.data.from, `${BASE}/`).pathname), entry.data]))
    // WordPress's own short links (`/?p=12`, `/?page_id=7`) point at the entry, wherever it lives now.
    const byWpId = new Map<number, string>()
    for (const [href, route] of routes) {
      if (route.view === 'post' && route.post.data.wp_id !== undefined) byWpId.set(route.post.data.wp_id, href)
      if (route.view === 'page' && route.page.data.wp_id !== undefined) byWpId.set(route.page.data.wp_id, href)
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
      if (!Number.isNaN(shortLink)) return byWpId.get(shortLink)
      const path = sitePath(parsed.pathname)
      const rule = routes.has(path) ? undefined : rules.get(path)
      if (rule) return followed.has(path) || rule.status === 410 ? undefined : link(rule.to, new Set([...followed, path]))
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

/** Rich text with its links made public: internal links become site paths, links to what is not public become their text. */
export async function publicHtml(html: string): Promise<string>
export async function publicHtml(html: string | undefined): Promise<string | undefined>
export async function publicHtml(html: string | undefined): Promise<string | undefined> {
  if (!html?.includes('<a')) return html
  const link = await publicLinks()
  return html.replace(ANCHOR, (anchor, attributes: string, inner: string) => {
    const match = HREF.exec(attributes)
    if (!match) return anchor
    const stored = decode(match[1] ?? match[2] ?? '')
    const href = link(stored)
    if (href === undefined) return inner
    return href === stored ? anchor : `<a${attributes.replace(HREF, `href="${encode(href)}"`)}>${inner}</a>`
  })
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
    default:
      return undefined
  }
}

/**
 * A menu as a tree, ordered as the editor ordered it. An item whose target is not public — a draft,
 * a private page, a deleted entry — is left out with the items under it: its label may be a draft's
 * title. An unknown menu is empty.
 */
export async function getMenu(slug: string): Promise<NavItem[]> {
  const menus = await getCollection('menus', menu => menu.data.slug === slug)
  const menu = menus[0]
  if (!menu) return []
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
