// Addresses. Every URL the site builds comes from a pattern in
// site.config.ts, so the whole address scheme — a migrated site's permalinks —
// is data in one place rather than a directory layout under src/pages.

import { siteConfig } from '../site.config'
import { withoutBase } from './base'
import { dayParts } from './dates'

/**
 * `:category` is a post's category with its parents (`news/local`), as WordPress fills `%category%`; see
 * `categoryPath` in content.ts for which category that is.
 */
export type PathParams = Partial<Record<'slug' | 'path' | 'year' | 'month' | 'day' | 'id' | 'category', string>>

/** Fill a permalink pattern. A token without a value is a configuration error, not an empty segment. */
export function fillPattern(pattern: string, params: PathParams): string {
  return pattern.replace(/:(slug|path|year|month|day|id|category)\b/g, (_match, token: keyof PathParams) => {
    const value = params[token]
    if (value === undefined || value === '') {
      throw new Error(`Permalink "${pattern}" needs :${token}, which this entry does not have.`)
    }
    return value.split('/').map(encodeURIComponent).join('/')
  })
}

/**
 * The dated parts of a post address, on the site's own calendar: WordPress fills them from the post's local date, so
 * the day is read in the site's time zone (`siteConfig.timeZone`, see lib/dates.ts), UTC when it has none.
 */
export function dateParams(date: Date | undefined): PathParams {
  return date ? dayParts(date) : {}
}

/** Page `n` of a paginated list: the list itself for page 1, `<base>page/<n>/` after — as WordPress does. */
export function pagePath(base: string, page: number): string {
  return page <= 1 ? base : `${base}page/${page}/`
}

/** `/a/b/` → `a/b` for an Astro rest parameter (under a `base`, from inside its directory); the root is `undefined`. */
export function toParam(path: string): string | undefined {
  const trimmed = withoutBase(path).replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? undefined : decodeURIComponent(trimmed)
}

export const permalinks = siteConfig.permalinks

/**
 * The addresses to build when `CONTENTRAIN_ROUTES` lists some (`/,/about/`, comma separated): a preview of part of
 * the site builds those pages alone. Unset or empty, `undefined`: every address. Compared as `toParam` sees them, so
 * `/about`, `about/` and `/about/` are one address.
 */
export function onlyRoutes(value = process.env.CONTENTRAIN_ROUTES): Set<string> | undefined {
  const listed = (value ?? '').split(',').map(part => part.trim()).filter(Boolean)
  return listed.length ? new Set(listed.map(path => toParam(path) ?? '')) : undefined
}
