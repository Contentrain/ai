// The live site's own redirect rules → Astro's `redirects` config (AI-11).
//
// Only a plain one-to-one rule can be written: `match` absent or `url`, not a
// regular expression, a site-root `from` without a query string, and a
// status Astro serves as a redirect. Everything else is returned with its
// reason as a rule to set up by hand at the host. Turning a pattern into a
// literal `from` would produce a redirect that matches the wrong address, so
// the emitter never guesses.
//
// A rule whose `from` is an address the migrated site builds a page at is
// not written either: the page holds the content. Astro does not refuse the
// pair — the redirect is written over the page and the build reports no
// error, so the page would vanish silently.
//
// In a static build Astro serves a redirect as an HTML page with a
// meta refresh, `noindex` and a canonical link to the target; the status
// reaches crawlers only through a host adapter that writes the host's own
// redirect file.

import type { RawRedirect, RouteModel } from '@contentrain/types'
import type { EmitContent } from './types.js'
import { DEFAULT_COLLECTION } from './types.js'
import { entryPath } from './alternates.js'
import { collectionItems } from './pages.js'
import { patternToPagePath } from './util.js'

/** The statuses written to `astro.config`; any other is a manual rule. */
export const REDIRECT_STATUSES = [301, 302, 307, 308] as const
export type RedirectStatus = typeof REDIRECT_STATUSES[number]

/** A rule the emitter did not write, with why. */
export interface ManualRedirect {
  redirect: RawRedirect
  reason: string
}

export interface RedirectPlan {
  /** `from` → rule, as `astro.config` `redirects` takes it. Sorted by `from`. */
  config: Record<string, { status: RedirectStatus; destination: string }>
  /** The input rules written, in input order. */
  written: RawRedirect[]
  /** The rules to set up by hand at the host, in input order. */
  manual: ManualRedirect[]
}

/** Whitespace, a control character or DEL anywhere in the string. */
const hasControlOrSpace = (value: string): boolean =>
  [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)

/** `/old/` and `/old` are one address in the directory build format. */
function addressKey(path: string): string {
  return path === '/' ? '/' : `${path.replace(/\/+$/, '')}/`
}

/**
 * Every address the emitted site builds a page at, as `addressKey`s, with the
 * route that owns it. Single and collection routes build one page per entry,
 * query routes one per result set, and a route without parameters one page.
 */
export function builtAddresses(routes: RouteModel[], content: EmitContent): Map<string, string> {
  const out = new Map<string, string>()
  const put = (path: string | null, routeId: string) => {
    if (path !== null && !out.has(addressKey(path))) out.set(addressKey(path), routeId)
  }
  for (const route of routes) {
    const pagePath = patternToPagePath(route.pattern)
    if (!pagePath) continue
    if (!pagePath.includes('[')) {
      put(entryPath(route.pattern, {}), route.id)
      continue
    }
    if (route.kind === 'single' || route.collection !== undefined) {
      for (const post of collectionItems(content, route.collection ?? DEFAULT_COLLECTION)) {
        put(entryPath(route.pattern, { ...post.params, slug: post.slug }), route.id)
      }
    }
    if (route.query) {
      for (const page of content.queries?.[route.query] ?? []) put(entryPath(route.pattern, page.params), route.id)
    }
  }
  return out
}

/** The decoded path for a literal Astro redirect key, or why `from` cannot be one. */
function checkFrom(from: string, hostOnly = false): { path: string } | { reason: string } {
  if (!from.startsWith('/') || from.startsWith('//')) return { reason: 'from is not a site-root path' }
  if (/[?#]/.test(from)) return { reason: 'from has a query string or fragment — a static redirect matches the path only' }
  let path: string
  try {
    path = decodeURI(from)
  }
  catch {
    return { reason: 'from is not a valid percent-encoded path' }
  }
  if (hasControlOrSpace(path) || path.includes('\\')) return { reason: 'from contains whitespace, control characters or a backslash' }
  // Astro reads brackets in a route as parameters.
  if (/[[\]]/.test(path)) return { reason: 'from contains [ or ], which Astro reads as a route parameter' }
  const segments = path.split('/').filter(Boolean)
  if (segments.some((s) => s === '.' || s === '..')) return { reason: 'from contains a . or .. segment' }
  // The directory build writes a redirect as `<from>/index.html`; a host
  // serving `/old.php` looks for that file, not the directory. A host file
  // matches the address itself, so a host-only rule may name a file.
  if (!hostOnly && /\.[a-z0-9]{1,5}$/i.test(segments.at(-1) ?? '')) return { reason: 'from ends in a file name — the static build serves it as a directory, not at this address' }
  return { path }
}

function checkTo(to: string): boolean {
  if (hasControlOrSpace(to)) return false
  if (to.startsWith('/')) return !to.startsWith('//')
  try {
    const url = new URL(to)
    return url.protocol === 'https:' || url.protocol === 'http:'
  }
  catch {
    return false
  }
}

/**
 * Split the rules into what `astro.config` serves and what the host has to.
 * `built` is `builtAddresses` of the emitted routes. `hostOnly`: the rules go
 * to host files alone (`EmitInput.hostRedirects`), so the checks that hold
 * only for a static redirect page (a `from` naming a file) are left out.
 */
export function planRedirects(redirects: RawRedirect[], built: Map<string, string>, options: { hostOnly?: boolean } = {}): RedirectPlan {
  const config: RedirectPlan['config'] = {}
  const written: RawRedirect[] = []
  const manual: ManualRedirect[] = []
  const claimed = new Set<string>()
  const builtLower = new Map([...built].map(([address, route]) => [address.toLowerCase(), [address, route] as const]))

  for (const redirect of redirects) {
    const skip = (reason: string) => manual.push({ redirect, reason })
    if (redirect.regex) { skip('from is a regular expression'); continue }
    if (redirect.match !== undefined && redirect.match !== 'url') { skip(`match "${redirect.match}" is a pattern, not one address`); continue }
    const status = redirect.status ?? 301
    if (!(REDIRECT_STATUSES as readonly number[]).includes(status)) { skip(`status ${status} is not one of ${REDIRECT_STATUSES.join('/')}`); continue }
    const from = checkFrom(redirect.from, options.hostOnly)
    if ('reason' in from) { skip(from.reason); continue }
    if (!checkTo(redirect.to)) { skip('to is not a site-root path or an http(s) URL'); continue }
    const key = addressKey(from.path)
    const owner = built.get(key)
    if (owner !== undefined) { skip(`the migrated site builds a page at ${key} (route ${owner}) — the page is kept`); continue }
    // Netlify matches rules case-insensitively, and macOS and Windows file
    // systems cannot hold /About/index.html beside /about/index.html: either
    // way the redirect would be served over the page, or loop into it.
    const caseTwin = builtLower.get(key.toLowerCase())
    if (caseTwin) { skip(`from differs only in letter case from the page at ${caseTwin[0]} (route ${caseTwin[1]}) — a case-insensitive host or file system would serve the redirect over it; the page is kept`); continue }
    if (claimed.has(key)) { skip(`another rule already redirects ${key}`); continue }
    if (!/^https?:/.test(redirect.to)) {
      let target: string
      try {
        target = decodeURI(redirect.to.replace(/[?#].*$/, ''))
      }
      catch {
        target = redirect.to
      }
      if (addressKey(target) === key) { skip('to is the same address as from'); continue }
    }
    claimed.add(key)
    config[from.path] = { status: status as RedirectStatus, destination: redirect.to }
    written.push(redirect)
  }

  const sorted = Object.fromEntries(Object.entries(config).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return { config: sorted, written, manual }
}

/** The `redirects` line for astro.config.mjs, or null when there is nothing to write. */
export function astroRedirectsConfig(config: RedirectPlan['config']): string | null {
  const entries = Object.entries(config)
  if (!entries.length) return null
  const lines = entries.map(([from, rule]) => `    ${JSON.stringify(from)}: { status: ${rule.status}, destination: ${JSON.stringify(rule.destination)} },`)
  return [`  redirects: {`, ...lines, `  },`].join('\n')
}

/** Hosts whose own redirect file the emitter can write. */
export type RedirectHost = 'netlify' | 'cloudflare' | 'vercel'

/**
 * Cloudflare Pages takes 2,000 static rules, Vercel 2,048 redirects; each
 * rule is written twice (with and without its trailing slash).
 */
export const HOST_RULE_LIMIT = 2000

export interface HostRedirectFiles {
  /** Path → content, for the emitted project. */
  files: Record<string, string>
  /** Which host each written file is for, e.g. `public/_redirects (netlify)`. */
  written: string[]
  /** Config keys a host file cannot express, left to the meta-refresh fallback. */
  skipped: string[]
  /**
   * Config keys left out of a Cloudflare or Vercel file because it reached
   * that host's rule limit — served by the meta-refresh fallback only there.
   */
  over_limit: string[]
}

/** Netlify reads `:name` and `*` in a rule as placeholders. */
const HOST_PATTERN_CHAR = /(?:^|\/):|\*/

/** path-to-regexp (vercel.json `source`): escape what it would read as syntax. */
const escapePathPattern = (s: string): string => s.replace(/[:()*+?{}\\]/g, (c) => `\\${c}`)

/** A path as a host matches it: percent-encoded, with and without the trailing slash. */
function hostSources(path: string): string[] {
  const encoded = encodeURI(path)
  if (encoded === '/') return ['/']
  const bare = encoded.replace(/\/+$/, '')
  return [bare, `${bare}/`]
}

/**
 * Real HTTP redirects for the host the site deploys to. A static Astro build
 * serves `redirects` as meta-refresh pages; the status code only exists if the
 * host answers the request itself, from its own redirect file. The
 * meta-refresh pages stay as the fallback for a host without one.
 *
 * - `netlify` — `public/_redirects`, forced (`301!`): the build writes a page
 *   at every redirected path, and Netlify serves an existing file before an
 *   unforced rule.
 * - `cloudflare` — `public/_redirects`, unforced: Cloudflare Pages has no `!`
 *   and applies its rules before static assets.
 * - `vercel` — `vercel.json` `redirects`, which Vercel applies before the
 *   filesystem.
 *
 * Without a host both the Netlify file and `vercel.json` are written; a site
 * on Cloudflare Pages should name its host.
 */
export function hostRedirectFiles(config: RedirectPlan['config'], host?: RedirectHost): HostRedirectFiles {
  const entries = Object.entries(config)
  const skipped = entries.filter(([from]) => HOST_PATTERN_CHAR.test(from)).map(([from]) => from)
  const rules = entries.filter(([from]) => !skipped.includes(from))
  if (!rules.length) return { files: {}, written: [], skipped, over_limit: [] }
  // Netlify has no rule limit; Cloudflare's and Vercel's files stop at theirs.
  const limited = rules.slice(0, Math.floor(HOST_RULE_LIMIT / 2))
  const overLimit = host === 'netlify' ? [] : rules.slice(limited.length).map(([from]) => from)

  const files: Record<string, string> = {}
  const written: string[] = []
  const redirectsFile = (force: boolean, list: typeof rules) => [
    '# Emitted by @contentrain/emitter-astro — the source site\'s redirects, as real HTTP redirects.',
    ...list.flatMap(([from, rule]) => hostSources(from).map((source) => `${source} ${rule.destination} ${rule.status}${force ? '!' : ''}`)),
    '',
  ].join('\n')
  if (host === undefined || host === 'netlify') {
    files['public/_redirects'] = redirectsFile(true, rules)
    written.push('public/_redirects (netlify)')
  }
  if (host === 'cloudflare') {
    files['public/_redirects'] = redirectsFile(false, limited)
    written.push('public/_redirects (cloudflare)')
  }
  if (host === undefined || host === 'vercel') {
    const redirects = limited.flatMap(([from, rule]) => hostSources(from).map((source) => ({
      source: escapePathPattern(source),
      destination: rule.destination,
      statusCode: rule.status,
    })))
    files['vercel.json'] = `${JSON.stringify({ redirects }, null, 2)}\n`
    written.push('vercel.json (vercel)')
  }
  return { files, written, skipped, over_limit: overLimit }
}
