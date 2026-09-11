// ─── Reading the few things a document has to say ───
//
// Targeted regexes, not a parser. The same choice `@contentrain/emitter-astro`
// makes, for the same reason: these documents are machine-generated HTML whose
// head we already control, the extracted set is small and fixed, and a parser
// would put a dependency into the one package a migration is supposed to be
// able to run anywhere.
//
// The limits are real and bounded. `head()` splits on the first `</head>`, so a
// document without one yields nothing rather than guessing; attribute reads are
// quote-aware but do not resolve entities beyond the five that matter. Where a
// check would be wrong under those limits, it is not written.

/** Everything before the first `</head>`, or '' when there is none. */
export function head(html: string): string {
  const end = html.search(/<\/head\s*>/i)
  return end === -1 ? '' : html.slice(0, end)
}

/** Everything after the first `</head>`, or the whole document when there is none. */
export function body(html: string): string {
  const end = html.search(/<\/head\s*>/i)
  return end === -1 ? html : html.slice(end)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }

export function decodeEntities(value: string): string {
  return value.replace(/&(#39|amp|lt|gt|quot|apos);/g, (_m, name: string) => ENTITIES[name] ?? _m)
}

/**
 * Read one attribute off a single tag's source. Quote-aware; unquoted allowed.
 *
 * The name must be preceded by whitespace, not merely a word boundary: `-` is
 * not a word character, so `\bhref` matches inside `data-href` — and lazy-
 * loading WordPress themes put the real URL in `data-src` and a placeholder in
 * `src` on almost every image.
 */
export function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const match = re.exec(tag)
  if (!match) return undefined
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '')
}

/** Every `<tag …>` opening tag in the source, as raw strings. */
export function tags(source: string, name: string): string[] {
  return [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => m[0])
}

/**
 * `<title>` texts from the head. `<svg>` blocks are removed first: a `<title>`
 * inside one is an accessibility label, valid markup, and not the page title —
 * counting it would report a duplicate on every page with an inline icon.
 */
export function titles(html: string): string[] {
  const source = head(html).replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, '')
  return [...source.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)]
    .map(m => decodeEntities(m[1] ?? '').trim())
}

/** `<meta name="…">` / `<meta property="…">` content, keyed by lowercased key. */
export function metaMap(html: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const tag of tags(head(html), 'meta')) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase()
    if (!key) continue
    const content = attr(tag, 'content') ?? ''
    found.set(key, [...(found.get(key) ?? []), content])
  }
  return found
}

export interface LinkTag {
  rel: string
  href: string
  hreflang?: string
  type?: string
}

/** `<link>` tags from the head, with `rel` lowercased. */
export function links(html: string): LinkTag[] {
  const found: LinkTag[] = []
  for (const tag of tags(head(html), 'link')) {
    const rel = attr(tag, 'rel')?.toLowerCase()
    const href = attr(tag, 'href')
    if (!rel || href === undefined) continue
    found.push({ rel, href, hreflang: attr(tag, 'hreflang'), type: attr(tag, 'type') })
  }
  return found
}

/** Links whose `rel` list contains the given token. */
export function linksRel(html: string, token: string): LinkTag[] {
  return links(html).filter(link => link.rel.split(/\s+/).includes(token))
}

export interface JsonLdBlock {
  raw: string
  /** Parsed value, or undefined when the block is not valid JSON. */
  value?: unknown
}

/** Every `application/ld+json` block in the document, parsed where possible. */
export function jsonLd(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = []
  const re = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi
  for (const match of html.matchAll(re)) {
    const raw = (match[1] ?? '').trim()
    try {
      blocks.push({ raw, value: JSON.parse(raw) as unknown })
    } catch {
      blocks.push({ raw })
    }
  }
  return blocks
}

/**
 * `@type` values in a JSON-LD block, including those nested in `@graph` —
 * themes commonly ship one graph holding Organization, WebSite and WebPage,
 * and reading only the root would see none of them.
 */
export function jsonLdTypes(value: unknown): string[] {
  const found: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const type = record['@type']
    if (typeof type === 'string') found.push(type)
    else if (Array.isArray(type)) for (const t of type) if (typeof t === 'string') found.push(t)
    if ('@graph' in record) walk(record['@graph'])
  }
  walk(value)
  return found
}

/** `href` of every `<a>` in the document body. */
export function anchors(html: string): string[] {
  return tags(body(html), 'a')
    .map(tag => attr(tag, 'href'))
    .filter((href): href is string => href !== undefined)
}

export interface ImageRef {
  src: string
  /** Absent means no `alt` attribute at all — different from `alt=""`. */
  alt?: string
}

/** Every `<img>` in the document body. */
export function images(html: string): ImageRef[] {
  return tags(body(html), 'img')
    .map(tag => ({ src: attr(tag, 'src') ?? '', alt: attr(tag, 'alt') }))
    .filter(image => image.src !== '')
}

/** Visible text, roughly: script/style stripped, tags removed, runs collapsed. */
export function text(html: string): string {
  return body(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `<loc>` entries of a sitemap or sitemap index. */
export function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map(m => decodeEntities((m[1] ?? '').trim()))
}
