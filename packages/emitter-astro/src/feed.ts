// The site's RSS feed and its /llms.txt (MG-15 §3–4).
//
// WordPress serves every site's newest posts as RSS at /feed/, and readers,
// aggregators and newsletter tools subscribe to it; Yoast writes an llms.txt
// that tells a language model what the site holds. A migration that drops
// the first breaks every subscription, and one that never writes the second
// leaves the site harder for AI search to read than it was.
//
// Both are Astro endpoints over the data files the entry pages are built
// from, and address each entry the way its page is addressed — the route
// pattern filled with the entry's parameters — so neither can list a page
// the site does not build, or miss one it does.
//
// The feed is built at /feed.xml, not /feed/: a static build writes an
// endpoint at /feed/ as a file named `feed`, which no host serves at /feed/.
// The theme's head link to the feed is pointed at the new address, and /feed/
// gets a 301 to it in the redirect config and the host's redirect file.

import type { ProjectIR, RouteModel } from '@contentrain/types'
import { DEFAULT_COLLECTION } from './types.js'
import { patternToPagePath } from './util.js'

/** Where the feed is built. */
export const FEED_PATH = '/feed.xml'
/** WordPress's feed address, redirected (301) to FEED_PATH. */
export const FEED_REDIRECT_FROM = '/feed/'
/** Items in the feed — WordPress's default `posts_per_rss`. */
export const FEED_ITEMS = 10
/** Links per llms.txt section. A long archive is summarised by its newest pages. */
export const LLMS_LINKS = 100

/** A collection some route builds one page per entry of, and the pattern it builds them at. */
export interface LinkSource {
  collection: string
  pattern: string
}

/**
 * The collections the site builds entry pages for in its default language,
 * each with the first route that does: posts first, pages next, the rest by
 * name. A route in another language is left out — the feed and llms.txt
 * describe the site as it is in its default one.
 */
export function linkSources(routes: RouteModel[], siteLocale: string): LinkSource[] {
  const byCollection = new Map<string, string>()
  for (const route of routes) {
    if (route.kind !== 'single' && route.collection === undefined) continue
    if ((route.locale ?? siteLocale) !== siteLocale) continue
    const pagePath = patternToPagePath(route.pattern)
    if (!pagePath || !pagePath.includes('[')) continue
    const collection = route.collection ?? DEFAULT_COLLECTION
    if (!byCollection.has(collection)) byCollection.set(collection, route.pattern)
  }
  const rank = (c: string) => (c === DEFAULT_COLLECTION ? 0 : c === 'pages' ? 1 : 2)
  return [...byCollection]
    .map(([collection, pattern]) => ({ collection, pattern }))
    .toSorted((a, b) => rank(a.collection) - rank(b.collection) || (a.collection < b.collection ? -1 : a.collection > b.collection ? 1 : 0))
}

/** An archive route (a category, a tag, an author) whose pages get a feed each, as WordPress's do. */
export interface ArchiveFeedSource {
  routeId: string
  pattern: string
  query: string
}

/**
 * Archive routes in the site's default language whose every page is an
 * address with a feed: a query route with parameters and no page number —
 * `/category/:term*`, `/tag/:term`, `/author/:author`. The paginated
 * continuation (`/category/:term/page/:page`) has no feed of its own.
 */
export function archiveFeedSources(routes: RouteModel[], siteLocale: string): ArchiveFeedSource[] {
  const out: ArchiveFeedSource[] = []
  for (const route of routes) {
    if (!route.query || (route.locale ?? siteLocale) !== siteLocale) continue
    const pagePath = patternToPagePath(route.pattern)
    if (!pagePath || !pagePath.includes('[')) continue
    if (route.pattern.split('/').some((seg) => /^:page\*?$/.test(seg))) continue
    out.push({ routeId: route.id, pattern: route.pattern, query: route.query })
  }
  return out
}

/** Where an archive route's feed endpoint lives: its page path with `/feed.xml` appended. */
export function archiveFeedFile(pattern: string): string | null {
  const pagePath = patternToPagePath(pattern)
  return pagePath ? `src/pages/${pagePath.replace(/\.astro$/, '')}/feed.xml.ts` : null
}

/**
 * The feed of every page an archive route builds — the newest posts it lists,
 * at their own addresses — at `<archive>/feed.xml`. Its entries are the
 * route's own first result set, so the feed lists what the archive page does.
 */
export function archiveFeedEndpoint(source: ArchiveFeedSource, postPattern: string, input: FeedInput): string {
  const locale = JSON.stringify(input.siteLocale)
  const file = archiveFeedFile(source.pattern)!
  const up = '../'.repeat(file.split('/').length - 2)
  const slash = input.trailingSlash === false ? ', false, false' : ''
  return `// Archive feed for route ${source.routeId} (${source.pattern}) — emitted by @contentrain/emitter-astro.
// One feed per page the archive builds, at <archive>/feed.xml, as WordPress serves
// one at <archive>/feed/: the ${FEED_ITEMS} newest posts the archive lists.
import type { APIRoute, GetStaticPaths } from 'astro'
import data from '${up}data/queries/${source.query}.json'
import { absoluteUrl, entryAddress, entryLinks, rssFeed, type EmittedQueryPage } from '${up}lib/fill'

export const getStaticPaths = (() => (data as EmittedQueryPage[]).map((page) => ({ params: page.params, props: { page } }))) satisfies GetStaticPaths

export const GET: APIRoute = ({ props, site }) => {
  const page = (props as { page: EmittedQueryPage }).page
  const address = entryAddress(${JSON.stringify(source.pattern)}, page.params) ?? '/'
  const items = entryLinks(page.items, ${JSON.stringify(postPattern)}, site, ${locale}, ${locale}${slash}).slice(0, ${FEED_ITEMS})
  const body = rssFeed({
    title: page.title || ${JSON.stringify(siteTitle(input.ir))},
    link: absoluteUrl(address, site) ?? '',
    self: absoluteUrl(address + 'feed.xml', site) ?? '',
    description: page.description ?? ${JSON.stringify(input.description ?? '')},
    language: ${locale},
    items,
  })
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
`
}

const sectionName = (collection: string) => collection.charAt(0).toUpperCase() + collection.slice(1).replace(/[-_]+/g, ' ')

function siteTitle(ir: ProjectIR): string {
  if (ir.site.title?.trim()) return ir.site.title.trim()
  try {
    return new URL(ir.site.url).host
  } catch {
    return ir.site.url
  }
}

export interface FeedInput {
  ir: ProjectIR
  siteLocale: string
  /** The site's tagline, for the channel description and the llms.txt summary. */
  description?: string
  /** false: entries are addressed without a trailing slash. */
  trailingSlash?: boolean
}

/** `src/pages/feed.xml.ts`: the newest posts as RSS 2.0. */
export function feedEndpoint(source: LinkSource, input: FeedInput): string {
  const locale = JSON.stringify(input.siteLocale)
  return `// RSS feed at ${FEED_PATH} — emitted by @contentrain/emitter-astro.
// Built from the data the post pages are built from: the ${FEED_ITEMS} newest posts,
// each at the address its own page has.
import type { APIRoute } from 'astro'
import data from '../data/${source.collection}.json'
import { entryLinks, rssFeed, type EmittedPost } from '../lib/fill'

export const GET: APIRoute = ({ site }) => {
  const items = entryLinks(data as EmittedPost[], ${JSON.stringify(source.pattern)}, site, ${locale}, ${locale}${input.trailingSlash === false ? ', false, false' : ''}).slice(0, ${FEED_ITEMS})
  const body = rssFeed({
    title: ${JSON.stringify(siteTitle(input.ir))},
    link: new URL('/', site).toString(),
    self: new URL(${JSON.stringify(FEED_PATH)}, site).toString(),
    description: ${JSON.stringify(input.description ?? '')},
    language: ${locale},
    items,
  })
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
`
}

/** `src/pages/llms.txt.ts`: a section of links per collection. */
export function llmsEndpoint(sources: LinkSource[], input: FeedInput): string {
  const locale = JSON.stringify(input.siteLocale)
  const imports = sources.map((s, i) => `import c${i} from '../data/${s.collection}.json'`)
  const sections = sources.map((s, i) =>
    `    { name: ${JSON.stringify(sectionName(s.collection))}, links: entryLinks(c${i} as EmittedPost[], ${JSON.stringify(s.pattern)}, site, ${locale}, ${locale}, true${input.trailingSlash === false ? ', false' : ''}).slice(0, ${LLMS_LINKS}) },`)
  return `// /llms.txt (llmstxt.org) — emitted by @contentrain/emitter-astro.
// What a language model reads to find its way around the site: its name, its
// tagline, and the newest ${LLMS_LINKS} pages of each kind, at their own addresses —
// none the source kept out of search (noindex).
import type { APIRoute } from 'astro'
${imports.join('\n')}
import { entryLinks, llmsTxt, type EmittedPost } from '../lib/fill'

export const GET: APIRoute = ({ site }) => {
  const body = llmsTxt({
    title: ${JSON.stringify(siteTitle(input.ir))},
    description: ${JSON.stringify(input.description ?? '')},
    sections: [
${sections.join('\n')}
    ],
  })
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
`
}

const FEED_LINK_RE = /<link\b(?=[^>]*\brel\s*=\s*["']?[^"'>]*\balternate\b)(?=[^>]*\btype\s*=\s*["']?application\/(?:rss|atom)\+xml)[^>]*>/gi
const HREF_RE = /(\bhref\s*=\s*)(["'])([^"']*)\2/i

/** www. and the bare host are one site: a WordPress head often names the other. */
const siteHost = (url: URL) => url.host.toLowerCase().replace(/^www\./, '')

/**
 * The feed a head link names, when it is one of the site's own: `main` for
 * WordPress's main RSS feed (/feed/, /feed/rss2/, ?feed=rss2), `other` for
 * the rest it serves (comments, a category, Atom). A feed on another host —
 * FeedBurner, a newsletter tool — is not the site's to build or to break.
 */
function ownFeed(href: string, type: string, site: URL): 'main' | 'other' | undefined {
  let url: URL
  try {
    url = new URL(href, site)
  } catch {
    return undefined
  }
  if (siteHost(url) !== siteHost(site)) return undefined
  const path = url.pathname.replace(/\/+$/, '')
  const query = url.searchParams.get('feed')
  const main = path === '/feed' || path === '/feed/rss2' || path === '/feed/rss' || (path === '' && (query === 'rss2' || query === 'rss'))
  return main && /rss\+xml/i.test(type) ? 'main' : 'other'
}

export interface FeedLinkResult {
  html: string
  /** Links now pointing at FEED_PATH. */
  rewritten: number
  /**
   * The site's other feed links, removed: a category's, a tag's or an
   * author's is the template page's own (each archive page links its feed
   * itself), and a comments or Atom feed is not built.
   */
  other: number
}

/** Point the head's link to the site's main feed at the one the build writes, and remove the template page's others. */
export function rewriteFeedLinks(html: string, siteUrl: string): FeedLinkResult {
  let site: URL
  try {
    site = new URL(siteUrl)
  } catch {
    return { html, rewritten: 0, other: 0 }
  }
  let rewritten = 0
  let other = 0
  const out = html.replace(FEED_LINK_RE, (tag) => {
    const href = HREF_RE.exec(tag)
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? ''
    const kind = href ? ownFeed(href[3] ?? '', type, site) : undefined
    if (kind === 'other') {
      other++
      return ''
    }
    if (kind !== 'main') return tag
    rewritten++
    return tag.replace(HREF_RE, `$1$2${FEED_PATH}$2`)
  })
  return { html: out, rewritten, other }
}
