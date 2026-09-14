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

/** Tags the emitter owns; a source copy of any of these is replaced, not duplicated. */
const TITLE_RE = /<title\b[^>]*>[\s\S]*?<\/title>\s*/gi
const META_RE = /<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:description|og:[^"']*|twitter:[^"']*)["'][^>]*>\s*/gi
const CANONICAL_RE = /<link\b[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'][^>]*>\s*/gi
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

export interface StripResult {
  html: string
  /** What was taken out, for the emit warning — never a silent removal. */
  removed: string[]
  /** Site-wide structured-data types kept out of a block that was otherwise page-scoped. */
  kept: string[]
}

/** Remove the source head's per-page SEO tags so the emitter's own are the only ones. */
export function stripSeoTags(html: string): StripResult {
  const removed: string[] = []
  const kept: string[] = []
  const note = (label: string) => {
    if (!removed.includes(label)) removed.push(label)
  }
  let out = html.replace(TITLE_RE, () => {
    note('<title>')
    return ''
  })
  out = out.replace(META_RE, (tag) => {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? 'meta'
    note(name.toLowerCase().startsWith('og:') ? 'og:*' : name.toLowerCase().startsWith('twitter:') ? 'twitter:*' : name)
    return ''
  })
  out = out.replace(CANONICAL_RE, () => {
    note('canonical')
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
  return { html: out, removed, kept }
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
import { absoluteUrl, imageMetaTags, jsonLd, seoDescription, type ImageMeta } from '../lib/fill'

interface Props {
  title?: string
  /** Meta description; falls back to the entry's excerpt, tags stripped. */
  description?: string
  /** Overrides the generated address — for a page that canonicalises elsewhere. */
  canonical?: string
  /** Social image: absolute, or site-root-relative. */
  image?: string
  /** Size and type of \`image\`, as the producer measured it. */
  imageMeta?: ImageMeta
  /** \`article\` on entry pages, \`website\` on lists and static pages. */
  type?: 'article' | 'website'
  /** ISO 8601 — structured data only; the displayed date stays a mark. */
  publishedAt?: string
  modifiedAt?: string
  author?: string
  siteName?: string
  locale?: string
}

const {
  title = '',
  description,
  canonical,
  image,
  imageMeta,
  type = 'website',
  publishedAt,
  modifiedAt,
  author,
  siteName,
  locale,
} = Astro.props

const site = Astro.site
const url = canonical ? absoluteUrl(canonical, site) : absoluteUrl(Astro.url.pathname, site)
const imageUrl = absoluteUrl(image, site)
const imageTags = imageUrl ? imageMetaTags(imageMeta) : {}
const desc = seoDescription(description)
const article = type === 'article'
const structured = article
  ? {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      ...(desc ? { description: desc } : {}),
      ...(imageUrl ? { image: [imageUrl] } : {}),
      ...(publishedAt ? { datePublished: publishedAt } : {}),
      ...(modifiedAt ? { dateModified: modifiedAt } : {}),
      ...(author ? { author: { '@type': 'Person', name: author } } : {}),
      ...(url ? { mainEntityOfPage: { '@type': 'WebPage', '@id': url } } : {}),
      ...(siteName ? { publisher: { '@type': 'Organization', name: siteName } } : {}),
    }
  : undefined
---
<title>{title}</title>
{desc && <meta name="description" content={desc} />}
{url && <link rel="canonical" href={url} />}
<meta property="og:type" content={type} />
{title && <meta property="og:title" content={title} />}
{desc && <meta property="og:description" content={desc} />}
{url && <meta property="og:url" content={url} />}
{imageUrl && <meta property="og:image" content={imageUrl} />}
{imageTags.width && <meta property="og:image:width" content={imageTags.width} />}
{imageTags.height && <meta property="og:image:height" content={imageTags.height} />}
{imageTags.type && <meta property="og:image:type" content={imageTags.type} />}
{siteName && <meta property="og:site_name" content={siteName} />}
{locale && <meta property="og:locale" content={locale} />}
{article && publishedAt && <meta property="article:published_time" content={publishedAt} />}
{article && modifiedAt && <meta property="article:modified_time" content={modifiedAt} />}
{article && author && <meta property="article:author" content={author} />}
<meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
{title && <meta name="twitter:title" content={title} />}
{desc && <meta name="twitter:description" content={desc} />}
{imageUrl && <meta name="twitter:image" content={imageUrl} />}
{structured && <script is:inline type="application/ld+json" set:html={jsonLd(structured)} />}
`
