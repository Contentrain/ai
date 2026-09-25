// Redirect rules over REST → RawRedirect[] / RawRedirectExcluded[].
//
// REST reaches one source: the Redirection plugin (`redirection/v1`), with an application password of a user who
// may manage it. Yoast Premium, Rank Math, Safe Redirect Manager and `.htaccess` keep their rules where REST cannot
// read them — only the Bridge export does. The rules are shaped exactly as the Bridge shapes Redirection's
// (`class-contentrain-bridge-redirects.php`): every rule lands in `redirects` (the site serves it) or `excluded`
// (with the reason), so the two together account for the plugin's whole table.

import type { RawRedirect, RawRedirectExcluded, RawRedirectQuery } from '@contentrain/types'

/** A rule as `redirection/v1/redirect` lists it. */
export interface RestRedirection {
  id: number
  url?: string
  regex?: boolean
  group_id?: number
  enabled?: boolean
  /** Older releases state `status: 'enabled' | 'disabled'` instead of `enabled`. */
  status?: string
  action_type?: string
  action_code?: number | string
  action_data?: { url?: string } | string | null
  match_type?: string
  match_data?: { source?: { flag_query?: unknown; flag_case?: unknown; flag_trailing?: unknown; flag_regex?: unknown } } | null
}

/**
 * Redirection's site-wide defaults (`redirection/v1/setting`, which answers them merged over the plugin's own): a
 * rule without its own flags takes these.
 */
export interface RestRedirectionOptions { flag_query?: unknown; flag_case?: unknown; flag_trailing?: unknown }

/** Redirection's own defaults, under a site that states none. */
const DEFAULTS = { flag_query: 'exact', flag_case: false, flag_trailing: false } as const

/** A group as `redirection/v1/group` lists it. `module_id`: 1 WordPress, 2 Apache, 3 nginx. */
export interface RestRedirectionGroup { id: number; module_id?: number; enabled?: boolean; status?: string }

const MODULES: Record<number, string> = { 2: 'apache', 3: 'nginx' }
/** Codes that say an address is gone: served as that answer, with no target. */
const GONE = new Set([410, 451])
/** Redirection's query modes; `exactorder` (the same parameters in the same order) is read as `exact`. */
const QUERY: Record<string, RawRedirectQuery> = { exact: 'exact', exactorder: 'exact', ignore: 'ignore', pass: 'pass' }

type Flags = { flag_query?: unknown; flag_case?: unknown; flag_trailing?: unknown }
/** The flags one layer states, as Redirection accepts them: a known query mode, a true boolean (not `"1"`). */
const valid = (f: Flags | undefined): Flags => ({
  ...(typeof f?.flag_query === 'string' && f.flag_query in QUERY ? { flag_query: f.flag_query } : {}),
  ...(typeof f?.flag_case === 'boolean' ? { flag_case: f.flag_case } : {}),
  ...(typeof f?.flag_trailing === 'boolean' ? { flag_trailing: f.flag_trailing } : {}),
})

/** By id as bytes, as the Bridge sorts (`strcmp`). */
const order = (a: { id?: string }, b: { id?: string }): number => ((a.id ?? '') < (b.id ?? '') ? -1 : (a.id ?? '') > (b.id ?? '') ? 1 : 0)

const on = (x: { enabled?: boolean; status?: string }): boolean => (x.enabled ?? (x.status === undefined || x.status === 'enabled'))

/** Same-site targets become root-relative, like every `from`; other hosts stay absolute (as the Bridge does). */
function relative(url: string, origin: string): string {
  try {
    const home = new URL(origin)
    const u = new URL(url, `${origin}/`)
    if (u.host.toLowerCase() !== home.host.toLowerCase()) return url
    return `${u.pathname}${u.search}${u.hash}`
  } catch { return url }
}

/**
 * Redirection's rules and groups → the rules the site serves and the ones it does not, sorted by id.
 * A rule's query, case and trailing-slash modes are what Redirection applies to it: its own flags, else the site's
 * (`options`), else the plugin's defaults. Without `options` (not readable) only a rule's own flags are stated.
 */
export function redirectionRules(items: RestRedirection[], groups: RestRedirectionGroup[], origin: string, options?: RestRedirectionOptions): { redirects: RawRedirect[]; excluded: RawRedirectExcluded[] } {
  const site: Flags = options ? { ...DEFAULTS, ...valid(options) } : {}
  const byId = new Map(groups.map((g) => [g.id, g]))
  const redirects: RawRedirect[] = []
  const excluded: RawRedirectExcluded[] = []
  for (const item of items) {
    const group = item.group_id === undefined ? undefined : byId.get(item.group_id)
    const code = Number(item.action_code ?? 301)
    const data = item.action_data
    const target = typeof data === 'string' ? data : (data?.url ?? '')
    const own = item.match_data?.source ?? {}
    const flags = { ...site, ...valid(own) }
    // Without `to`: an excluded rule carries none, as the Bridge's; a served one gets its own below.
    const rule: Omit<RawRedirect, 'to'> & { id: string; source: string } = { id: `redirection:${item.id}`, from: item.url ?? '', source: 'redirection', match: 'url', regex: item.regex === true || own.flag_regex === true }
    const served = group?.module_id !== undefined ? MODULES[group.module_id] : undefined
    if (served) rule.served_by = served
    // A regular expression matches the query as written: Redirection compares it exactly.
    if (rule.regex) rule.query = 'exact'
    else if (typeof flags.flag_query === 'string') rule.query = QUERY[flags.flag_query]
    if (typeof flags.flag_case === 'boolean') rule.case_insensitive = flags.flag_case
    if (typeof flags.flag_trailing === 'boolean') rule.trailing_slash = flags.flag_trailing ? 'ignore' : 'exact'
    const matchType = item.match_type ?? 'url'
    const actionType = item.action_type ?? 'url'
    if (!on(item) || (group && !on(group))) {
      excluded.push({ ...rule, reason: 'disabled' })
    } else if (actionType === 'error' && GONE.has(code) && matchType === 'url') {
      // "Gone" (410) and "unavailable for legal reasons" (451): the address answers that, and leads nowhere.
      redirects.push({ ...rule, to: '', status: code })
    } else if (actionType !== 'url') {
      // A 404 error, pass-through, "do nothing", random post: not a from→to rule.
      excluded.push({ ...rule, status: code, reason: `not-a-redirect:${actionType}` })
    } else if (matchType !== 'url') {
      // Login, referrer, agent, cookie, header, IP, server…: the target depends on the request.
      // Its own match type (`login`), as the Bridge states it.
      excluded.push({ ...rule, match: matchType, status: code, condition: data ?? null, reason: `conditional-match:${matchType}` })
    } else {
      const move = code >= 300 && code < 400
      redirects.push({ ...rule, to: relative(target, origin), status: move ? code : 301, ...(move ? {} : { status_note: `source status ${code} is not a redirect code; 301 assumed` }) })
    }
  }
  return { redirects: redirects.toSorted(order), excluded: excluded.toSorted(order) }
}
