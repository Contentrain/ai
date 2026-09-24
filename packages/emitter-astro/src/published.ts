// Only published content is built.
//
// The content store keeps every entry the source had — drafts, posts waiting
// for review, posts scheduled for later (WordPress `future`, imported as
// `published` with a `publish_at` ahead), password-protected and private posts.
// Only a public entry whose status is `published` and whose `publish_at`, if it
// has one, has come gets a page, a
// sitemap line, a feed item, an llms.txt link or a card in a list. The rest
// stay in the store for the editor and are held back here, before anything is
// emitted — so every later step (pages, data files, sitemap, feed, redirects,
// hreflang) sees the published site and nothing else.
//
// `publish_at` is compared with the emit time (`EmitOptions.now`). The data
// files carry no unpublished entry, so a scheduled post goes live with the
// next emit after its time, not by rebuilding the same files.
//
// A published page can link to an entry that is held back. The link would
// 404; it is kept as its text instead, and each one is reported.

import type { RouteModel } from '@contentrain/types'
import type { EmitContent, EmitPost, QueryPage, WithheldEntry, WithheldLink } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { entryPath } from './alternates.js'
import { collectionItems } from './pages.js'
import { patternToPagePath } from './util.js'
import { builtAddresses } from './redirects.js'

/** Why an entry is not built, or null when it is. `now` is epoch ms. */
export function holdReason(post: Pick<EmitPost, 'status' | 'publish_at' | 'visibility'>, now: number): WithheldEntry['reason'] | null {
  // Password-protected and private content is never built, whatever its status
  // says — and a visibility this does not know is not taken for public.
  if (post.visibility !== undefined && post.visibility !== 'public') return 'visibility'
  if (post.status !== undefined && post.status !== 'published') return 'status'
  if (post.publish_at === undefined) return null
  const at = Date.parse(post.publish_at)
  // A schedule that cannot be read is not a schedule that has come.
  if (Number.isNaN(at)) return 'publish_at_invalid'
  return at > now ? 'scheduled' : null
}

const bareHost = (host: string) => host.replace(/^www\./, '').toLowerCase()

/** `/a/b` and `/a/b/` are one address. */
const addressKey = (path: string) => (path === '/' ? '/' : `${path.replace(/\/+$/, '')}/`)

export interface PublishedContent {
  content: EmitContent
  withheld: WithheldEntry[]
  links: WithheldLink[]
  /** The addresses held-back entries would have had and no published entry builds (`/a/b/`). */
  gone: Set<string>
}

/**
 * The held-back address an href points at, or null: a site-root path, or an
 * absolute URL on the site's own host (`www.` either way).
 */
export function withheldTarget(href: string, gone: Set<string>, siteUrl?: string): string | null {
  if (!gone.size) return null
  let site: URL | undefined
  try {
    site = siteUrl ? new URL(siteUrl) : undefined
  } catch {
    site = undefined
  }
  let url: URL
  try {
    url = new URL(href, site ?? 'http://site.invalid')
  } catch {
    return null
  }
  const own = site ? bareHost(url.host) === bareHost(site.host) : url.host === 'site.invalid'
  if (!own || !/^https?:$/.test(url.protocol)) return null
  let path = url.pathname
  try {
    path = decodeURI(path)
  } catch { /* keep the encoded path */ }
  return gone.has(addressKey(path)) ? path : null
}

/**
 * The content with every unpublished entry removed — from its collection and
 * from the list pages that carry it as an item — and links to them unwrapped.
 * Content with nothing held back is returned as given.
 */
export function publishedContent(routes: RouteModel[], content: EmitContent, now: number, siteUrl?: string): PublishedContent {
  const withheld: WithheldEntry[] = []
  const keep = (collection: string) => (post: EmitPost) => {
    const reason = holdReason(post, now)
    if (!reason) return true
    withheld.push({ collection, slug: post.slug, ...(post.status ? { status: post.status } : {}), ...(post.visibility ? { visibility: post.visibility } : {}), ...(post.publish_at ? { publish_at: post.publish_at } : {}), reason })
    return false
  }
  const collections = content.collections
    ? Object.fromEntries(Object.entries(content.collections).map(([name, posts]) => [name, posts.filter(keep(name))]))
    : undefined
  const isLive = (post: EmitPost) => holdReason(post, now) === null
  // `posts` is read only when `collections.posts` is absent; filtered either way, reported once.
  const posts = content.posts?.filter(content.collections?.[DEFAULT_COLLECTION] ? isLive : keep(DEFAULT_COLLECTION))
  const queries = content.queries
    ? Object.fromEntries(Object.entries(content.queries).map(([id, pages]) => [id, pages.map((page) => (page.items.every(isLive) ? page : { ...page, items: page.items.filter(isLive) }))]))
    : undefined
  const listedOnly = Object.values(content.queries ?? {}).flat().flatMap((p) => p.items).some((item) => !isLive(item))
  if (!withheld.length && !listedOnly) return { content, withheld, links: [], gone: new Set() }

  const filtered: EmitContent = {
    ...content,
    ...(posts ? { posts } : {}),
    ...(collections ? { collections } : {}),
    ...(queries ? { queries } : {}),
  }

  // The addresses the held-back entries would have had, less any a published
  // entry still builds (a published translation, a page on the same path).
  const built = builtAddresses(routes, filtered)
  const gone = new Set<string>()
  for (const route of routes) {
    const pagePath = patternToPagePath(route.pattern)
    if (!pagePath || !pagePath.includes('[') || (route.kind !== 'single' && route.collection === undefined)) continue
    const collection = route.collection ?? DEFAULT_COLLECTION
    for (const post of collectionItems(content, collection)) {
      const path = entryPath(route.pattern, { ...post.params, slug: post.slug })
      if (path && !isLive(post) && !built.has(addressKey(path))) gone.add(addressKey(path))
    }
  }

  const links: WithheldLink[] = []
  const unlink = (html: string | undefined, page: string): string | undefined => {
    if (!html || !gone.size) return html
    return html.replace(ANCHOR_RE, (anchor, double: string | undefined, single: string | undefined, inner: string) => {
      const to = withheldTarget((double ?? single ?? '').replace(/&amp;/g, '&'), gone, siteUrl)
      if (!to) return anchor
      links.push({ page, href: to })
      return inner
    })
  }
  const unlinkPost = (post: EmitPost, page: string): EmitPost => {
    const body = unlink(post.body, page) ?? post.body
    const excerpt_html = unlink(post.excerpt_html, page)
    return body === post.body && excerpt_html === post.excerpt_html ? post : { ...post, body, ...(excerpt_html !== undefined ? { excerpt_html } : {}) }
  }
  const pageOf = (collection: string, post: EmitPost) => {
    const route = routes.find((r) => (r.kind === 'single' || r.collection !== undefined) && (r.collection ?? DEFAULT_COLLECTION) === collection)
    return (route && entryPath(route.pattern, { ...post.params, slug: post.slug })) ?? `${collection}/${post.slug}`
  }
  if (filtered.collections) {
    filtered.collections = Object.fromEntries(Object.entries(filtered.collections).map(([name, list]) => [name, list.map((p) => unlinkPost(p, pageOf(name, p)))]))
  }
  if (filtered.posts) filtered.posts = filtered.posts.map((p) => unlinkPost(p, pageOf(DEFAULT_COLLECTION, p)))
  if (filtered.queries) {
    filtered.queries = Object.fromEntries(Object.entries(filtered.queries).map(([id, pages]) => [id, pages.map((page: QueryPage) => {
      const route = routes.find((r) => r.query === id)
      const at = (route && entryPath(route.pattern, page.params)) ?? `query ${id}`
      return { ...page, items: page.items.map((item) => unlinkPost(item, at)) }
    })]))
  }
  return { content: filtered, withheld, links, gone }
}

// One anchor with its href and its content. Anchors do not nest, so the first
// closing tag is this one's.
const ANCHOR_RE = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi

/** The report lines for what was held back. */
export function withheldWarnings(withheld: WithheldEntry[], links: WithheldLink[]): string[] {
  const out: string[] = []
  if (withheld.length) {
    const count = (reason: WithheldEntry['reason']) => withheld.filter((w) => w.reason === reason).length
    const parts = [
      count('visibility') && `${count('visibility')} password-protected or private`,
      count('status') && `${count('status')} not published (draft, in review, rejected or archived)`,
      count('scheduled') && `${count('scheduled')} scheduled for later — built by the first emit after their publish_at`,
      count('publish_at_invalid') && `${count('publish_at_invalid')} with a publish_at that is not a date`,
    ].filter(Boolean)
    out.push(`unpublished: ${withheld.length} entries not built — ${parts.join('; ')}. They stay in the content store; EmitResult.withheld lists each`)
  }
  if (links.length) {
    const sample = links.slice(0, 5).map((l) => `${l.href} (on ${l.page})`).join(', ')
    out.push(`unpublished: ${links.length} links from published pages to unpublished entries kept as plain text — ${sample}${links.length > 5 ? ' …' : ''}`)
  }
  return out
}
