// Image optimization for migrated content (AI-10).
//
// Post bodies arrive as finished HTML and render through `set:html`, so
// Astro's <Image> component cannot reach the images inside them. The
// emitted site instead runs one build-time pass over each page's content:
// every <img> on a host the site is allowed to optimize goes through
// `astro:assets`' `getImage()` — resized to a srcset, re-encoded to WebP,
// width/height filled in — and every <img>, optimized or not, gets
// `loading` (the first one eager with `fetchpriority="high"`, it is usually
// the largest paint; the rest lazy) and `decoding="async"`.
//
// Two emitted files:
// - `src/lib/images.ts` — the pure rewrite, with the optimizer injected. No
//   Astro import, so it is tested and type-checked on its own.
// - `src/lib/optimize-images.ts` — binds it to `getImage()` and the host
//   allow-list; the only file that imports `astro:assets`.

import type { EmitOptions, RemoteImagePattern, RuntimeBinding } from './types.js'

export const DEFAULT_IMAGE_WIDTHS = [480, 768, 1024, 1600]
export const DEFAULT_IMAGE_SIZES = '(max-width: 768px) 100vw, 768px'

export function imagesEnabled(options: EmitOptions): boolean {
  return options.images?.enabled !== false
}

/**
 * The hosts the site may optimize: the producer's list plus the runtime host,
 * because migrated media is rehosted there. Deduplicated, stable order.
 */
export function imagePatterns(options: EmitOptions, runtime?: RuntimeBinding): RemoteImagePattern[] {
  const out: RemoteImagePattern[] = [...(options.images?.remotePatterns ?? [])]
  if (runtime?.base_url) {
    try {
      const url = new URL(runtime.base_url)
      out.push({ protocol: url.protocol === 'http:' ? 'http' : 'https', hostname: url.hostname })
    }
    catch { /* an unparseable base_url adds no pattern */ }
  }
  const seen = new Set<string>()
  return out.filter((p) => {
    const key = `${p.protocol ?? 'https'}|${p.hostname}|${p.pathname ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The `image` block for astro.config.mjs — Astro enforces the same allow-list. */
export function astroImageConfig(patterns: RemoteImagePattern[]): string | null {
  if (patterns.length === 0) return null
  const list = patterns.map((p) => {
    const parts = [`protocol: ${JSON.stringify(p.protocol ?? 'https')}`, `hostname: ${JSON.stringify(p.hostname)}`]
    if (p.pathname) parts.push(`pathname: ${JSON.stringify(`${p.pathname.replace(/\/?$/, '/')}**`)}`)
    return `{ ${parts.join(', ')} }`
  })
  return `  image: { remotePatterns: [${list.join(', ')}] },`
}

export const IMAGES_TS = `// Emitted by @contentrain/emitter-astro — image pass over content HTML.
// Pure: the optimizer is injected (see optimize-images.ts), so this file has
// no Astro dependency and never breaks a page — an image the optimizer
// cannot handle keeps its original markup.

export interface OptimizedImage {
  src: string
  srcset?: string
  width?: number
  height?: number
}

export type ImageOptimizer = (
  src: string,
  hints: { width?: number; height?: number },
) => Promise<OptimizedImage | null>

// Quoted attribute values may hold a ">" (alt="a > b"); the tag ends at the
// first ">" outside quotes.
const IMG_TAG = /<img\\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi
const ATTR = /([^\\s=/>]+)(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+)))?/g
const SKIP_EXT = /\\.(svg|gif)(?:$|[?#])/i

// Attribute values are kept as the source wrote them (entities and all) and
// written back unchanged; only values this pass sets are escaped. Reading a
// value decodes it: a WordPress src like "photo.jpg?w=800&amp;ssl=1" is the
// URL "photo.jpg?w=800&ssl=1".
function parseAttrs(tag: string): Array<[string, string | null]> {
  const inner = tag.replace(/^<img\\b/i, '').replace(/\\/?>$/, '')
  const attrs: Array<[string, string | null]> = []
  for (const m of inner.matchAll(ATTR)) {
    const name = m[1]
    if (!name) continue
    const value = m[2] ?? (m[3] === undefined ? m[4] : m[3].replace(/"/g, '&quot;'))
    attrs.push([name, value === undefined ? null : value])
  }
  return attrs
}

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }

function decodeAttr(value: string): string {
  return value.replace(/&(?:#(\\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, dec, hex, name) => {
    if (dec || hex) {
      const code = dec ? Number(dec) : parseInt(hex, 16)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
    }
    return NAMED[name.toLowerCase()] ?? entity
  })
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function serialize(attrs: Array<[string, string | null]>): string {
  return \`<img\${attrs.map(([n, v]) => (v === null ? \` \${n}\` : \` \${n}="\${v}"\`)).join('')}>\`
}

function positiveInt(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/**
 * Rewrite every <img> in the html. The first image is eager with high fetch
 * priority; the rest are lazy. Images the optimizer accepts get its src,
 * srcset and size. An existing loading or decoding attribute is respected.
 */
export async function rewriteImages(
  html: string,
  optimize: ImageOptimizer,
  options: { sizes: string },
): Promise<string> {
  const tags = html.match(IMG_TAG)
  if (!tags) return html
  const replacements: string[] = []
  for (let index = 0; index < tags.length; index++) {
    const tag = tags[index]!
    const attrs = parseAttrs(tag)
    const get = (name: string) => {
      const raw = attrs.find(([n]) => n.toLowerCase() === name)?.[1]
      return raw == null ? raw : decodeAttr(raw)
    }
    const has = (name: string) => attrs.some(([n]) => n.toLowerCase() === name)
    const set = (name: string, value: string) => {
      const i = attrs.findIndex(([n]) => n.toLowerCase() === name)
      if (i >= 0) attrs[i] = [attrs[i]![0], escapeAttr(value)]
      else attrs.push([name, escapeAttr(value)])
    }
    const remove = (name: string) => {
      const i = attrs.findIndex(([n]) => n.toLowerCase() === name)
      if (i >= 0) attrs.splice(i, 1)
    }

    if (!has('loading')) {
      set('loading', index === 0 ? 'eager' : 'lazy')
      if (index === 0 && !has('fetchpriority')) set('fetchpriority', 'high')
    }
    if (!has('decoding')) set('decoding', 'async')

    const src = get('src')
    const keep = has('data-cr-keep') || !src || src.startsWith('data:') || SKIP_EXT.test(src)
    if (!keep) {
      try {
        const result = await optimize(src, { width: positiveInt(get('width')), height: positiveInt(get('height')) })
        if (result) {
          set('src', result.src)
          if (result.srcset) {
            set('srcset', result.srcset)
            if (!has('sizes')) set('sizes', options.sizes)
          } else {
            // The source's own srcset (WordPress's size variants) would win
            // over the optimized src in every browser that reads srcset.
            remove('srcset')
            remove('sizes')
          }
          if (result.width && result.height && !has('width') && !has('height')) {
            set('width', String(result.width))
            set('height', String(result.height))
          }
        }
      }
      catch {
        // Keep the original image: a failed optimization must not cost the page its picture.
      }
    }
    replacements.push(serialize(attrs))
  }
  let i = 0
  return html.replace(IMG_TAG, () => replacements[i++] ?? '')
}
`

export function optimizeImagesTs(patterns: RemoteImagePattern[], widths: number[], sizes: string): string {
  return `// Emitted by @contentrain/emitter-astro — binds the image pass to astro:assets.
// Only hosts on this list are optimized; Astro enforces the same list
// (image.remotePatterns in astro.config.mjs). Everything else keeps its URL
// and still gets lazy loading and async decoding (see images.ts).
import { getImage } from 'astro:assets'
import { rewriteImages } from './images'

const PATTERNS: Array<{ protocol: string; hostname: string; pathname?: string }> = ${JSON.stringify(patterns.map((p) => ({ protocol: p.protocol ?? 'https', hostname: p.hostname, ...(p.pathname ? { pathname: p.pathname } : {}) })))}
const WIDTHS = ${JSON.stringify(widths.toSorted((a, b) => a - b))}
const SIZES = ${JSON.stringify(sizes)}

// Astro downloads a remote image when the build writes its assets — after
// this pass, outside its error handling — and one image that does not answer
// 200 fails the whole astro build. So an image is only handed to getImage()
// once it answered with an image here; anything else keeps its original URL.
// One check per URL per build.
const CHECK_TIMEOUT_MS = 10_000
const checked = new Map<string, Promise<boolean>>()

async function answersWithImage(src: string, method: 'HEAD' | 'GET'): Promise<boolean | null> {
  try {
    const res = await fetch(src, { method, redirect: 'follow', signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    if (method === 'GET') await res.body?.cancel()
    // Some hosts refuse HEAD; ask again with GET.
    if (method === 'HEAD' && (res.status === 405 || res.status === 501 || res.status === 403)) return null
    return res.ok && (res.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')
  }
  catch {
    return method === 'HEAD' ? null : false
  }
}

function reachable(src: string): Promise<boolean> {
  let pending = checked.get(src)
  if (!pending) {
    pending = answersWithImage(src, 'HEAD').then((ok) => ok ?? answersWithImage(src, 'GET').then((retry) => retry === true))
    checked.set(src, pending)
  }
  return pending
}

function allowed(src: string): boolean {
  let url: URL
  try {
    url = new URL(src)
  }
  catch {
    return false
  }
  return PATTERNS.some((p) =>
    url.protocol === \`\${p.protocol}:\`
    && (p.hostname.startsWith('*.') ? url.hostname.endsWith(p.hostname.slice(1)) : url.hostname === p.hostname)
    && (!p.pathname || url.pathname.startsWith(p.pathname)))
}

export async function optimizeHtmlImages(html: string): Promise<string> {
  if (!html.includes('<img')) return html
  return rewriteImages(html, async (src, hints) => {
    if (!allowed(src) || !(await reachable(src))) return null
    const sized = hints.width !== undefined && hints.height !== undefined
    const widths = WIDTHS.filter((w) => hints.width === undefined || w <= hints.width)
    const image = await getImage({
      src,
      format: 'webp',
      ...(sized ? { width: hints.width, height: hints.height } : { inferSize: true }),
      ...(widths.length ? { widths } : {}),
    })
    const width = Number(image.attributes.width)
    const height = Number(image.attributes.height)
    return {
      src: image.src,
      srcset: image.srcSet.attribute || undefined,
      ...(width > 0 && height > 0 ? { width, height } : {}),
    }
  }, { sizes: SIZES })
}
`
}
