// Redirects: the `redirects` collection — old addresses and where they lead
// now, edited in Contentrain Studio like any content. The build turns them
// into a page per old address (an instant redirect any static host serves)
// and the host's own rules (`_redirects`, read by Netlify and Cloudflare
// Pages), so a permanent move answers 301 where the host allows it.
//
// A rule leads where its target lands through the published set: a chain of
// moves is collapsed to its end, and a rule whose target is a draft, a private
// page or another 410 is left out — an old address must not reveal an
// unpublished one.

import { getCollection } from 'astro:content'
import { authorHref, byId, pageHref, termHref } from './content'
import { ownPath, publicLinks, sitePath } from './links'
import { routeTable } from './site-routes'

export type RedirectStatus = 301 | 302 | 303 | 307 | 308
export type RedirectRule = { from: string, to: string, status: RedirectStatus } | { from: string, status: 410 }

const MOVES = new Set<number>([301, 302, 303, 307, 308])
const BASE = 'http://link.invalid/'

/** An address WordPress answers by query (`/?p=12`), whatever the permalink structure: one parameter, one value. */
export interface QueryRule { param: 'p' | 'page_id' | 'cat' | 'tag' | 'author' | 'attachment_id', value: string, to: string, status: RedirectStatus | 410 }
/** Any other old address with a query (`/old.php?id=3`): only a host rule can answer it. */
export interface QueriedRule { path: string, query: ReadonlyArray<readonly [string, string]>, to: string, status: RedirectStatus | 410 }

/** An old address prefix (`/a/*`) and its target, which may carry the matched rest as `:splat` (`/b/:splat`). */
export interface PrefixRule { from: string, to: string, status: RedirectStatus | 410 }

const WP_PARAMS = new Set<string>(['p', 'page_id', 'cat', 'tag', 'author'])

let collected: Promise<{ paths: RedirectRule[], prefixes: PrefixRule[], wp: QueryRule[], queried: QueriedRule[] }> | undefined

/**
 * The redirects collection, split by what can answer each old address: a path gets a page and a host
 * rule; a WordPress query on the front page (`/?page_id=5`) joins the query addresses; any other query
 * is a host rule of its own. A rule leads where its target lands now, or is left out.
 */
function collect() {
  collected ??= (async () => {
    const [entries, routes, link] = await Promise.all([getCollection('redirects'), routeTable(), publicLinks()])
    const paths = new Map<string, RedirectRule>()
    const wp: QueryRule[] = []
    const queried: QueriedRule[] = []
    const prefixes: PrefixRule[] = []
    for (const { data } of entries) {
      // A prefix covers every address under it, live or not (the host serves a built file first), so it is
      // only a host rule. Its target is checked like any link: a whole target through the published set, a
      // `:splat` one by its fixed part, which must lead into public addresses. An external target stays.
      if (data.from.includes('*')) {
        if (data.status === 410) prefixes.push({ from: data.from, to: '/404.html', status: 410 })
        else if (MOVES.has(data.status) && data.to) {
          const target = await prefixTarget(data.to, routes, link)
          if (target) prefixes.push({ from: data.from, to: target, status: data.status as RedirectStatus })
        }
        continue
      }
      const url = new URL(data.from, BASE)
      const from = sitePath(url.pathname)
      const query = [...url.searchParams]
      const to = data.status === 410 ? '/404.html' : MOVES.has(data.status) ? link(data.to) : undefined
      if (to === undefined) continue
      const status = data.status as RedirectStatus | 410
      if (query.length > 0) {
        const [first] = query
        if (from === '/' && query.length === 1 && first && WP_PARAMS.has(first[0])) wp.push({ param: first[0] as QueryRule['param'], value: first[1], to, status })
        else queried.push({ path: from, query, to, status })
        continue
      }
      if (routes.has(from) || paths.has(from) || to === from) continue
      paths.set(from, status === 410 ? { from, status } : { from, to, status })
    }
    return {
      paths: [...paths.values()].toSorted((a, b) => a.from.localeCompare(b.from)),
      // Longest first: a host takes the first rule that matches, so `/a/b/*` must come before `/a/*`.
      prefixes: prefixes.toSorted((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from)),
      wp,
      queried: queried.toSorted((a, b) => a.path.localeCompare(b.path) || String(a.query).localeCompare(String(b.query))),
    }
  })()
  return collected
}

/**
 * A prefix rule's target, or undefined to drop the rule. Without `:splat` it is one address and must be
 * public. With it, the part before `:splat` on this site must be the start of at least one public
 * address (`/blog/:splat` with `/blog/…` built), so the rule cannot reveal a draft's address or send a
 * moved site back to the old host; on another host it is left as it is.
 */
async function prefixTarget(to: string, routes: ReadonlyMap<string, unknown>, link: (url: string | undefined) => string | undefined): Promise<string | undefined> {
  const at = to.indexOf(':splat')
  if (at === -1) return link(to)
  const own = await ownPath(to.slice(0, at))
  if (own === null) return to
  if (own === undefined) return undefined
  return [...routes.keys()].some(href => href.startsWith(own) && href !== own) ? `${own}${to.slice(at)}` : undefined
}

/** An attachment page's old address (`/post/image/`, `/?attachment_id=12`) and where it leads now. */
export interface AttachmentRule { from: string, to: string, status: 301 }

// WordPress's attachment pages, written by the migration's media stage only when there are any. Not
// content: editors do not see or edit them. A host rule each, never a page.
const ATTACHMENT_FILE = import.meta.glob<{ default: ReadonlyArray<{ from: string, to: string, status: number }> }>('/src/data/attachment-redirects.json', { eager: true })

let attached: Promise<{ paths: AttachmentRule[], queries: QueryRule[] }> | undefined

/**
 * The attachment pages' redirects that lead somewhere public: to the parent entry's address, a file in
 * public/ or the old site's file. A path the site builds or the redirects collection already answers is
 * left to them; `/?attachment_id=12` joins the query addresses.
 */
export function attachmentRules(): Promise<{ paths: AttachmentRule[], queries: QueryRule[] }> {
  attached ??= (async () => {
    const [{ paths: own, wp }, routes, link] = await Promise.all([collect(), routeTable(), publicLinks()])
    const taken = new Set(own.map(rule => rule.from))
    const queried = new Set(wp.map(rule => `${rule.param}=${rule.value}`))
    const paths: AttachmentRule[] = []
    const queries: QueryRule[] = []
    for (const entry of Object.values(ATTACHMENT_FILE)[0]?.default ?? []) {
      const to = link(entry.to)
      if (to === undefined) continue
      const url = new URL(entry.from, BASE)
      const id = url.pathname === '/' ? url.searchParams.get('attachment_id') : null
      if (id !== null) {
        if (!queried.has(`attachment_id=${id}`)) queries.push({ param: 'attachment_id', value: id, to, status: 301 })
        continue
      }
      const from = sitePath(url.pathname)
      if (!url.search && !routes.has(from) && !taken.has(from) && to !== from) paths.push({ from, to, status: 301 })
    }
    return { paths: paths.toSorted((a, b) => a.from.localeCompare(b.from)), queries }
  })()
  return attached
}

/** Every redirect of an old path the site serves, sorted by old address. An old address the site still builds is not redirected. */
export async function redirectRules(): Promise<RedirectRule[]> {
  return (await collect()).paths
}

/** Prefix rules (`/a/* /b/:splat 301`), for the host only: no page is built for them. */
export async function prefixRules(): Promise<PrefixRule[]> {
  return (await collect()).prefixes
}

/** Old addresses with a query other than WordPress's own, as host rules (`/old.php id=3 /contact/ 302`). */
export async function queriedRules(): Promise<QueriedRule[]> {
  return (await collect()).queried
}

/**
 * WordPress's query addresses for every public entry — `?p=` posts, `?page_id=` pages, `?cat=`
 * categories, `?tag=` tags, `?author=` authors — leading to where the entry lives now. They are the
 * addresses of a site with plain permalinks and the short links of every other. A static page cannot
 * answer a query, so these exist only as host rules.
 */
export async function queryRules(): Promise<QueryRule[]> {
  const [routes, pages, categories, tags, authors] = await Promise.all([routeTable(), byId('pages'), byId('categories'), byId('tags'), getCollection('authors')])
  const out: QueryRule[] = []
  for (const [href, route] of routes) {
    if (route.view === 'post' && route.post.data.wp_id !== undefined) out.push({ param: 'p', value: String(route.post.data.wp_id), to: href, status: 301 })
  }
  // By page, not by route: the posts page (Settings → Reading) is not a page route but lives at the blog address.
  for (const page of pages.values()) {
    const to = pageHref(page, pages)
    if (page.data.wp_id !== undefined && routes.has(to)) out.push({ param: 'page_id', value: String(page.data.wp_id), to, status: 301 })
  }
  for (const category of categories.values()) {
    const to = termHref('category', category, categories)
    if (category.data.wp_id !== undefined && routes.has(to)) out.push({ param: 'cat', value: String(category.data.wp_id), to, status: 301 })
  }
  for (const tag of tags.values()) {
    const to = termHref('tag', tag, tags)
    if (routes.has(to)) out.push({ param: 'tag', value: tag.data.slug, to, status: 301 })
  }
  for (const author of authors) {
    const to = authorHref(author)
    if (author.data.wp_id !== undefined && routes.has(to)) out.push({ param: 'author', value: String(author.data.wp_id), to, status: 301 })
  }
  // The collection's own query rules (`/?page_id=5`) fill in what the content does not answer; an entry's real address wins.
  const answered = new Set(out.map(rule => `${rule.param}=${rule.value}`))
  for (const rule of [...(await collect()).wp, ...(await attachmentRules()).queries]) {
    if (!answered.has(`${rule.param}=${rule.value}`)) out.push(rule)
    answered.add(`${rule.param}=${rule.value}`)
  }
  return out.toSorted((a, b) => a.param.localeCompare(b.param) || a.value.localeCompare(b.value, undefined, { numeric: true }))
}

/** WordPress query addresses as one lookup: parameter → value → new address. The home page's fallback and `/wp-query-map.json` share it. */
export async function queryMap(): Promise<Record<string, Record<string, string>>> {
  const map: Record<string, Record<string, string>> = {}
  for (const rule of await queryRules()) if (rule.status !== 410) (map[rule.param] ??= {})[rule.value] = rule.to
  return map
}
