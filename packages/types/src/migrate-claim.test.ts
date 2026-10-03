import { describe, expect, it } from 'vitest'
import type { MigrateStudioClaim } from './index'
import {
  MIGRATE_STUDIO_CLAIM_AUDIENCE,
  MIGRATE_STUDIO_CLAIM_ISSUER,
  MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS,
  MIGRATE_STUDIO_CLAIM_MAX_TTL_SECONDS,
  isMigrateStudioClaim,
  validateMigrateAccountStateRequest,
  validateMigrateAccountStateResponse,
  validateMigrateGrantStatusRequest,
  validateMigrateGrantStatusResponse,
  validateMigrateInstallUrlRequest,
  validateMigrateInstallUrlResponse,
  validateMigrateProvisionResponse,
  validateMigrateStudioClaim,
  validateMigrateStudioClaimAny,
  validateMigrateStudioClaimV2,
} from './index'

const NOW = 1_790_000_000

function claim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: MigrateStudioClaim = {
    iss: MIGRATE_STUDIO_CLAIM_ISSUER,
    aud: MIGRATE_STUDIO_CLAIM_AUDIENCE,
    sub: 'mig_user_42',
    jti: '6f1c2c1e-6c7a-4e1f-9d1a-2b3c4d5e6f70',
    iat: NOW,
    exp: NOW + 1800,
    v: 1,
    order_id: 'ord_123',
    email: 'owner@example.com',
    plan: 'pro',
    plan_evidence: [
      { limit_key: 'comments.per_month', measured: 3200, limit: 10000, capability: 'comments' },
      { limit_key: 'media.storage_gb', measured: 2.1, limit: 25 },
    ],
    trial_days: 60,
    repo: { provider: 'github', owner: 'acme', name: 'site' },
    capabilities: [{ key: 'comments', scale: '1 240 comments' }, { key: 'forms', scale: null }],
  }
  return { ...base, ...overrides }
}

describe('validateMigrateStudioClaim', () => {
  it('accepts a well-formed claim, inside its validity window', () => {
    const result = validateMigrateStudioClaim(claim(), { now: NOW + 60 })
    expect(result).toEqual({ ok: true, claim: claim() })
    expect(isMigrateStudioClaim(claim())).toBe(true)
  })

  it('accepts a Starter claim with no evidence and no capabilities (nothing found → starter)', () => {
    const minimal = claim({ plan: 'starter', plan_evidence: [], capabilities: undefined })
    delete minimal.capabilities
    expect(validateMigrateStudioClaim(minimal).ok).toBe(true)
  })

  it('rejects another issuer, audience or version', () => {
    const result = validateMigrateStudioClaim(claim({ iss: 'someone-else', aud: 'contentrain-migrate', v: 2 }))
    expect(result).toEqual({ ok: false, errors: ['iss: unexpected issuer', 'aud: unexpected audience', 'v: unsupported version'] })
  })

  it('rejects a lifetime longer than the maximum, or an exp not after iat', () => {
    expect(validateMigrateStudioClaim(claim({ exp: NOW + MIGRATE_STUDIO_CLAIM_MAX_TTL_SECONDS + 1 })))
      .toEqual({ ok: false, errors: ['exp: lifetime too long'] })
    expect(validateMigrateStudioClaim(claim({ exp: NOW })))
      .toEqual({ ok: false, errors: ['exp: not after iat'] })
  })

  it('checks the window against `now`, with 60 s of clock skew', () => {
    expect(validateMigrateStudioClaim(claim(), { now: NOW + 1800 + 59 }).ok).toBe(true)
    expect(validateMigrateStudioClaim(claim(), { now: NOW + 1800 + 60 })).toEqual({ ok: false, errors: ['exp: expired'] })
    expect(validateMigrateStudioClaim(claim(), { now: NOW - 61 })).toEqual({ ok: false, errors: ['iat: in the future'] })
  })

  it('bounds trial_days to 1..90 whole days', () => {
    for (const bad of [0, MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS + 1, 30.5, '60']) {
      expect(validateMigrateStudioClaim(claim({ trial_days: bad }))).toEqual({ ok: false, errors: ['trial_days: out of range'] })
    }
    expect(validateMigrateStudioClaim(claim({ trial_days: MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS })).ok).toBe(true)
  })

  it('rejects an unknown plan, a malformed repo and a missing order id', () => {
    const result = validateMigrateStudioClaim(claim({ plan: 'enterprise', repo: { provider: 'gitlab', owner: 'acme', name: 'site' }, order_id: '' }))
    expect(result).toEqual({ ok: false, errors: ['order_id: required', 'plan: unknown plan', 'repo: invalid'] })
    expect(validateMigrateStudioClaim(claim({ repo: { provider: 'github', owner: 'acme/x', name: 'site' } })).ok).toBe(false)
  })

  it('checks each evidence row and each capability key', () => {
    const result = validateMigrateStudioClaim(claim({
      plan_evidence: [{ limit_key: 'forms.submissions_per_month', measured: -1, limit: 100 }, { limit_key: 'x', measured: 1, limit: 2, capability: 'teleport' }],
      capabilities: [{ key: 'teleport' }],
    }))
    expect(result).toEqual({
      ok: false,
      errors: ['plan_evidence[0]: invalid', 'plan_evidence[1].capability: unknown', 'capabilities[0]: unknown capability'],
    })
  })

  it('requires plan_evidence to be present, even if empty', () => {
    const missing = claim()
    delete missing.plan_evidence
    expect(validateMigrateStudioClaim(missing)).toEqual({ ok: false, errors: ['plan_evidence: required (may be empty)'] })
  })

  it('accepts a bare origin and rejects anything else', () => {
    for (const ok of ['https://blog.example.com', 'https://example.com:8443', 'http://localhost:8080', 'http://127.0.0.1', 'https://xn--bcher-kva.de', 'http://[::1]:3000']) {
      expect(validateMigrateStudioClaim(claim({ origin: ok })).ok).toBe(true)
    }
    for (const bad of ['https://example.com/', 'https://example.com/blog', 'https://Example.com', 'http://example.com',
      'ftp://example.com', 'https://example.com:443', 'example.com', '', 42,
      // Edges: userinfo, query, fragment, a raw IDN (punycode is the one spelling), a trailing dot, http on a non-local IP.
      'https://u:p@example.com', 'https://example.com?x=1', 'https://example.com#top', 'https://bücher.de',
      'https://example.com.', 'http://10.0.0.1', 'http://[::1]:3000/']) {
      expect(validateMigrateStudioClaim(claim({ origin: bad }))).toEqual({ ok: false, errors: ['origin: invalid'] })
    }
  })

  it('accepts a comments export pointer; a malformed one is dropped with a warning, the claim stands', () => {
    const exportOf = (o: Record<string, unknown> = {}) => ({ url: 'https://migrate.example/api/exports/comments', token: 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJwIn0.c2ln', expires_at: NOW + 30 * 86400, comments: 12, ...o })
    const dropped = (comments_export: unknown, warning: string) => {
      const result = validateMigrateStudioClaim(claim({ comments_export }))
      expect(result).toEqual({ ok: true, claim: claim(), warnings: [warning] })
      expect(result.ok && 'comments_export' in result.claim).toBe(false)
    }
    expect(validateMigrateStudioClaim(claim({ comments_export: exportOf() }))).toEqual({ ok: true, claim: claim({ comments_export: exportOf() }) })
    expect(validateMigrateStudioClaim(claim({ comments_export: exportOf({ url: 'http://localhost:3000/x' }) })).ok).toBe(true)
    for (const url of ['http://migrate.example/x', 'https://u:p@migrate.example/x', 'https://migrate.example/x#f', 'https://migrate.example/x?sig=s', 'ftp://migrate.example/x', 'nope', 42])
      dropped(exportOf({ url }), 'comments_export.url: invalid')
    for (const token of [undefined, '', 'a.b', 'a.b.', 'a.b.c#', `a.b.${'c'.repeat(2048)}`, 42])
      dropped(exportOf({ token }), 'comments_export.token: invalid')
    dropped(exportOf({ expires_at: NOW }), 'comments_export.expires_at: not after iat')
    dropped(exportOf({ expires_at: 1.5 }), 'comments_export.expires_at: invalid')
    dropped(exportOf({ comments: -1 }), 'comments_export.comments: invalid')
    dropped('https://migrate.example/x', 'comments_export: invalid')
  })

  it('an older Migrate (token in the path, no token field) still opens the trial — without the export', () => {
    const old = { url: 'https://migrate.example/api/exports/comments/eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJwIn0.c2ln', expires_at: NOW + 86400, comments: 3 }
    expect(validateMigrateStudioClaim(claim({ comments_export: old }))).toEqual({ ok: true, claim: claim(), warnings: ['comments_export.token: invalid'] })
  })

  it('the guard does not narrow a claim whose export would be dropped', () => {
    const bad = claim({ comments_export: 'https://migrate.example/x' })
    expect(validateMigrateStudioClaim(bad).ok).toBe(true)
    expect(isMigrateStudioClaim(bad)).toBe(false)
  })

  it('a dropped export does not hide a real error', () => {
    const result = validateMigrateStudioClaim(claim({ email: '', comments_export: 'x' }))
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.errors).not.toContain('comments_export: invalid')
  })

  it('rejects non-objects', () => {
    expect(validateMigrateStudioClaim(null)).toEqual({ ok: false, errors: ['payload: not an object'] })
    expect(isMigrateStudioClaim('token')).toBe(false)
  })
})

describe('validateMigrateStudioClaimV2', () => {
  function v2(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const { trial_days: _t, ...rest } = claim()
    return {
      ...rest,
      v: 2,
      github_user_id: '164523886',
      email_verified: true,
      return_url: 'https://migrate.contentrain.io/orders/ord_123?studio=done',
      billing: { migrate_fee_cents: 24900, quoted_total_cents: 31700, currency: 'usd' },
      ...overrides,
    }
  }

  it('accepts a well-formed v2 claim and the Any validator routes by version', () => {
    expect(validateMigrateStudioClaimV2(v2(), { now: NOW + 60 })).toEqual({ ok: true, claim: v2() })
    expect(validateMigrateStudioClaimAny(v2())).toEqual({ ok: true, claim: v2() })
    expect(validateMigrateStudioClaimAny(claim())).toEqual({ ok: true, claim: claim() })
  })

  it('keeps v1 and v2 apart', () => {
    expect(validateMigrateStudioClaim(v2())).toEqual({ ok: false, errors: expect.arrayContaining(['v: unsupported version']) })
    expect(validateMigrateStudioClaimV2(claim())).toEqual({ ok: false, errors: expect.arrayContaining(['v: unsupported version']) })
  })

  it('takes a v2 claim without a repository (signed before payment), but never a malformed one; v1 still needs it', () => {
    const { repo: _r, ...noRepo } = v2()
    expect(validateMigrateStudioClaimV2(noRepo)).toEqual({ ok: true, claim: noRepo })
    expect(validateMigrateStudioClaimV2(v2({ repo: { provider: 'github', owner: 'acme/x', name: 'site' } }))).toEqual({ ok: false, errors: ['repo: invalid'] })
    expect(validateMigrateStudioClaimV2(v2({ repo: null }))).toEqual({ ok: false, errors: ['repo: invalid'] })
    const { repo: _r1, ...v1NoRepo } = claim()
    expect(validateMigrateStudioClaim(v1NoRepo)).toEqual({ ok: false, errors: ['repo: invalid'] })
  })

  it('refuses a trial in v2 and a missing or malformed identity', () => {
    const r = validateMigrateStudioClaimV2(v2({ trial_days: 60, github_user_id: 'octocat', email_verified: 'yes' }))
    expect(r).toEqual({ ok: false, errors: expect.arrayContaining(['trial_days: not part of v2', 'github_user_id: invalid', 'email_verified: required']) })
  })

  it('checks return_url and billing', () => {
    for (const return_url of ['ftp://migrate.contentrain.io/x', 'https://u:p@migrate.contentrain.io/', 'https://migrate.contentrain.io/#frag', 42]) {
      expect(validateMigrateStudioClaimV2(v2({ return_url }))).toEqual({ ok: false, errors: ['return_url: invalid'] })
    }
    expect(validateMigrateStudioClaimV2(v2({ return_url: 'http://localhost:3000/orders/1?studio=done' })).ok).toBe(true)
    for (const billing of [undefined, { migrate_fee_cents: -1, quoted_total_cents: 100, currency: 'usd' }, { migrate_fee_cents: 5000.5, quoted_total_cents: 9000, currency: 'usd' }, { migrate_fee_cents: 5000, quoted_total_cents: 4000, currency: 'usd' }, { migrate_fee_cents: 0, quoted_total_cents: 0, currency: 'usd' }, { migrate_fee_cents: 5000, quoted_total_cents: 9000, currency: 'eur' }]) {
      expect(validateMigrateStudioClaimV2(v2({ billing }))).toEqual({ ok: false, errors: ['billing: invalid'] })
    }
  })
})

describe('validateMigrateAccountStateResponse', () => {
  it('accepts the three states', () => {
    expect(validateMigrateAccountStateResponse({ state: 'none', plan: 'starter', year1_cents: 7200, renewal_cents: 9000 }, { requested: 'starter' }).ok).toBe(true)
    expect(validateMigrateAccountStateResponse({ state: 'covers', plan: 'pro', year1_cents: 0, renewal_cents: 0, current_plan: 'pro' }, { requested: 'pro' }).ok).toBe(true)
    expect(validateMigrateAccountStateResponse({ state: 'too_small', plan: 'pro', year1_cents: 31400, renewal_cents: 9000, current_plan: 'starter' }, { requested: 'pro' }).ok).toBe(true)
  })

  it('refuses inconsistent answers', () => {
    expect(validateMigrateAccountStateResponse({ state: 'covers', plan: 'pro', year1_cents: 100, renewal_cents: 0, current_plan: 'pro' }, { requested: 'pro' })).toEqual({ ok: false, errors: ['year1_cents: must be 0 when covers'] })
    expect(validateMigrateAccountStateResponse({ state: 'covers', plan: 'pro', year1_cents: 0, renewal_cents: 9000, current_plan: 'pro' }, { requested: 'pro' })).toEqual({ ok: false, errors: ['renewal_cents: must be 0 when covers'] })
    expect(validateMigrateAccountStateResponse({ state: 'none', plan: 'starter', year1_cents: 7200 }, { requested: 'starter' }).ok).toBe(true)
    expect(validateMigrateAccountStateResponse({ state: 'none', plan: 'starter', year1_cents: 7200, renewal_cents: -1 }, { requested: 'starter' })).toEqual({ ok: false, errors: ['renewal_cents: invalid'] })
    expect(validateMigrateAccountStateResponse({ state: 'none', plan: 'starter', year1_cents: 7200, renewal_cents: 0 }, { requested: 'starter' })).toEqual({ ok: false, errors: ['renewal_cents: must be > 0'] })
    expect(validateMigrateAccountStateResponse({ state: 'none', plan: 'starter', year1_cents: 0, renewal_cents: 9000 }, { requested: 'starter' })).toEqual({ ok: false, errors: ['year1_cents: must be > 0'] })
    expect(validateMigrateAccountStateResponse({ state: 'too_small', plan: 'pro', year1_cents: 5, renewal_cents: 9000 }, { requested: 'pro' })).toEqual({ ok: false, errors: ['current_plan: required unless none'] })
    expect(validateMigrateAccountStateResponse({ state: 'none', plan: 'starter', year1_cents: 7200, renewal_cents: 9000, current_plan: 'starter' }, { requested: 'starter' })).toEqual({ ok: false, errors: ['current_plan: not allowed when none'] })
    expect(validateMigrateAccountStateResponse({ state: 'maybe', plan: 'x', year1_cents: -1 }, { requested: 'pro' })).toEqual({ ok: false, errors: expect.arrayContaining(['state: unknown', 'plan: unknown plan', 'year1_cents: invalid']) })
  })
})

describe('account-state against the question asked', () => {
  it('fails closed when requested is missing or unknown at runtime', () => {
    const covers = { state: 'covers', plan: 'starter', year1_cents: 0, renewal_cents: 0, current_plan: 'starter' }
    for (const options of [{}, { requested: 'team' }, undefined]) {
      expect(validateMigrateAccountStateResponse(covers, options as never)).toEqual({ ok: false, errors: ['requested: unknown plan'] })
    }
  })

  it('checks none / too_small / covers against the requested plan', () => {
    const ok = (r: Record<string, unknown>, requested: 'starter' | 'pro') => validateMigrateAccountStateResponse(r, { requested }).ok
    expect(ok({ state: 'none', plan: 'pro', year1_cents: 39200, renewal_cents: 9000 }, 'pro')).toBe(true)
    expect(ok({ state: 'none', plan: 'starter', year1_cents: 7200, renewal_cents: 9000 }, 'pro')).toBe(false)
    expect(ok({ state: 'too_small', plan: 'pro', year1_cents: 31400, renewal_cents: 9000, current_plan: 'starter' }, 'pro')).toBe(true)
    expect(ok({ state: 'too_small', plan: 'pro', year1_cents: 100, renewal_cents: 9000, current_plan: 'pro' }, 'pro')).toBe(false)
    expect(ok({ state: 'covers', plan: 'pro', year1_cents: 0, renewal_cents: 0, current_plan: 'pro' }, 'starter')).toBe(true)
    expect(ok({ state: 'covers', plan: 'starter', year1_cents: 0, renewal_cents: 0, current_plan: 'starter' }, 'pro')).toBe(false)
    expect(ok({ state: 'covers', plan: 'starter', year1_cents: 0, renewal_cents: 0, current_plan: 'pro' }, 'starter')).toBe(false)
  })
})

describe('validateMigrateAccountStateRequest', () => {
  const req = (o: Record<string, unknown> = {}) => ({
    iss: MIGRATE_STUDIO_CLAIM_ISSUER, aud: MIGRATE_STUDIO_CLAIM_AUDIENCE, jti: 'j-1', iat: NOW, exp: NOW + 600, github_user_id: '164523886', plan: 'pro', ...o,
  })

  it('accepts a good request inside its window and refuses the rest', () => {
    expect(validateMigrateAccountStateRequest(req(), { now: NOW + 5 })).toEqual({ ok: true, request: req() })
    expect(validateMigrateAccountStateRequest(req({ github_user_id: 'octocat', plan: 'team', jti: '' }))).toEqual({ ok: false, errors: expect.arrayContaining(['github_user_id: invalid', 'plan: unknown plan', 'jti: required']) })
    expect(validateMigrateAccountStateRequest(req({ exp: NOW + 5000 }))).toEqual({ ok: false, errors: ['exp: lifetime too long'] })
    expect(validateMigrateAccountStateRequest(req(), { now: NOW + 5000 })).toEqual({ ok: false, errors: ['exp: expired'] })
  })
})

describe('grant status and install-url requests', () => {
  const req = (o: Record<string, unknown> = {}) => ({
    iss: MIGRATE_STUDIO_CLAIM_ISSUER, aud: MIGRATE_STUDIO_CLAIM_AUDIENCE, jti: 'j-2', iat: NOW, exp: NOW + 600, order_id: 'ord_123', ...o,
  })

  it('accept a good request inside its window and refuse the rest, the same way for both', () => {
    for (const validate of [validateMigrateGrantStatusRequest, validateMigrateInstallUrlRequest]) {
      expect(validate(req(), { now: NOW + 5 })).toEqual({ ok: true, request: req() })
      expect(validate(req({ order_id: ' ', jti: '' }))).toEqual({ ok: false, errors: expect.arrayContaining(['order_id: required', 'jti: required']) })
      expect(validate(req({ iss: 'someone', aud: 'else' }))).toEqual({ ok: false, errors: ['iss: unexpected issuer', 'aud: unexpected audience'] })
      expect(validate(req({ exp: NOW + 5000 }))).toEqual({ ok: false, errors: ['exp: lifetime too long'] })
      expect(validate(req(), { now: NOW + 5000 })).toEqual({ ok: false, errors: ['exp: expired'] })
      expect(validate('token')).toEqual({ ok: false, errors: ['payload: not an object'] })
    }
  })
})

describe('validateMigrateGrantStatusResponse', () => {
  it('takes the four states and never an install before the subscription runs', () => {
    for (const state of ['claimed', 'bound'])
      expect(validateMigrateGrantStatusResponse({ state, installed: false }).ok).toBe(true)
    expect(validateMigrateGrantStatusResponse({ state: 'redeemed', installed: false }).ok).toBe(true)
    expect(validateMigrateGrantStatusResponse({ state: 'redeemed', installed: true }).ok).toBe(true)
    expect(validateMigrateGrantStatusResponse({ state: 'bound', installed: true })).toEqual({ ok: false, errors: ['installed: only once redeemed'] })
    expect(validateMigrateGrantStatusResponse({ state: 'revoked', installed: false }).ok).toBe(true)
    expect(validateMigrateGrantStatusResponse({ state: 'revoked', installed: true }).ok).toBe(true)
    expect(validateMigrateGrantStatusResponse({ state: 'claimed', installed: true })).toEqual({ ok: false, errors: ['installed: only once redeemed'] })
    expect(validateMigrateGrantStatusResponse({ state: 'gone', installed: 'yes' })).toEqual({ ok: false, errors: ['state: unknown', 'installed: required'] })
  })
})

describe('validateMigrateInstallUrlResponse', () => {
  const url = 'https://github.com/apps/contentrain-studio/installations/new?state=eyJhbGciOiJFZERTQSJ9.e30.c2ln'
  it('hands a browser only GitHub\'s own App install page, and not a stale one', () => {
    expect(validateMigrateInstallUrlResponse({ url, expires_at: NOW + 600 }, { now: NOW }).ok).toBe(true)
    expect(validateMigrateInstallUrlResponse({ url, expires_at: NOW + 600 }).ok).toBe(true)
    for (const bad of [
      'http://github.com/apps/contentrain-studio/installations/new',
      'https://github.com.evil.test/apps/contentrain-studio/installations/new',
      'https://user:pw@github.com/apps/contentrain-studio/installations/new',
      'https://github.com/login/oauth/authorize',
      'https://github.com/apps/contentrain-studio/installations/new#x',
      'javascript:alert(1)',
      'not a url',
    ]) expect(validateMigrateInstallUrlResponse({ url: bad, expires_at: NOW + 600 }), bad).toEqual({ ok: false, errors: ['url: not a GitHub App install address'] })
    expect(validateMigrateInstallUrlResponse({ url, expires_at: NOW - 1 }, { now: NOW })).toEqual({ ok: false, errors: ['expires_at: expired'] })
    expect(validateMigrateInstallUrlResponse({ url })).toEqual({ ok: false, errors: ['expires_at: invalid'] })
  })
})

describe('validateMigrateProvisionResponse', () => {
  const ok = { grant_id: 'g_1', state: 'claimed', plan: 'pro', checkout_url: 'https://sandbox.polar.sh/checkout/polar_c_abc', amount_cents: 29_900, checkout_expires_at: NOW + 3600 }
  const check = (over: Record<string, unknown> = {}, opts: { quoted_total_cents: number, now?: number } = { quoted_total_cents: 29_900, now: NOW }) =>
    validateMigrateProvisionResponse({ ...ok, ...over }, opts)

  it('accepts an answer that matches the quote and hands a browser only a Polar checkout', () => {
    expect(check().ok).toBe(true)
    expect(check({ workspace_slug: 'acme', state: 'bound', checkout_url: 'https://polar.sh/checkout/x' }).ok).toBe(true)
    for (const bad of [
      'http://polar.sh/checkout/x',
      'https://polar.sh.evil.test/checkout/x',
      'https://user:pw@polar.sh/checkout/x',
      'https://polar.sh/login',
      'https://polar.sh/checkout/x#frag',
      'javascript:alert(1)',
      'not a url',
    ]) expect(check({ checkout_url: bad }), bad).toEqual({ ok: false, errors: ['checkout_url: not a Polar checkout address'] })
  })

  it('refuses another amount than the quote, a missing quote, and an expired checkout', () => {
    expect(check({ amount_cents: 100 })).toEqual({ ok: false, errors: ['amount_cents: not the quoted total'] })
    expect(check({ amount_cents: 0 })).toEqual({ ok: false, errors: ['amount_cents: invalid'] })
    expect(check({}, { quoted_total_cents: Number.NaN, now: NOW })).toEqual({ ok: false, errors: ['amount_cents: not the quoted total'] })
    expect(check({ checkout_expires_at: NOW - 1 })).toEqual({ ok: false, errors: ['checkout_expires_at: expired'] })
  })

  it('refuses unknown state or plan, a bad slug and a non-object', () => {
    expect(check({ state: 'gone', plan: 'max', workspace_slug: 'Bad Slug', grant_id: '' }).ok).toBe(false)
    expect(check({ state: 'gone' })).toEqual({ ok: false, errors: ['state: unknown'] })
    expect(check({ plan: 'max' })).toEqual({ ok: false, errors: ['plan: unknown plan'] })
    expect(check({ workspace_slug: 'Bad Slug' })).toEqual({ ok: false, errors: ['workspace_slug: invalid'] })
    expect(validateMigrateProvisionResponse('x', { quoted_total_cents: 1 })).toEqual({ ok: false, errors: ['payload: not an object'] })
  })
})
