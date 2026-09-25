import { describe, it, expect } from 'vitest'
import { redirectionRules, type RestRedirection } from './rest-redirects'
import { fetchRestRawIR } from './index'

const O = 'https://s.example'
const rule = (id: number, extra: Partial<RestRedirection> = {}): RestRedirection => ({
  id, url: `/old-${id}/`, regex: false, group_id: 1, enabled: true, action_type: 'url', action_code: 301,
  action_data: { url: `${O}/new-${id}/` }, match_type: 'url', ...extra,
})

describe('Redirection rules over REST', () => {
  it('accounts for every rule: served, gone, or excluded with its reason — shaped as the Bridge shapes them', () => {
    const { redirects, excluded } = redirectionRules([
      rule(1),
      rule(2, { action_data: { url: 'https://other.example/x' }, action_code: 302 }),
      rule(3, { url: '^/archive/(.*)$', regex: true, action_data: { url: '/blog/$1' }, match_data: { source: { flag_query: 'pass', flag_case: true, flag_trailing: true, flag_regex: true } } }),
      rule(4, { action_type: 'error', action_code: 410, action_data: '' }),
      rule(5, { action_type: 'error', action_code: 451, action_data: '' }),
      rule(6, { action_type: 'error', action_code: 404, action_data: '' }),
      rule(7, { enabled: false }),
      rule(8, { group_id: 2 }),
      rule(9, { match_type: 'login', action_data: { logged_in: '/in/', logged_out: '/out/' } as unknown as { url?: string } }),
      rule(10, { group_id: 3 }),
      rule(11, { action_code: 200 }),
    ], [{ id: 1, module_id: 1, enabled: true }, { id: 2, module_id: 1, enabled: false }, { id: 3, module_id: 2, enabled: true }], O)

    expect(redirects).toEqual([
      { id: 'redirection:1', from: '/old-1/', to: '/new-1/', status: 301, source: 'redirection', match: 'url', regex: false },
      { id: 'redirection:10', from: '/old-10/', to: '/new-10/', status: 301, source: 'redirection', match: 'url', regex: false, served_by: 'apache' },
      { id: 'redirection:11', from: '/old-11/', to: '/new-11/', status: 301, source: 'redirection', match: 'url', regex: false, status_note: 'source status 200 is not a redirect code; 301 assumed' },
      { id: 'redirection:2', from: '/old-2/', to: 'https://other.example/x', status: 302, source: 'redirection', match: 'url', regex: false },
      { id: 'redirection:3', from: '^/archive/(.*)$', to: '/blog/$1', status: 301, source: 'redirection', match: 'url', regex: true, query: 'pass', case_insensitive: true, trailing_slash: 'ignore' },
      // Gone: served as that answer, leading nowhere.
      { id: 'redirection:4', from: '/old-4/', to: '', status: 410, source: 'redirection', match: 'url', regex: false },
      { id: 'redirection:5', from: '/old-5/', to: '', status: 451, source: 'redirection', match: 'url', regex: false },
    ])
    expect(excluded.map((x) => [x.id, x.reason])).toEqual([
      ['redirection:6', 'not-a-redirect:error'],
      ['redirection:7', 'disabled'],
      ['redirection:8', 'disabled'],
      ['redirection:9', 'conditional-match:login'],
    ])
    expect(excluded.find((x) => x.id === 'redirection:9')!.condition).toEqual({ logged_in: '/in/', logged_out: '/out/' })
    expect(excluded.every((x) => !('to' in x))).toBe(true)
  })

  it('reads the older `status` field and a string target', () => {
    const { redirects, excluded } = redirectionRules([
      rule(1, { enabled: undefined, status: 'enabled', action_data: `${O}/a/?x=1#top` }),
      rule(2, { enabled: undefined, status: 'disabled' }),
    ], [], O)
    expect(redirects.map((r) => r.to)).toEqual(['/a/?x=1#top'])
    expect(excluded.map((x) => x.reason)).toEqual(['disabled'])
  })
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A site running Redirection (three rules, two per page), with an attachment page. */
function site(opts: { redirection?: boolean; denied?: boolean } = {}): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = []
  const rules = [rule(1), rule(2), rule(3, { action_type: 'error', action_code: 410, action_data: '' })]
  const fetchImpl = (async (url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const u = String(url)
    const auth = !!(init?.headers as Record<string, string>)?.authorization
    calls.push(u + (auth ? ' [auth]' : ''))
    if (u === `${O}/wp-json/`) return json({ name: 'S', namespaces: ['wp/v2', ...(opts.redirection === false ? [] : ['redirection/v1'])] })
    if (u.includes('/redirection/v1/')) {
      if (!auth || opts.denied) return json({ code: 'rest_forbidden' }, 403)
      const page = Number(new URL(u).searchParams.get('page'))
      if (u.includes('/group?')) return json({ items: [{ id: 1, module_id: 1, enabled: true }], total: 1 })
      return json({ items: rules.slice(page * 2, page * 2 + 2), total: rules.length })
    }
    if (u.includes('/users/me')) return json({ id: 1 })
    if (u.includes('/types')) return json({ post: { slug: 'post', rest_base: 'posts' } })
    if (u.includes('/media?')) return json([{ id: 40, slug: 'photo', source_url: `${O}/wp-content/uploads/photo.jpg`, link: `${O}/hello/photo/`, post: 7 }])
    if (/\/(posts|categories|tags|users|comments|menus|menu-items|navigation|template-parts|templates)\?/.test(u)) return json([])
    return new Response('nope', { status: 404 })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('fetchRestRawIR redirects', () => {
  it('reads Redirection with a credential, page by page, and says what REST cannot read', async () => {
    const { fetchImpl, calls } = site()
    const { raw, gaps } = await fetchRestRawIR({ origin: O, fetchImpl, auth: { user: 'u', appPassword: 'p' } })
    expect(raw.redirects!.map((r) => [r.id, r.to, r.status])).toEqual([['redirection:1', '/new-1/', 301], ['redirection:2', '/new-2/', 301], ['redirection:3', '', 410]])
    expect(raw.redirects_excluded).toBeUndefined()
    expect(calls.filter((c) => c.includes('/redirection/v1/redirect')).map((c) => new URL(c.split(' ')[0]!).searchParams.get('page'))).toEqual(['0', '1'])
    expect(gaps).toEqual(['redirects_partial'])
    // The attachment page, for its redirect.
    expect(raw.attachments[0]).toMatchObject({ id: 40, url: `${O}/wp-content/uploads/photo.jpg`, link: `${O}/hello/photo/`, parent: 7 })
  })

  it('names the gap without a credential, or when the credential may not manage Redirection', async () => {
    const anonymous = await fetchRestRawIR({ origin: O, fetchImpl: site().fetchImpl })
    expect(anonymous.raw.redirects).toBeUndefined()
    expect(anonymous.gaps).toEqual(['menus_require_auth', 'redirects_partial', 'redirects_require_auth'])
    const denied = await fetchRestRawIR({ origin: O, fetchImpl: site({ denied: true }).fetchImpl, auth: { user: 'u', appPassword: 'p' } })
    expect(denied.raw.redirects).toBeUndefined()
    expect(denied.gaps).toEqual(['redirects_partial', 'redirects_require_auth'])
    expect(denied.warnings).toContain('redirects: HTTP 403 with the credential — the user may not manage Redirection; its rules not read')
  })

  it('does not ask a site without Redirection', async () => {
    const { fetchImpl, calls } = site({ redirection: false })
    const { raw, gaps } = await fetchRestRawIR({ origin: O, fetchImpl, auth: { user: 'u', appPassword: 'p' } })
    expect(raw.redirects).toBeUndefined()
    expect(gaps).toEqual(['redirects_partial'])
    expect(calls.some((c) => c.includes('/redirection/'))).toBe(false)
  })
})
