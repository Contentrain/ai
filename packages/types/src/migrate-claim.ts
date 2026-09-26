// ─── Migrate → Studio claim contract ───
//
// A paid Migrate order includes a Studio trial. When the migrated site is
// delivered, Migrate hands the customer to Studio with a signed claim token;
// Studio verifies it, grants the trial once per order, and opens the delivered
// repository as a project.
//
// The token is a compact JWS, `alg: "EdDSA"` (Ed25519). Migrate signs with its
// private key; Studio verifies with the public key. There is no shared secret.
// A `kid` header is optional and used for key rotation. This module is the
// payload both sides agree on. It deliberately does no cryptography — the
// signature is checked by the consumer, before `validateMigrateStudioClaim`.
//
// Pure and dependency-free; every input is passed in, `now` included.

import type { CapabilityKey } from './migration.js'
import { CAPABILITY_KEYS } from './migration.js'

/** Contract version carried in the payload as `v`. */
export const MIGRATE_STUDIO_CLAIM_VERSION = 1
/** JWS `alg` header value. */
export const MIGRATE_STUDIO_CLAIM_ALG = 'EdDSA'
/** `iss` — who signs. */
export const MIGRATE_STUDIO_CLAIM_ISSUER = 'contentrain-migrate'
/** `aud` — who may accept it. */
export const MIGRATE_STUDIO_CLAIM_AUDIENCE = 'contentrain-studio'
/** Upper bound on `exp - iat`: a claim link is short-lived (30 minutes). */
export const MIGRATE_STUDIO_CLAIM_MAX_TTL_SECONDS = 1800
/** Upper bound on the trial a claim can grant. v1 grants 60. */
export const MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS = 90
/** Clock skew tolerated when checking `iat` / `exp`. */
export const MIGRATE_STUDIO_CLAIM_CLOCK_SKEW_SECONDS = 60

export const MIGRATE_STUDIO_PLANS = ['starter', 'pro'] as const
export type MigrateStudioPlan = (typeof MIGRATE_STUDIO_PLANS)[number]

/**
 * One measurement the plan recommendation rests on, so Studio can say why:
 * "3 200 comments a month exceed Starter's 500." `limit_key` is the Studio
 * plan-feature key the measurement was sized against; `limit` is the value of
 * that key for the recommended plan when the claim was signed. Sizing leaves
 * headroom (limit ≥ 1.2 × measured), so `measured <= limit` is expected.
 */
export interface MigrateStudioPlanEvidence {
  /** Studio plan-feature limit key, e.g. `comments.per_month`, `media.storage_gb`. */
  limit_key: string
  /** What discovery measured, in the limit's unit (a count per month, GB, MB). */
  measured: number
  /** The recommended plan's value for `limit_key` at signing time. */
  limit: number
  /** The discovered capability behind the measurement, when there is one. */
  capability?: CapabilityKey
}

export interface MigrateStudioRepo {
  provider: 'github'
  owner: string
  name: string
}

export interface MigrateStudioCapability {
  key: CapabilityKey
  /** Human-readable scale from discovery, e.g. "1 240 comments", "2.1 GB". */
  scale?: string | null
}

/** The claim token's payload. */
export interface MigrateStudioClaim {
  // Registered JWT claims
  iss: typeof MIGRATE_STUDIO_CLAIM_ISSUER
  aud: typeof MIGRATE_STUDIO_CLAIM_AUDIENCE
  /** Migrate account (user) id. */
  sub: string
  /** Single-use token id (uuid). Studio refuses a `jti` it has seen. */
  jti: string
  /** Issued at, seconds since the epoch. */
  iat: number
  /** Expires at, seconds since the epoch. `exp - iat` ≤ `MIGRATE_STUDIO_CLAIM_MAX_TTL_SECONDS`. */
  exp: number

  /** Contract version. */
  v: typeof MIGRATE_STUDIO_CLAIM_VERSION
  /** Migrate order id. Studio stores it UNIQUE: one grant per order. */
  order_id: string
  /**
   * Verified at Migrate. Studio shows it and may prefill with it, but does not
   * require a match: the customer's GitHub login email may differ.
   */
  email: string
  /** The plan sized from discovery. */
  plan: MigrateStudioPlan
  /** Why this plan — empty when discovery found nothing to size against (then `starter`). */
  plan_evidence: MigrateStudioPlanEvidence[]
  /** Trial length the grant opens, 1..`MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS`. Never taken from the client. */
  trial_days: number
  /** The delivered repository. */
  repo: MigrateStudioRepo
  /** Discovery summary shown on Studio's claim screen. Optional. */
  capabilities?: MigrateStudioCapability[]
  /**
   * The WordPress site the order migrated, as a bare origin (`https://host`,
   * lowercase, no path). Signed so Studio can trust it: media import fetches
   * only from this origin, never from an origin named in the repository.
   * Optional; `https:` only, plus `http:` for localhost.
   */
  origin?: string
}

export type MigrateStudioClaimResult =
  | { ok: true, claim: MigrateStudioClaim }
  | { ok: false, errors: string[] }

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITY_KEYS)
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isText = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
const isSeconds = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0
const isFiniteNonNegative = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

/** A bare, canonical origin: `new URL(x).origin` gives it back unchanged. */
function isClaimOrigin(x: unknown): x is string {
  if (typeof x !== 'string') return false
  let url: URL
  try { url = new URL(x) }
  catch { return false }
  if (url.origin !== x) return false
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
}

/**
 * Check a decoded, signature-verified payload against the contract. Pass
 * `now` (seconds since the epoch) to also check the validity window; without
 * it only the shape and the window's own bounds are checked. Returns every
 * problem found, as stable machine-readable strings (`field: problem`).
 */
export function validateMigrateStudioClaim(input: unknown, options: { now?: number } = {}): MigrateStudioClaimResult {
  const errors: string[] = []
  if (!isObject(input)) return { ok: false, errors: ['payload: not an object'] }
  const x = input

  if (x.iss !== MIGRATE_STUDIO_CLAIM_ISSUER) errors.push('iss: unexpected issuer')
  if (x.aud !== MIGRATE_STUDIO_CLAIM_AUDIENCE) errors.push('aud: unexpected audience')
  if (x.v !== MIGRATE_STUDIO_CLAIM_VERSION) errors.push('v: unsupported version')
  for (const key of ['sub', 'jti', 'order_id'] as const) {
    if (!isText(x[key])) errors.push(`${key}: required`)
  }
  if (!isText(x.email) || !x.email.includes('@')) errors.push('email: invalid')

  if (!isSeconds(x.iat)) errors.push('iat: invalid')
  if (!isSeconds(x.exp)) errors.push('exp: invalid')
  if (isSeconds(x.iat) && isSeconds(x.exp)) {
    const ttl = x.exp - x.iat
    if (ttl <= 0) errors.push('exp: not after iat')
    else if (ttl > MIGRATE_STUDIO_CLAIM_MAX_TTL_SECONDS) errors.push('exp: lifetime too long')
    if (options.now !== undefined) {
      if (options.now >= x.exp + MIGRATE_STUDIO_CLAIM_CLOCK_SKEW_SECONDS) errors.push('exp: expired')
      if (x.iat > options.now + MIGRATE_STUDIO_CLAIM_CLOCK_SKEW_SECONDS) errors.push('iat: in the future')
    }
  }

  if (!(MIGRATE_STUDIO_PLANS as readonly unknown[]).includes(x.plan)) errors.push('plan: unknown plan')
  if (!Array.isArray(x.plan_evidence)) {
    errors.push('plan_evidence: required (may be empty)')
  }
  else {
    x.plan_evidence.forEach((e, i) => {
      if (!isObject(e) || !isText(e.limit_key) || !isFiniteNonNegative(e.measured) || !isFiniteNonNegative(e.limit)) {
        errors.push(`plan_evidence[${i}]: invalid`)
      }
      else if (e.capability !== undefined && !CAPABILITY_SET.has(e.capability as string)) {
        errors.push(`plan_evidence[${i}].capability: unknown`)
      }
    })
  }

  if (typeof x.trial_days !== 'number' || !Number.isInteger(x.trial_days)
    || x.trial_days < 1 || x.trial_days > MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS) {
    errors.push('trial_days: out of range')
  }

  const repo = x.repo
  if (!isObject(repo) || repo.provider !== 'github' || !isText(repo.owner) || !isText(repo.name)
    || repo.owner.includes('/') || repo.name.includes('/')) {
    errors.push('repo: invalid')
  }

  if (x.capabilities !== undefined) {
    if (!Array.isArray(x.capabilities)) {
      errors.push('capabilities: not an array')
    }
    else {
      x.capabilities.forEach((c, i) => {
        if (!isObject(c) || !CAPABILITY_SET.has(c.key as string)) errors.push(`capabilities[${i}]: unknown capability`)
        else if (c.scale !== undefined && c.scale !== null && typeof c.scale !== 'string') errors.push(`capabilities[${i}].scale: invalid`)
      })
    }
  }

  if (x.origin !== undefined && !isClaimOrigin(x.origin)) errors.push('origin: invalid')

  return errors.length === 0 ? { ok: true, claim: x as unknown as MigrateStudioClaim } : { ok: false, errors }
}

/** Shape-only type guard (no clock check). The signature is the consumer's job. */
export function isMigrateStudioClaim(input: unknown): input is MigrateStudioClaim {
  return validateMigrateStudioClaim(input).ok
}
