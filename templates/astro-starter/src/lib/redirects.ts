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
import { publicLinks, sitePath } from './links'
import { routeTable } from './site-routes'

export type RedirectStatus = 301 | 302 | 303 | 307 | 308
export type RedirectRule = { from: string, to: string, status: RedirectStatus } | { from: string, status: 410 }

const MOVES = new Set<number>([301, 302, 303, 307, 308])

let rules: Promise<RedirectRule[]> | undefined

/** Every redirect the site serves, sorted by old address. An old address the site still builds is not redirected. */
export function redirectRules(): Promise<RedirectRule[]> {
  rules ??= (async () => {
    const [entries, routes, link] = await Promise.all([getCollection('redirects'), routeTable(), publicLinks()])
    const out = new Map<string, RedirectRule>()
    for (const { data } of entries) {
      const from = sitePath(new URL(data.from, 'http://link.invalid/').pathname)
      if (routes.has(from) || out.has(from)) continue
      if (data.status === 410) {
        out.set(from, { from, status: 410 })
        continue
      }
      const to = link(data.to)
      if (to !== undefined && to !== from && MOVES.has(data.status)) out.set(from, { from, to, status: data.status as RedirectStatus })
    }
    return [...out.values()].toSorted((a, b) => a.from.localeCompare(b.from))
  })()
  return rules
}

/** An address WordPress answers by query (`/?p=12`), whatever the permalink structure: one parameter, one value. */
export interface QueryRule { param: 'p' | 'page_id' | 'cat' | 'tag' | 'author', value: string, to: string }

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
    if (route.view === 'post' && route.post.data.wp_id !== undefined) out.push({ param: 'p', value: String(route.post.data.wp_id), to: href })
  }
  // By page, not by route: the posts page (Settings → Reading) is not a page route but lives at the blog address.
  for (const page of pages.values()) {
    const to = pageHref(page, pages)
    if (page.data.wp_id !== undefined && routes.has(to)) out.push({ param: 'page_id', value: String(page.data.wp_id), to })
  }
  for (const category of categories.values()) {
    const to = termHref('category', category, categories)
    if (category.data.wp_id !== undefined && routes.has(to)) out.push({ param: 'cat', value: String(category.data.wp_id), to })
  }
  for (const tag of tags.values()) {
    const to = termHref('tag', tag, tags)
    if (routes.has(to)) out.push({ param: 'tag', value: tag.data.slug, to })
  }
  for (const author of authors) {
    const to = authorHref(author)
    if (author.data.wp_id !== undefined && routes.has(to)) out.push({ param: 'author', value: String(author.data.wp_id), to })
  }
  return out.toSorted((a, b) => a.param.localeCompare(b.param) || a.value.localeCompare(b.value, undefined, { numeric: true }))
}
