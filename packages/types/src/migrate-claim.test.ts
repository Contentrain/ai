import { describe, expect, it } from 'vitest'
import type { MigrateStudioClaim } from './index'
import {
  MIGRATE_STUDIO_CLAIM_AUDIENCE,
  MIGRATE_STUDIO_CLAIM_ISSUER,
  MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS,
  MIGRATE_STUDIO_CLAIM_MAX_TTL_SECONDS,
  isMigrateStudioClaim,
  validateMigrateStudioClaim,
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
    for (const ok of ['https://blog.example.com', 'https://example.com:8443', 'http://localhost:8080', 'http://127.0.0.1']) {
      expect(validateMigrateStudioClaim(claim({ origin: ok })).ok).toBe(true)
    }
    for (const bad of ['https://example.com/', 'https://example.com/blog', 'https://Example.com', 'http://example.com',
      'ftp://example.com', 'https://example.com:443', 'example.com', '', 42]) {
      expect(validateMigrateStudioClaim(claim({ origin: bad }))).toEqual({ ok: false, errors: ['origin: invalid'] })
    }
  })

  it('rejects non-objects', () => {
    expect(validateMigrateStudioClaim(null)).toEqual({ ok: false, errors: ['payload: not an object'] })
    expect(isMigrateStudioClaim('token')).toBe(false)
  })
})
