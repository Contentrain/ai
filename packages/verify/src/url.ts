// ─── Addresses ───
//
// Every check that asks "does this link go somewhere that exists" is really
// asking a normalisation question, and getting it wrong in either direction is
// worse than not asking: too strict and a correct site fails its gate, too
// loose and a broken one passes.
//
// The rules here are deliberately conservative. A trailing slash and an
// `index.html` are the same address, because static hosts serve them that way.
// A query string and a fragment are not part of a document's identity. Case is
// preserved in the path, because static hosts are case-sensitive even when the
// author assumed otherwise.

const SITE_FALLBACK = 'https://contentrain.invalid'

/** Absolute URL for `href` as seen from `base`, or undefined when unresolvable. */
export function resolve(href: string, base: string, site?: string): string | undefined {
  try {
    const origin = site ?? SITE_FALLBACK
    const absoluteBase = base.startsWith('http') ? base : new URL(base, origin).href
    return new URL(href, absoluteBase).href
  } catch {
    return undefined
  }
}

/** Whether a resolved URL belongs to the site under test. */
export function isInternal(url: string, site?: string, extraHosts: readonly string[] = []): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (!site) return parsed.origin === SITE_FALLBACK || extraHosts.includes(parsed.host)
    return parsed.host === new URL(site).host || extraHosts.includes(parsed.host)
  } catch {
    return false
  }
}

/**
 * The identity of a document: path only, with `index.html` and a trailing
 * slash removed, query and fragment dropped. `/` stays `/`.
 */
export function identity(url: string, site?: string): string {
  const full = url.startsWith('http') ? url : resolve(url, '/', site) ?? url
  let path: string
  try {
    path = new URL(full).pathname
  } catch {
    path = full.split(/[?#]/)[0] ?? full
  }
  path = path.replace(/\/index\.html?$/i, '/')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path === '' ? '/' : path
}

/** Absolute form of a document's own address, when the site origin is known. */
export function absolute(url: string, site?: string): string | undefined {
  if (url.startsWith('http')) return url
  if (!site) return undefined
  try {
    return new URL(url, site).href
  } catch {
    return undefined
  }
}
