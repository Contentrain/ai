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
/**
 * v2: "Migrate with Studio". No trial: the Studio year is part of the order's
 * first invoice (Studio creates that checkout itself, server to server), and
 * the claim names the customer's GitHub account so Studio can find or create
 * the user without a sign-in. v1 stays valid for the claim-link flow.
 */
export const MIGRATE_STUDIO_CLAIM_VERSION_2 = 2
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
   *
   * Must equal `new URL(origin).origin` exactly, so no userinfo, path, query
   * or fragment, and IDN hosts in punycode. A trailing-dot host is refused, so
   * one site has one spelling.
   */
  origin?: string
  /**
   * Where Studio fetches the order's comment export when the migrated site had
   * comments (`contentrain-comments@1`, the file the run delivered with
   * commenters' email, IP and avatar already removed). The export never enters
   * the repository, so this is its only way into Studio.
   *
   * A GET on Migrate's fixed export address with `token` as
   * `Authorization: Bearer`. The address carries no secret, so nothing that
   * logs request lines (proxies, the platform's edge) sees one. The token is
   * signed per job and valid until `expires_at` (the end of the grant window,
   * not the claim's 30 minutes); a missing, invalid or expired token reads as
   * 404. Studio fetches it server-side only and trusts the host only when it is
   * on its own Migrate allowlist — never because the claim names it. Absent
   * when the source had no comments.
   */
  comments_export?: MigrateStudioCommentsExport
}

export interface MigrateStudioCommentsExport {
  /** `https:` URL (`http:` only for localhost), no userinfo, query or fragment. Carries no secret. */
  url: string
  /** The export's bearer token: a compact JWS, at most 2048 characters. Sent only as `Authorization: Bearer`. */
  token: string
  /** When the URL stops serving, seconds since the epoch. After `iat`. */
  expires_at: number
  /** Comments in the export, for the claim screen. */
  comments: number
}

/**
 * What the customer was quoted, signed so Studio can refuse a checkout whose
 * price would differ. Studio adds its own Studio-year line to `migrate_fee_cents`
 * and compares the sum with `quoted_total_cents`.
 */
export interface MigrateStudioClaimBilling {
  /** The Migrate dynamic fee, in cents, before the Studio year. ≥ 0. */
  migrate_fee_cents: number
  /** The first invoice the customer saw (Migrate fee + Studio year 1), in cents. > 0. */
  quoted_total_cents: number
  currency: 'usd'
}

/**
 * The v2 payload ("Migrate with Studio"): a v1 claim without `trial_days`, plus
 * the identity and billing a server-to-server provision needs.
 */
export interface MigrateStudioClaimV2 extends Omit<MigrateStudioClaim, 'v' | 'trial_days'> {
  v: typeof MIGRATE_STUDIO_CLAIM_VERSION_2
  /** The customer's GitHub user id (decimal string) from the Migrate sign-in. Studio finds or creates the user by it. */
  github_user_id: string
  /** Whether Migrate verified `email`. Studio binds by email only when `true`; never by an unverified one. */
  email_verified: boolean
  /** Where Studio sends the customer after paying (Migrate's payment page; it trusts the payment webhook, never this redirect): `https:` (`http:` for localhost), no credentials or fragment. Studio accepts it only for hosts on its own Migrate allowlist. */
  return_url: string
  billing: MigrateStudioClaimBilling
}

export type MigrateStudioClaimV2Result =
  | { ok: true, claim: MigrateStudioClaimV2, warnings?: string[] }
  | { ok: false, errors: string[] }

export type MigrateStudioClaimResult =
  /**
   * `warnings`: optional parts that were dropped rather than failing the claim
   * (today only `comments_export.*`), as `field: problem` strings; absent when
   * nothing was dropped. `claim` no longer carries a dropped part.
   */
  | { ok: true, claim: MigrateStudioClaim, warnings?: string[] }
  | { ok: false, errors: string[] }

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITY_KEYS)
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isText = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
const isSeconds = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0
const isFiniteNonNegative = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0
const isCents = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 100_000_000
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

/** A bare, canonical origin: `new URL(x).origin` gives it back unchanged. */
function isClaimOrigin(x: unknown): x is string {
  if (typeof x !== 'string') return false
  let url: URL
  try { url = new URL(x) }
  catch { return false }
  if (url.origin !== x || url.hostname.endsWith('.')) return false
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
}

/** A compact JWS: three base64url segments, the signature non-empty. */
function isCompactJws(x: unknown): x is string {
  return typeof x === 'string' && x.length <= 2048 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(x)
}

/** A post-payment return address: https (http for localhost), no credentials or fragment; a query is fine. */
function isReturnUrl(x: unknown): x is string {
  if (typeof x !== 'string' || x.length > 2048) return false
  let url: URL
  try { url = new URL(x) }
  catch { return false }
  if (url.username || url.password || url.hash || url.hostname.endsWith('.')) return false
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
}

/** A fetchable export address: https (http for localhost), no credentials, query or fragment — nowhere for a secret. */
function isExportUrl(x: unknown): x is string {
  if (typeof x !== 'string' || x.length > 2048) return false
  let url: URL
  try { url = new URL(x) }
  catch { return false }
  if (url.username || url.password || url.search || url.hash || url.hostname.endsWith('.')) return false
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
}

/**
 * Check a decoded, signature-verified payload against the contract. Pass
 * `now` (seconds since the epoch) to also check the validity window; without
 * it only the shape and the window's own bounds are checked. Returns every
 * problem found, as stable machine-readable strings (`field: problem`).
 *
 * A malformed `comments_export` does not fail the claim: it is an add-on, and
 * a Migrate still sending an older shape must not stop the trial. It is
 * dropped from `claim` and reported in `warnings`; Studio then offers the
 * file upload instead.
 */
export function validateMigrateStudioClaim(input: unknown, options: { now?: number } = {}): MigrateStudioClaimResult {
  return validateClaim(input, options, MIGRATE_STUDIO_CLAIM_VERSION) as MigrateStudioClaimResult
}

/**
 * The v2 counterpart of `validateMigrateStudioClaim`: same envelope, plan, repo
 * and add-on checks, no `trial_days` (a v2 claim that carries one is refused),
 * plus `github_user_id`, `email_verified`, `return_url` and `billing`.
 */
export function validateMigrateStudioClaimV2(input: unknown, options: { now?: number } = {}): MigrateStudioClaimV2Result {
  return validateClaim(input, options, MIGRATE_STUDIO_CLAIM_VERSION_2) as MigrateStudioClaimV2Result
}

/** Validate a claim of either version; read `result.claim.v` to tell them apart. */
export function validateMigrateStudioClaimAny(input: unknown, options: { now?: number } = {}):
  | { ok: true, claim: MigrateStudioClaim | MigrateStudioClaimV2, warnings?: string[] }
  | { ok: false, errors: string[] } {
  const v = isObject(input) ? input.v : undefined
  return v === MIGRATE_STUDIO_CLAIM_VERSION_2
    ? validateMigrateStudioClaimV2(input, options)
    : validateMigrateStudioClaim(input, options)
}

function validateClaim(
  input: unknown,
  options: { now?: number },
  version: typeof MIGRATE_STUDIO_CLAIM_VERSION | typeof MIGRATE_STUDIO_CLAIM_VERSION_2,
): MigrateStudioClaimResult | MigrateStudioClaimV2Result {
  const errors: string[] = []
  if (!isObject(input)) return { ok: false, errors: ['payload: not an object'] }
  const x = input

  if (x.iss !== MIGRATE_STUDIO_CLAIM_ISSUER) errors.push('iss: unexpected issuer')
  if (x.aud !== MIGRATE_STUDIO_CLAIM_AUDIENCE) errors.push('aud: unexpected audience')
  if (x.v !== version) errors.push('v: unsupported version')
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

  if (version === MIGRATE_STUDIO_CLAIM_VERSION) {
    if (typeof x.trial_days !== 'number' || !Number.isInteger(x.trial_days)
      || x.trial_days < 1 || x.trial_days > MIGRATE_STUDIO_CLAIM_MAX_TRIAL_DAYS) {
      errors.push('trial_days: out of range')
    }
  }
  else {
    if (x.trial_days !== undefined) errors.push('trial_days: not part of v2')
    if (typeof x.github_user_id !== 'string' || !/^[1-9]\d{0,18}$/.test(x.github_user_id)) errors.push('github_user_id: invalid')
    if (typeof x.email_verified !== 'boolean') errors.push('email_verified: required')
    if (!isReturnUrl(x.return_url)) errors.push('return_url: invalid')
    const b = x.billing
    if (!isObject(b) || !isCents(b.migrate_fee_cents) || !isCents(b.quoted_total_cents) || b.quoted_total_cents <= 0
      || b.currency !== 'usd' || b.quoted_total_cents < b.migrate_fee_cents) {
      errors.push('billing: invalid')
    }
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

  const warnings: string[] = []
  if (x.comments_export !== undefined) {
    const ce = x.comments_export
    if (!isObject(ce)) {
      warnings.push('comments_export: invalid')
    }
    else {
      if (!isExportUrl(ce.url)) warnings.push('comments_export.url: invalid')
      if (!isCompactJws(ce.token)) warnings.push('comments_export.token: invalid')
      if (!isSeconds(ce.expires_at)) warnings.push('comments_export.expires_at: invalid')
      else if (isSeconds(x.iat) && ce.expires_at <= x.iat) warnings.push('comments_export.expires_at: not after iat')
      if (typeof ce.comments !== 'number' || !Number.isInteger(ce.comments) || ce.comments < 0) warnings.push('comments_export.comments: invalid')
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  if (warnings.length === 0) return { ok: true, claim: x as never }
  const { comments_export: _dropped, ...rest } = x
  return { ok: true, claim: rest as never, warnings }
}

/**
 * Shape-only type guard (no clock check). The signature is the consumer's job. Stricter than
 * `validateMigrateStudioClaim`: a claim whose `comments_export` would be dropped is `false` here,
 * since the guard narrows the input itself, malformed export included. To keep such a claim, use
 * `result.claim` from `validateMigrateStudioClaim`.
 */
export function isMigrateStudioClaim(input: unknown): input is MigrateStudioClaim {
  const result = validateMigrateStudioClaim(input)
  return result.ok && !result.warnings
}

// ─── Account state (Offer sizing) ───
//
// Before the Offer, Migrate asks Studio what the customer's GitHub account
// already has, so the Studio line and its price are right: nothing (`none`:
// "Migrate with Studio"), a plan that already carries the site (`covers`:
// "added to your plan, $0"), or one that does not (`too_small`: upgrade).
// Server to server, signed like a claim (same key, `iss`/`aud`/`jti`/`exp`).

export const MIGRATE_ACCOUNT_STATES = ['none', 'covers', 'too_small'] as const
export type MigrateAccountStateKind = (typeof MIGRATE_ACCOUNT_STATES)[number]

/** The signed request body Migrate sends. */
export interface MigrateAccountStateRequest {
  iss: typeof MIGRATE_STUDIO_CLAIM_ISSUER
  aud: typeof MIGRATE_STUDIO_CLAIM_AUDIENCE
  jti: string
  iat: number
  exp: number
  github_user_id: string
  /** The plan discovery sized (`MigrateStudioPlan`). */
  plan: MigrateStudioPlan
}

/** Studio's answer. `year1_cents` is what the Studio line adds to the first invoice (0 when `covers`). */
export interface MigrateAccountStateResponse {
  state: MigrateAccountStateKind
  /** The plan the Studio line sells or keeps: the sized plan, or the account's own when it covers. */
  plan: MigrateStudioPlan
  /** Studio part of the first invoice, in cents: year 1 at 20% off (`none`), the plan difference (`too_small`), 0 (`covers`). */
  year1_cents: number
  /** The account's current plan, when it has a running one. */
  current_plan?: MigrateStudioPlan
}

/** Plans in ascending order; a higher index carries more. */
const PLAN_RANK: Record<MigrateStudioPlan, number> = { starter: 0, pro: 1 }

/**
 * Check the signed request Studio receives. Pass `now` (seconds since the
 * epoch) to also check the validity window. It does no cryptography, and it
 * does not remember `jti`: Studio keeps a replay record for account-state
 * requests, as it does for claims (a repeated `jti` is refused).
 */
export function validateMigrateAccountStateRequest(input: unknown, options: { now?: number } = {}):
  | { ok: true, request: MigrateAccountStateRequest }
  | { ok: false, errors: string[] } {
  if (!isObject(input)) return { ok: false, errors: ['payload: not an object'] }
  const x = input
  const errors: string[] = []
  if (x.iss !== MIGRATE_STUDIO_CLAIM_ISSUER) errors.push('iss: unexpected issuer')
  if (x.aud !== MIGRATE_STUDIO_CLAIM_AUDIENCE) errors.push('aud: unexpected audience')
  if (!isText(x.jti)) errors.push('jti: required')
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
  if (typeof x.github_user_id !== 'string' || !/^[1-9]\d{0,18}$/.test(x.github_user_id)) errors.push('github_user_id: invalid')
  if (!(MIGRATE_STUDIO_PLANS as readonly unknown[]).includes(x.plan)) errors.push('plan: unknown plan')
  return errors.length === 0 ? { ok: true, request: x as unknown as MigrateAccountStateRequest } : { ok: false, errors }
}

/**
 * Check Studio's answer against the plan that was asked about (`requested`,
 * required: an answer is only meaningful against its question), which is what
 * Migrate does before it prices an Offer from it:
 * - `none`: no `current_plan`; `plan` is the requested plan.
 * - `too_small`: `plan` is the requested plan and `current_plan` is below it.
 * - `covers`: `current_plan` is at least the requested plan, `plan` is that
 *   current plan, and nothing is added (`year1_cents` 0).
 * Errors are the stable `field: problem` strings the claim validators use.
 */
export function validateMigrateAccountStateResponse(input: unknown, options: { requested: MigrateStudioPlan }):
  | { ok: true, response: MigrateAccountStateResponse }
  | { ok: false, errors: string[] } {
  if (!isObject(input)) return { ok: false, errors: ['payload: not an object'] }
  const errors: string[] = []
  const planOk = (MIGRATE_STUDIO_PLANS as readonly unknown[]).includes(input.plan)
  const currentOk = (MIGRATE_STUDIO_PLANS as readonly unknown[]).includes(input.current_plan)
  if (!(MIGRATE_ACCOUNT_STATES as readonly unknown[]).includes(input.state)) errors.push('state: unknown')
  if (!planOk) errors.push('plan: unknown plan')
  if (!isCents(input.year1_cents)) errors.push('year1_cents: invalid')
  else if (input.state === 'covers' && input.year1_cents !== 0) errors.push('year1_cents: must be 0 when covers')
  else if (input.state !== undefined && input.state !== 'covers' && input.year1_cents === 0) errors.push('year1_cents: must be > 0')
  if (input.current_plan !== undefined && !currentOk) errors.push('current_plan: unknown plan')
  if (input.state === 'none' && input.current_plan !== undefined) errors.push('current_plan: not allowed when none')
  if ((input.state === 'covers' || input.state === 'too_small') && input.current_plan === undefined) errors.push('current_plan: required unless none')
  const asked = (options as { requested?: unknown } | undefined)?.requested as MigrateStudioPlan
  // Fail closed: a missing or unknown `requested` (a caller bypassing the types) can never pass.
  if (!(MIGRATE_STUDIO_PLANS as readonly unknown[]).includes(asked)) errors.push('requested: unknown plan')
  else if (planOk) {
    const plan = input.plan as MigrateStudioPlan
    if (input.state === 'covers') {
      if (currentOk && PLAN_RANK[input.current_plan as MigrateStudioPlan] < PLAN_RANK[asked]) errors.push('current_plan: below the requested plan')
      if (currentOk && plan !== input.current_plan) errors.push('plan: must be the current plan when covers')
    }
    else if (input.state === 'none' || input.state === 'too_small') {
      if (plan !== asked) errors.push('plan: not the requested plan')
      if (input.state === 'too_small' && currentOk && PLAN_RANK[input.current_plan as MigrateStudioPlan] >= PLAN_RANK[asked]) errors.push('current_plan: not below the requested plan')
    }
  }
  return errors.length === 0 ? { ok: true, response: input as unknown as MigrateAccountStateResponse } : { ok: false, errors }
}

// ─── Grant status and install URL (Studio setup beside the live move) ───
//
// While the move runs, the Migrate page can show a Studio card: is the trial
// running, and may the customer connect Studio's GitHub App yet? Both are
// asked of Studio, server to server, signed like the account-state request
// (same key, `iss`/`aud`/`jti`/`exp`, the token POSTed as `{ token }`). The
// order is the key: Studio keeps one grant per `order_id`, and an order Studio
// has no grant for is a 404 there, not a state.

export const MIGRATE_GRANT_STATES = ['claimed', 'bound', 'redeemed', 'revoked'] as const
/**
 * Where the order's Studio grant stands:
 * - `claimed`: provisioned, the Studio year not started (checkout not completed).
 * - `bound`: tied to a Studio workspace, the subscription not running yet
 *   (checkout open or its webhook late).
 * - `redeemed`: the subscription is running (trial or paid). Only now may the
 *   customer connect GitHub, or Studio could not open a project (402).
 * - `revoked`: the grant was withdrawn (by the founder, or after a refund).
 *   Never installed; Migrate shows it as "not ready", like an unknown state.
 */
export type MigrateGrantState = (typeof MIGRATE_GRANT_STATES)[number]

/** The signed envelope every Migrate → Studio request after provisioning carries. */
interface MigrateS2sEnvelope {
  iss: typeof MIGRATE_STUDIO_CLAIM_ISSUER
  aud: typeof MIGRATE_STUDIO_CLAIM_AUDIENCE
  jti: string
  iat: number
  exp: number
  /** The Migrate order whose grant is asked about. */
  order_id: string
}

/** `POST /api/migrate/grants/status`: where does this order's grant stand? */
export type MigrateGrantStatusRequest = MigrateS2sEnvelope

/** `POST /api/migrate/grants/install-url`: where may the customer install Studio's GitHub App? */
export type MigrateInstallUrlRequest = MigrateS2sEnvelope

export interface MigrateGrantStatusResponse {
  state: MigrateGrantState
  /** Studio's GitHub App is installed for the grant's workspace. Only possible once `redeemed`. */
  installed: boolean
}

export interface MigrateInstallUrlResponse {
  /**
   * The GitHub App install page, `https://github.com/apps/<slug>/installations/new?state=<signed>`.
   * It carries Studio's own signed `state` (grant, workspace, return address), and no repository:
   * during the move the delivery repository does not exist yet. Opened by the customer's browser.
   */
  url: string
  /** When `url` stops being useful (its `state` expires), seconds since the epoch. */
  expires_at: number
}

function checkS2sEnvelope(input: unknown, options: { now?: number }):
  | { ok: true, request: MigrateS2sEnvelope }
  | { ok: false, errors: string[] } {
  if (!isObject(input)) return { ok: false, errors: ['payload: not an object'] }
  const x = input
  const errors: string[] = []
  if (x.iss !== MIGRATE_STUDIO_CLAIM_ISSUER) errors.push('iss: unexpected issuer')
  if (x.aud !== MIGRATE_STUDIO_CLAIM_AUDIENCE) errors.push('aud: unexpected audience')
  if (!isText(x.jti)) errors.push('jti: required')
  if (!isText(x.order_id)) errors.push('order_id: required')
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
  return errors.length === 0 ? { ok: true, request: x as unknown as MigrateS2sEnvelope } : { ok: false, errors }
}

/** Check the signed status request Studio receives. Same rules as `validateMigrateAccountStateRequest`; the signature and `jti` replay are the consumer's. */
export function validateMigrateGrantStatusRequest(input: unknown, options: { now?: number } = {}):
  | { ok: true, request: MigrateGrantStatusRequest }
  | { ok: false, errors: string[] } {
  return checkS2sEnvelope(input, options)
}

/** Check the signed install-URL request Studio receives. Same rules as the status request. */
export function validateMigrateInstallUrlRequest(input: unknown, options: { now?: number } = {}):
  | { ok: true, request: MigrateInstallUrlRequest }
  | { ok: false, errors: string[] } {
  return checkS2sEnvelope(input, options)
}

/** Check Studio's status answer. `installed` without `redeemed` is refused: an install can only follow a running subscription. */
export function validateMigrateGrantStatusResponse(input: unknown):
  | { ok: true, response: MigrateGrantStatusResponse }
  | { ok: false, errors: string[] } {
  if (!isObject(input)) return { ok: false, errors: ['payload: not an object'] }
  const errors: string[] = []
  if (!(MIGRATE_GRANT_STATES as readonly unknown[]).includes(input.state)) errors.push('state: unknown')
  if (typeof input.installed !== 'boolean') errors.push('installed: required')
  else if (input.installed && input.state !== 'redeemed') errors.push('installed: only once redeemed')
  return errors.length === 0 ? { ok: true, response: input as unknown as MigrateGrantStatusResponse } : { ok: false, errors }
}

/**
 * Check Studio's install-URL answer before Migrate hands it to a browser: the
 * address must be GitHub's own install page for an App (`https://github.com/apps/<slug>/installations/new`,
 * no credentials, no fragment), and must not already be expired when `now` is given.
 */
export function validateMigrateInstallUrlResponse(input: unknown, options: { now?: number } = {}):
  | { ok: true, response: MigrateInstallUrlResponse }
  | { ok: false, errors: string[] } {
  if (!isObject(input)) return { ok: false, errors: ['payload: not an object'] }
  const errors: string[] = []
  if (!isGithubInstallUrl(input.url)) errors.push('url: not a GitHub App install address')
  if (!isSeconds(input.expires_at)) errors.push('expires_at: invalid')
  else if (options.now !== undefined && input.expires_at <= options.now) errors.push('expires_at: expired')
  return errors.length === 0 ? { ok: true, response: input as unknown as MigrateInstallUrlResponse } : { ok: false, errors }
}

function isGithubInstallUrl(x: unknown): x is string {
  if (typeof x !== 'string' || x.length > 4096) return false
  let url: URL
  try { url = new URL(x) }
  catch { return false }
  return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password && !url.hash
    && /^\/apps\/[\w-]+\/installations\/new(\/permissions)?\/?$/.test(url.pathname)
}
