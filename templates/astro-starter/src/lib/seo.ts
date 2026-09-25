// Structured data (schema.org JSON-LD). Builders return plain objects; the SEO
// component serializes them, so a page states what it is without writing JSON
// by hand.

type Thing = Record<string, unknown>

export interface SiteIdentity {
  name: string
  url: string
  description?: string | undefined
  logo?: string | undefined
  sameAs?: readonly string[] | undefined
}

export function websiteLd(site: SiteIdentity): Thing {
  return {
    '@type': 'WebSite',
    '@id': `${site.url}#website`,
    name: site.name,
    url: site.url,
    ...(site.description ? { description: site.description } : {}),
    publisher: { '@id': `${site.url}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${site.url}search/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function organizationLd(site: SiteIdentity): Thing {
  return {
    '@type': 'Organization',
    '@id': `${site.url}#organization`,
    name: site.name,
    url: site.url,
    ...(site.logo ? { logo: site.logo } : {}),
    ...(site.sameAs?.length ? { sameAs: site.sameAs } : {}),
  }
}

export interface ArticleInput {
  url: string
  headline: string
  description?: string | undefined
  image?: string | undefined
  published?: Date | undefined
  modified?: Date | undefined
  author?: { name: string, url: string } | undefined
  section?: string | undefined
  keywords?: readonly string[] | undefined
}

export function articleLd(site: SiteIdentity, article: ArticleInput): Thing {
  return {
    '@type': 'BlogPosting',
    '@id': `${article.url}#article`,
    mainEntityOfPage: article.url,
    headline: article.headline,
    ...(article.description ? { description: article.description } : {}),
    ...(article.image ? { image: article.image } : {}),
    ...(article.published ? { datePublished: article.published.toISOString() } : {}),
    ...(article.modified ?? article.published ? { dateModified: (article.modified ?? article.published)!.toISOString() } : {}),
    ...(article.author ? { author: { '@type': 'Person', name: article.author.name, url: article.author.url } } : {}),
    ...(article.section ? { articleSection: article.section } : {}),
    ...(article.keywords?.length ? { keywords: article.keywords.join(', ') } : {}),
    publisher: { '@id': `${site.url}#organization` },
    isPartOf: { '@id': `${site.url}#website` },
  }
}

export function breadcrumbLd(trail: ReadonlyArray<{ name: string, url: string }>): Thing {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
  }
}

export function collectionLd(url: string, name: string): Thing {
  return { '@type': 'CollectionPage', '@id': `${url}#collection`, url, name }
}

/** One `@graph` document; `<` is escaped so a value can never close the script element. */
export function serializeLd(things: readonly Thing[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': things }).replace(/</g, '\\u003c')
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

/**
 * A meta description from a rich-text body, for an entry that has neither an
 * SEO description nor an excerpt: its text, cut at a word boundary. Search
 * engines write their own snippet when a page has none; this keeps the
 * choice with the site.
 */
export function summarize(html: string | undefined, max = 160): string | undefined {
  if (!html) return undefined
  const text = html
    .replace(/<(script|style|figcaption)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith('#')) {
        const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
        return Number.isFinite(code) ? String.fromCodePoint(code) : entity
      }
      return ENTITIES[name.toLowerCase()] ?? entity
    })
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > max / 2 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:.–—-]+$/, '')}…`
}
