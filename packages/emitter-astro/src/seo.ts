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
// feeds, icons, verification tokens, and any JSON-LD that is not per-page
// (Organization, WebSite, BreadcrumbList).

/** Tags the emitter owns; a source copy of any of these is replaced, not duplicated. */
const TITLE_RE = /<title\b[^>]*>[\s\S]*?<\/title>\s*/gi
const META_RE = /<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:description|og:[^"']*|twitter:[^"']*)["'][^>]*>\s*/gi
const CANONICAL_RE = /<link\b[^>]*\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["'][^>]*>\s*/gi
const JSONLD_RE = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>\s*/gi

/**
 * Structured-data types that describe THIS page. An Organization or WebSite
 * block is site-wide and true on every page; an Article block names one post
 * and is a lie on all the others.
 */
const PAGE_LD_TYPES = new Set(['article', 'blogposting', 'newsarticle', 'webpage', 'blogposting', 'techarticle'])

function isPageScopedLd(json: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    // Unparseable JSON-LD is left alone: removing markup we cannot read would
    // be guessing, and a broken block is the theme's problem, not ours.
    return false
  }
  const graph = (parsed as { '@graph'?: unknown })?.['@graph']
  const nodes = Array.isArray(parsed) ? parsed : Array.isArray(graph) ? graph : [parsed]
  return nodes.some((node) => {
    const type = (node as { '@type'?: unknown })?.['@type']
    const types = Array.isArray(type) ? type : [type]
    return types.some((t) => typeof t === 'string' && PAGE_LD_TYPES.has(t.toLowerCase()))
  })
}

export interface StripResult {
  html: string
  /** What was taken out, for the emit warning — never a silent removal. */
  removed: string[]
}

/** Remove the source head's per-page SEO tags so the emitter's own are the only ones. */
export function stripSeoTags(html: string): StripResult {
  const removed: string[] = []
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
  out = out.replace(JSONLD_RE, (tag, json: string) => {
    if (!isPageScopedLd(json)) return tag
    note('page-scoped JSON-LD')
    return ''
  })
  return { html: out, removed }
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
import { absoluteUrl, jsonLd, seoDescription } from '../lib/fill'

interface Props {
  title?: string
  /** Meta description; falls back to the entry's excerpt, tags stripped. */
  description?: string
  /** Overrides the generated address — for a page that canonicalises elsewhere. */
  canonical?: string
  /** Social image: absolute, or site-root-relative. */
  image?: string
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
