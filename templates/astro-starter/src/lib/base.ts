// The directory the site is served from: Astro's `base` (a WordPress installed in `/blog` moves to a site served under
// `/blog/`). Every address the site builds — routes, links, redirects, the sitemap and the feed — is a path from the
// site's root, so each one passes through here once; with no `base` (the usual case) nothing changes.

/** `/blog` for `base: '/blog/'`; empty at the root. */
export const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '')

/** Whether a root path is inside the site's directory (`/blog/`, `/blog/a/`; never `/blogger/`). */
export const underBase = (path: string): boolean => !BASE || path === BASE || path.startsWith(`${BASE}/`)

/** A path from the site's root (`/a/`) as the address it is served at (`/blog/a/`). Not a root path: unchanged. */
export function withBase(path: string): string {
  if (!BASE || !path.startsWith('/') || path.startsWith('//')) return path
  return `${BASE}${path}`
}

/** A served address (`/blog/a/`) as the path from the site's root (`/a/`); outside the directory, unchanged. */
export function withoutBase(path: string): string {
  if (!BASE || !underBase(path)) return path
  return path.slice(BASE.length) || '/'
}

/** A stored root path as served: already under the directory (an old absolute link) it stays, else it is put there. */
export const servedPath = (path: string): string => (underBase(path) ? path : withBase(path))
