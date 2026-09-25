import { readFileSync } from 'node:fs'
import type { RawRedirect, RawRedirectExcluded } from '@contentrain/types'
import { describe, expect, it } from 'vitest'
import { redirectionRules, type RestRedirection, type RestRedirectionGroup, type RestRedirectionOptions } from './rest-redirects'

// The redirect parity fixture: Redirection's rows, and the rules the Contentrain Bridge and wp-import both export.

interface Row { id: number; url: string; regex: boolean; group_id: number; status: string; action_type: string; action_code: number; action_data: string | Record<string, unknown>; match_type: string; match_data: RestRedirection['match_data'] }
interface Case {
  name: string
  only?: 'rest'
  options: Record<string, unknown> | null | 'unreadable'
  expect: { redirects: RawRedirect[]; excluded: RawRedirectExcluded[]; rules: number }
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/redirect-parity.json', import.meta.url), 'utf8')) as {
  origin: string
  groups: Array<{ id: number; status: string; module_id: number }>
  items: Row[]
  cases: Case[]
}

/** What `redirection/v1/setting` answers for a site that never saved its options: the fresh-install values. */
const FRESH_INSTALL: RestRedirectionOptions = { flag_query: 'exact', flag_case: true, flag_trailing: true }

/** A row as Redirection's REST lists it: `enabled` for the status, a url action's target as `{ url }`. */
const restItem = (row: Row): RestRedirection => ({
  id: row.id, url: row.url, regex: row.regex, group_id: row.group_id, enabled: row.status === 'enabled',
  action_type: row.action_type, action_code: row.action_code,
  action_data: typeof row.action_data === 'string' ? (row.action_type === 'url' ? { url: row.action_data } : row.action_data) : row.action_data as RestRedirection['action_data'],
  match_type: row.match_type, match_data: row.match_data,
})
const restGroup = (g: { id: number; status: string; module_id: number }): RestRedirectionGroup => ({ id: g.id, module_id: g.module_id, enabled: g.status === 'enabled' })

describe('redirect parity fixture', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const options = c.options === 'unreadable' ? undefined : c.options === null ? FRESH_INSTALL : c.options as RestRedirectionOptions
    const { redirects, excluded } = redirectionRules(fixture.items.map(restItem), fixture.groups.map(restGroup), fixture.origin, options)
    expect(redirects).toEqual(c.expect.redirects)
    expect(excluded).toEqual(c.expect.excluded)
    // Every rule the source holds is accounted for, once.
    expect(redirects.length + excluded.length).toBe(c.expect.rules)
  })
})
