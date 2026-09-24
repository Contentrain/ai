// Addresses. Every URL the site builds comes from a pattern in
// site.config.ts, so the whole address scheme — a migrated site's permalinks —
// is data in one place rather than a directory layout under src/pages.

import { siteConfig } from '../site.config'

export type PathParams = Partial<Record<'slug' | 'path' | 'year' | 'month' | 'day' | 'id', string>>

/** Fill a permalink pattern. A token without a value is a configuration error, not an empty segment. */
export function fillPattern(pattern: string, params: PathParams): string {
  return pattern.replace(/:(slug|path|year|month|day|id)\b/g, (_match, token: keyof PathParams) => {
    const value = params[token]
    if (value === undefined || value === '') {
      throw new Error(`Permalink "${pattern}" needs :${token}, which this entry does not have.`)
    }
    return value.split('/').map(encodeURIComponent).join('/')
  })
}

/** The dated parts of a post address, in the site's own calendar (UTC, as WordPress stores GMT dates). */
export function dateParams(date: Date | undefined): PathParams {
  if (!date) return {}
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0'),
  }
}

/** Page `n` of a paginated list: the list itself for page 1, `<base>page/<n>/` after — as WordPress does. */
export function pagePath(base: string, page: number): string {
  return page <= 1 ? base : `${base}page/${page}/`
}

/** `/a/b/` → `a/b` for an Astro rest parameter; the root is `undefined`. */
export function toParam(path: string): string | undefined {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? undefined : decodeURIComponent(trimmed)
}

export const permalinks = siteConfig.permalinks
