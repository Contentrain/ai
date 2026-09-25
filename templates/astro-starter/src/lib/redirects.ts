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
