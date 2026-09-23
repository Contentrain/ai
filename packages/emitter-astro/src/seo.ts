// Per-page SEO: the one head region the emitter owns.
//
// A migrated page used to inherit the TEMPLATE page's head verbatim, so every
// post carried the template's `<link rel="canonical">`, its `og:title` and its
// Article JSON-LD. That is worse than having none: a whole site canonicalised
// onto one URL de-indexes itself, and every share card shows the wrong story.
// SEO continuity is the reason a migration keeps the source addresses at all,
// so the emitter derives these tags per page from the entry and removes the
// template's copies rather than letting two of each fight.
//
// What stays: everything else the theme put in `<head>` — charset, preloads,
// feeds, icons, verification tokens, and the structured data that describes
// the site rather than the page (WebSite, Organization).

/**
 * Tags the emitter owns; a source copy of any of these is replaced, not
 * duplicated. `twitter:site` is the site's handle, the same on every page and
 * not derivable from an entry, so it stays in the head.
 */
const TITLE_RE = /<title\b[^>]*>[\s\S]*?<\/title>\s*/gi
const META_RE = /<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:description|robots|googlebot|og:[^"']*|twitter:(?!site["'])[^"']*)["'][^>]*>\s*/gi
const CANONICAL_RE = /<link\b[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'][^>]*>\s*/gi
/**
 * A translation link names the template page's translations. An RSS
 * `rel="alternate"` carries no hreflang and stays.
 */
const HREFLANG_RE = /<link\b(?=[^>]*\brel\s*=\s*["']?[^"'>]*\balternate\b)(?=[^>]*\bhreflang\s*=)[^>]*>\s*/gi
const JSONLD_RE = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>\s*/gi

/**
 * Structured data that describes THIS page. An Article names one post, a
 * WebPage (and every subtype — CollectionPage for an archive, ProfilePage for an
 * author) one address, a BreadcrumbList one page's trail: copied from the
 * template, each is a lie on every other page. Matched by suffix because
 * schema.org names its page and article subtypes that way.
 */
function isPageType(type: string): boolean {
  const t = type.toLowerCase()
  return t.endsWith('page') || t.endsWith('article') || PAGE_POSTINGS.has(t)
}
const PAGE_POSTINGS = new Set(['blogposting', 'liveblogposting', 'socialmediaposting', 'discussionforumposting', 'breadcrumblist'])

/**
 * Structured data that describes the SITE and is true on every page. An
 * SEO plugin writes it into the same `@graph` as the page's own nodes — Yoast
 * and Rank Math put WebSite, Organization, WebPage and BreadcrumbList in one
 * block — so removing page-scoped blocks whole took the site's identity with
 * them.
 */
const SITE_TYPES = new Set([
  'website', 'organization', 'corporation', 'localbusiness', 'newsmediaorganization',
  'educationalorganization', 'ngo', 'onlinebusiness', 'onlinestore', 'governmentorganization',
])

type LdNode = Record<string, unknown>

const typesOf = (node: unknown): string[] => {
  const type = (node as LdNode | null)?.['@type']
  return (Array.isArray(type) ? type : [type]).filter((t): t is string => typeof t === 'string')
}
const isPageNode = (node: unknown) => typesOf(node).some(isPageType)
const isSiteNode = (node: unknown) => typesOf(node).some((t) => SITE_TYPES.has(t.toLowerCase()))

/** Every `{"@id": …}` reference anywhere inside a node. */
function references(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) references(v, out)
  } else if (value && typeof value === 'object') {
    const node = value as LdNode
    const keys = Object.keys(node)
    if (keys.length === 1 && typeof node['@id'] === 'string') out.add(node['@id'])
    for (const v of Object.values(node)) references(v, out)
  }
  return out
}

/**
 * A WebSite's SearchAction points at WordPress search (`/?s=`). A static site
 * has no search endpoint, so the claim would be false on the new site.
 */
function withoutSearchAction(node: LdNode): { node: LdNode; dropped: boolean } {
  const action = node['potentialAction']
  const actions = Array.isArray(action) ? action : action === undefined ? [] : [action]
  const kept = actions.filter((a) => !typesOf(a).includes('SearchAction'))
  if (kept.length === actions.length) return { node, dropped: false }
  const { potentialAction: _, ...rest } = node
  return { node: kept.length ? { ...rest, potentialAction: Array.isArray(action) ? kept : kept[0] } : rest, dropped: true }
}

interface LdDecision {
  /** The block to keep, re-serialized; undefined to keep the original bytes; null to remove it. */
  json: string | null | undefined
  kept: string[]
  droppedSearch: boolean
}

/**
 * What to do with one JSON-LD block. A block with no page-scoped node stays as
 * it was. A block with one loses its page-scoped nodes and keeps the site's —
 * WebSite, Organization — together with the nodes those refer to by `@id` (a
 * logo, the person a personal site is published by), never pulling a page node
 * back in. Nothing site-scoped left means the block goes.
 */
function decideLd(json: string): LdDecision {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    // Unparseable JSON-LD is left alone: removing markup we cannot read would
    // be guessing, and a broken block is the theme's problem, not ours.
    return { json: undefined, kept: [], droppedSearch: false }
  }
  const graph = (parsed as { '@graph'?: unknown } | null)?.['@graph']
  const nodes: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(graph) ? graph : [parsed]
  if (!nodes.some(isPageNode)) return { json: undefined, kept: [], droppedSearch: false }

  const byId = new Map<string, unknown>()
  for (const node of nodes) {
    const id = (node as LdNode | null)?.['@id']
    if (typeof id === 'string') byId.set(id, node)
  }
  const keep = new Set<unknown>(nodes.filter((n) => isSiteNode(n) && !isPageNode(n)))
  const queue = [...keep]
  while (queue.length) {
    for (const id of references(queue.shift())) {
      const target = byId.get(id)
      if (target && !keep.has(target) && !isPageNode(target)) {
        keep.add(target)
        queue.push(target)
      }
    }
  }
  if (!keep.size) return { json: null, kept: [], droppedSearch: false }

  let droppedSearch = false
  const kept = nodes.filter((n) => keep.has(n)).map((n) => {
    if (!typesOf(n).some((t) => t.toLowerCase() === 'website')) return n
    const result = withoutSearchAction(n as LdNode)
    droppedSearch ||= result.dropped
    return result.node
  })
  const context = (parsed as LdNode | null)?.['@context']
  const rebuilt = Array.isArray(parsed)
    ? kept
    : Array.isArray(graph)
      ? { ...(context === undefined ? {} : { '@context': context }), '@graph': kept }
      : kept[0]
  return {
    // `<` escaped so a string value can never close the script element.
    json: JSON.stringify(rebuilt).replace(/</g, '\\u003c'),
    kept: [...new Set(kept.flatMap(typesOf))],
    droppedSearch,
  }
}

/**
 * \`@id\` of the WebSite node in a head's structured data, if it declares one
 * — the node the page's WebPage says it is part of. Only what the head says:
 * no id, no link.
 */
export function websiteIdOf(html: string): string | undefined {
  for (const match of html.matchAll(JSONLD_RE)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1] ?? '')
    } catch {
      continue
    }
    const graph = (parsed as { '@graph'?: unknown } | null)?.['@graph']
    const nodes: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(graph) ? graph : [parsed]
    for (const node of nodes) {
      const id = (node as LdNode | null)?.['@id']
      if (typeof id === 'string' && id && typesOf(node).some((t) => t.toLowerCase() === 'website')) return id
    }
  }
  return undefined
}

/**
 * \`@id\` of every node in a head's structured data — the site's own nodes
 * (WebSite, Organization, its logo) that every page already carries. A page's
 * plugin graph repeats them; printing them twice is valid but is noise.
 */
export function headLdIdsOf(html: string): string[] {
  const ids: string[] = []
  for (const match of html.matchAll(JSONLD_RE)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1] ?? '')
    } catch {
      continue
    }
    const graph = (parsed as { '@graph'?: unknown } | null)?.['@graph']
    const nodes: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(graph) ? graph : [parsed]
    for (const node of nodes) {
      const id = (node as LdNode | null)?.['@id']
      if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

/**
 * `@id` of the node that publishes the site, as the head's structured data
 * says: the WebSite's own `publisher` reference (Yoast and Rank Math write
 * one — an Organization, or the Person a personal site is published by),
 * else the head's first Organization. The Article names it by `@id`, so the
 * logo and profile the site declared count for every post.
 */
export function publisherIdOf(html: string): string | undefined {
  // A reference only counts when the node it names is on the page: an Article
  // pointing at an @id nothing declares names no one.
  const declared = new Set(headLdIdsOf(html))
  let organization: string | undefined
  for (const match of html.matchAll(JSONLD_RE)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1] ?? '')
    } catch {
      continue
    }
    const graph = (parsed as { '@graph'?: unknown } | null)?.['@graph']
    const nodes: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(graph) ? graph : [parsed]
    for (const node of nodes) {
      const types = typesOf(node).map((t) => t.toLowerCase())
      if (types.includes('website')) {
        const ref = (node as LdNode)['publisher']
        const id = (Array.isArray(ref) ? ref[0] : ref) as LdNode | undefined
        if (typeof id?.['@id'] === 'string' && declared.has(id['@id'])) return id['@id']
      }
      const id = (node as LdNode | null)?.['@id']
      if (!organization && typeof id === 'string' && id && isSiteNode(node) && !types.includes('website')) organization = id
    }
  }
  return organization
}

export interface StripResult {
  html: string
  /** What was taken out, for the emit warning — never a silent removal. */
  removed: string[]
  /** Site-wide structured-data types kept out of a block that was otherwise page-scoped. */
  kept: string[]
  /**
   * The robots directives of the template's `robots` / `googlebot` tags that
   * are site settings rather than this page's indexing — Yoast's
   * `max-image-preview:large, max-snippet:-1, max-video-preview:-1`. The Seo
   * component prints them on every page, after the page's own noindex/nofollow.
   */
  robots: string[]
}

/** Directives that say whether THIS page is indexed or followed; everything else is a site setting. */
const PAGE_ROBOTS = new Set(['index', 'noindex', 'follow', 'nofollow', 'all', 'none'])

function siteRobots(tag: string, into: string[]): void {
  const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
  for (const raw of (content?.[1] ?? content?.[2] ?? '').split(',')) {
    const directive = raw.trim().toLowerCase()
    if (directive && !PAGE_ROBOTS.has(directive) && !into.includes(directive)) into.push(directive)
  }
}

/** Remove the source head's per-page SEO tags so the emitter's own are the only ones. */
export function stripSeoTags(html: string): StripResult {
  const removed: string[] = []
  const kept: string[] = []
  const robots: string[] = []
  const note = (label: string) => {
    if (!removed.includes(label)) removed.push(label)
  }
  let out = html.replace(TITLE_RE, () => {
    note('<title>')
    return ''
  })
  out = out.replace(META_RE, (tag) => {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? 'meta'
    if (/^(?:robots|googlebot)$/i.test(name)) siteRobots(tag, robots)
    note(name.toLowerCase().startsWith('og:') ? 'og:*' : name.toLowerCase().startsWith('twitter:') ? 'twitter:*' : name)
    return ''
  })
  out = out.replace(CANONICAL_RE, () => {
    note('canonical')
    return ''
  })
  out = out.replace(HREFLANG_RE, () => {
    note('hreflang')
    return ''
  })
  out = out.replace(JSONLD_RE, (tag: string, json: string) => {
    const decision = decideLd(json)
    if (decision.json === undefined) return tag
    note('page-scoped JSON-LD')
    if (decision.droppedSearch) note('WebSite SearchAction')
    for (const type of decision.kept) if (!kept.includes(type)) kept.push(type)
    if (decision.json === null) return ''
    const open = tag.slice(0, tag.indexOf('>') + 1)
    return `${open}${decision.json}</script>\n`
  })
  return { html: out, removed, kept, robots }
}

/**
 * Head-only tags found in BODY chrome. A browser that closed `<head>` early
 * leaves the template's canonical and og tags in the body, and a faithful clone
 * carries them there — so the page ends up with the emitter's correct tags AND
 * the template's stale ones, which no fidelity score can see.
 *
 * They are reported, not removed: the body is page content, and `<title>` is
 * legal inside `<svg>`, so cutting tags out of it would break real markup to
 * fix an invisible one. Only unambiguous head tags are looked for.
 */
export function bodySeoLeaks(html: string): string[] {
  const found: string[] = []
  if (/<link\b[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b/i.test(html)) found.push('canonical')
  if (/<meta\b[^>]*\bproperty\s*=\s*["']og:/i.test(html)) found.push('og:*')
  if (/<meta\b[^>]*\bname\s*=\s*["']description["']/i.test(html)) found.push('description')
  return found
}

/**
 * `src/components/Seo.astro`. The canonical address comes from `Astro.url` and
 * `Astro.site` rather than from data: it is then, by construction, the address
 * Astro actually generated, and no producer has to recompute a permalink.
 */
export const SEO_COMPONENT = `---
/**
 * Per-page SEO — emitted by @contentrain/emitter-astro.
 *
 * Title, description, canonical, Open Graph, Twitter card and (on entry pages)
 * Article structured data, derived from the entry. The source theme's copies of
 * these tags are removed from the head chrome at emit time, so each appears once.
 *
 * Canonical and absolute URLs need \`site\` in astro.config.mjs; without it the
 * canonical link and og:url are omitted rather than pointing at a build host.
 */
import { absoluteUrl, imageMetaTags, jsonLd, ogLocale, pagePath, pageStructuredData, seoDescription, sourceStructuredData, type AuthorProfile, type Breadcrumb, type ImageMeta, type SocialOverride, type TwitterOverride } from '../lib/fill'

interface Props {
  /** The document title — an SEO plugin's composed one when the source had it. */
  title?: string
  /** The entry's own title, when it differs from \`title\`: Article headline, last breadcrumb. */
  headline?: string
  /** Meta description; falls back to the entry's excerpt, tags stripped. */
  description?: string
  /** Overrides the generated address — for a page that canonicalises elsewhere. */
  canonical?: string
  /** Social image: absolute, or site-root-relative. */
  image?: string
  /** Size and type of \`image\`, as the producer measured it. */
  imageMeta?: ImageMeta
  /** This page's translations, itself included, plus x-default. */
  alternates?: Array<{ lang: string; path: string }>
  /** The trail to this page, itself excluded — the page is appended with its own address. */
  breadcrumbs?: Breadcrumb[]
  /** \`CollectionPage\` on a list; \`WebPage\` otherwise. */
  pageType?: 'WebPage' | 'CollectionPage'
  /** \`@id\` of the site's WebSite node kept in the head chrome, when there is one. */
  websiteId?: string
  /** \`@id\` of the node the kept head says publishes the site — the Article's publisher. */
  publisherId?: string
  /** false: the site's addresses end without a slash (\`/hello\`), as the source's did. */
  trailingSlash?: boolean
  /** \`@id\` of every structured-data node the head chrome keeps — not repeated from \`schema\`. */
  headLdIds?: string[]
  /** \`article\` on entry pages, \`website\` on lists and static pages. */
  type?: 'article' | 'website'
  /** ISO 8601 — structured data only; the displayed date stays a mark. */
  publishedAt?: string
  modifiedAt?: string
  author?: string
  /** The author's page, for the Article author's \`url\`. */
  authorUrl?: string
  /** On an author's archive: who the page is about — ProfilePage + Person. */
  profile?: AuthorProfile
  siteName?: string
  locale?: string
  /** The page is kept out of search: \`<meta name="robots" content="noindex">\`. */
  noindex?: boolean
  nofollow?: boolean
  /** Site-wide robots directives from the template head (\`max-image-preview:large\`, …), printed on every page. */
  robotsDefault?: string[]
  /** Share-card values the source set by hand, over the derived ones. */
  openGraph?: SocialOverride
  /** Unset values follow Open Graph. */
  twitter?: TwitterOverride
  /** The source SEO plugin's JSON-LD for this page — printed instead of the generated graph. */
  schema?: unknown
}

const {
  title = '',
  headline,
  description,
  canonical,
  image,
  imageMeta,
  alternates = [],
  breadcrumbs,
  pageType,
  websiteId,
  publisherId,
  trailingSlash = true,
  headLdIds = [],
  type = 'website',
  publishedAt,
  modifiedAt,
  author,
  authorUrl,
  profile,
  siteName,
  locale,
  noindex = false,
  nofollow = false,
  robotsDefault = [],
  openGraph,
  twitter,
  schema,
} = Astro.props

const site = Astro.site
const url = canonical ? absoluteUrl(canonical, site) : absoluteUrl(pagePath(Astro.url.pathname, trailingSlash), site)
const imageUrl = absoluteUrl(image, site)
const imageTags = imageUrl ? imageMetaTags(imageMeta) : {}
// hreflang needs absolute URLs; without \`site\` there are none to give.
const hreflang = alternates.flatMap((a) => {
  const href = absoluteUrl(pagePath(a.path, trailingSlash), site)
  return href ? [{ lang: a.lang, href }] : []
})
// og:locale takes ll_RR; a language without a region has no such form and is left out.
const ogLang = ogLocale(locale)
const localeAlternates = [...new Set(hreflang.map((a) => ogLocale(a.lang)))].filter((l): l is string => Boolean(l) && l !== ogLang)
const desc = seoDescription(description)
const robots = [noindex && 'noindex', nofollow && 'nofollow', ...robotsDefault].filter(Boolean).join(', ')
// Share cards: what the source set by hand, else what the page says.
const ogTitle = openGraph?.title || title
const ogDesc = seoDescription(openGraph?.description) ?? desc
const ogImage = absoluteUrl(openGraph?.image, site) ?? imageUrl
// The measurements describe \`image\`; an override is another file.
const ogImageTags = ogImage === imageUrl ? imageTags : {}
const twTitle = twitter?.title || ogTitle
const twDesc = seoDescription(twitter?.description) ?? ogDesc
const twImage = absoluteUrl(twitter?.image, site) ?? ogImage
const twCard = twitter?.card === 'summary' || twitter?.card === 'summary_large_image' ? twitter.card : twImage ? 'summary_large_image' : 'summary'
const article = type === 'article'
const structured = sourceStructuredData(schema, headLdIds) ?? pageStructuredData({
  url,
  site,
  title,
  headline,
  description: desc,
  image: imageUrl,
  imageMeta: imageUrl ? imageMeta : undefined,
  locale,
  article,
  pageType,
  publishedAt,
  modifiedAt,
  author,
  authorUrl,
  profile,
  trailingSlash,
  siteName,
  websiteId,
  publisherId,
  breadcrumbs,
})
---
<title>{title}</title>
{robots && <meta name="robots" content={robots} />}
{desc && <meta name="description" content={desc} />}
{url && <link rel="canonical" href={url} />}
{hreflang.map((a) => <link rel="alternate" hreflang={a.lang} href={a.href} />)}
<meta property="og:type" content={type} />
{ogTitle && <meta property="og:title" content={ogTitle} />}
{ogDesc && <meta property="og:description" content={ogDesc} />}
{url && <meta property="og:url" content={url} />}
{ogImage && <meta property="og:image" content={ogImage} />}
{ogImageTags.width && <meta property="og:image:width" content={ogImageTags.width} />}
{ogImageTags.height && <meta property="og:image:height" content={ogImageTags.height} />}
{ogImageTags.type && <meta property="og:image:type" content={ogImageTags.type} />}
{siteName && <meta property="og:site_name" content={siteName} />}
{ogLang && <meta property="og:locale" content={ogLang} />}
{localeAlternates.map((l) => <meta property="og:locale:alternate" content={l} />)}
{article && publishedAt && <meta property="article:published_time" content={publishedAt} />}
{article && modifiedAt && <meta property="article:modified_time" content={modifiedAt} />}
{article && author && <meta property="article:author" content={author} />}
<meta name="twitter:card" content={twCard} />
{twTitle && <meta name="twitter:title" content={twTitle} />}
{twDesc && <meta name="twitter:description" content={twDesc} />}
{twImage && <meta name="twitter:image" content={twImage} />}
{structured && <script is:inline type="application/ld+json" set:html={jsonLd(structured)} />}
`
