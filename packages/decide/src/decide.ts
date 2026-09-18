// ─── The decider ───
//
// rule → cache → jev → llm → the rule's tentative answer.
//
// A final rule answer ends the chain before any lookup. Anything else is looked
// up in the cache, then asked of each available provider in turn, in batches.
// A provider that is off, over budget, behind an open circuit, slow or broken
// never fails the call: its items move on down the chain and, at the end, take
// the rule's tentative answer marked `unreviewed`.

import { type AuditSink, toAuditRecord } from './audit.js'
import { type BatchLimits, estimateTokens, planBatches } from './batch.js'
import type { DecisionBudget } from './budget.js'
import { CircuitBreaker } from './budget.js'
import { type CachedDecision, type DecisionCache, MemoryDecisionCache, cacheKey } from './cache.js'
import { JevError, buildJevRequest, createJevProvider } from './jev.js'
import { BUILTIN_KINDS } from './kinds/index.js'
import { noopLlmProvider } from './llm.js'
import type { Decision, DecisionProvider, FallbackReason, KindSpec, Outcome, RuleVerdict } from './types.js'

export interface Pricing {
  /** USD per million input tokens. */
  inputPerMTok: number
  /** USD per million output tokens. */
  outputPerMTok: number
}

export interface DeciderConfig {
  /** Kinds this decider answers. Default: the built-in kinds. */
  kinds?: ReadonlyArray<KindSpec<any, any>>
  /** Default: Jev over `process.env`; `false` turns it off. */
  jev?: DecisionProvider | false
  /** Default: `noopLlmProvider`. */
  llm?: DecisionProvider
  /** Default: an in-memory cache for this decider's lifetime. */
  cache?: DecisionCache
  audit?: AuditSink
  /** Absent: no cap. */
  budget?: DecisionBudget
  /** One per provider. Default: 3 failures, 60s cooldown. */
  breakers?: Partial<Record<'jev' | 'llm', CircuitBreaker>>
  batch?: BatchLimits
  /** Without it `cost.usd` is left out; the vendor publishes no price. */
  pricing?: Pricing
  now?: () => Date
}

export interface DecideOptions<I = unknown> {
  /** Budget and audit tenant. Default `default`. */
  tenant?: string
  /** Replace the kind's rule, e.g. with the host's own verdict function. `null` asks no rule. */
  rule?: ((input: I) => RuleVerdict | undefined) | null
  /** Skip the cache lookup and do not store the answer. */
  noCache?: boolean
}

export interface Decider {
  decide: <I>(kind: string, input: I, options?: DecideOptions<I>) => Promise<Decision>
  decideMany: <I>(kind: string, inputs: readonly I[], options?: DecideOptions<I>) => Promise<Decision[]>
  kinds: () => string[]
}

interface Pending {
  /** Positions in the caller's input list sharing this key. */
  at: number[]
  key: string
  shaped: unknown
  rule: RuleVerdict | undefined
}

function validOutcome(spec: KindSpec<any, any>, outcome: Outcome | undefined): outcome is Outcome {
  if (!outcome) return false
  if (outcome.choice !== undefined && spec.choices && !spec.choices.includes(outcome.choice)) return false
  if (outcome.score !== undefined && spec.scoreRange && (outcome.score < spec.scoreRange[0] || outcome.score > spec.scoreRange[1])) return false
  return Number.isFinite(outcome.confidence)
}

function fromOutcome(spec: KindSpec<any, any>, key: string, outcome: Outcome, source: Decision['source'], ms: number): Decision {
  const decision: Decision = { kind: spec.kind, version: spec.version, key, confidence: outcome.confidence, source, ms }
  if (outcome.choice !== undefined) decision.choice = outcome.choice
  if (outcome.score !== undefined) decision.score = outcome.score
  if (outcome.probabilities) decision.probabilities = outcome.probabilities
  return decision
}

/** A provider answer under the kind's confidence floor becomes the kind's human-review choice. */
function applyFloor(spec: KindSpec<any, any>, decision: Decision): Decision {
  const floor = spec.lowConfidence
  if (!floor || decision.choice === undefined || decision.confidence >= floor.threshold) return decision
  return { ...decision, proposed: decision.choice, choice: floor.choice }
}

function fallback(spec: KindSpec<any, any>, item: Pending, reason: FallbackReason, ms: number): Decision {
  const base = item.rule
    ? fromOutcome(spec, item.key, item.rule, 'rule', ms)
    : { kind: spec.kind, version: spec.version, key: item.key, confidence: 0, source: 'rule' as const, ms }
  return { ...base, unreviewed: true, fallback: reason }
}

function fromCache(cached: CachedDecision, key: string, ms: number): Decision {
  const { at: _at, source: _source, ...rest } = cached
  return { ...rest, key, source: 'cache', ms }
}

function toCached(decision: Decision, source: 'jev' | 'llm', at: string): CachedDecision {
  const cached: CachedDecision = { kind: decision.kind, version: decision.version, confidence: decision.confidence, source, at }
  for (const field of ['choice', 'score', 'probabilities', 'proposed', 'model'] as const) {
    if (decision[field] !== undefined) Object.assign(cached, { [field]: decision[field] })
  }
  return cached
}

/** Split `total` into `parts` integers that sum to it. */
function share(total: number, parts: number, index: number): number {
  const base = Math.floor(total / parts)
  return base + (index < total - base * parts ? 1 : 0)
}

export function createDecider(config: DeciderConfig = {}): Decider {
  const kinds = new Map((config.kinds ?? BUILTIN_KINDS).map(spec => [spec.kind, spec]))
  const cache = config.cache ?? new MemoryDecisionCache()
  const now = config.now ?? (() => new Date())
  const providers: DecisionProvider[] = []
  if (config.jev !== false) providers.push(config.jev ?? createJevProvider())
  providers.push(config.llm ?? noopLlmProvider)
  const breakers = new Map<string, CircuitBreaker>(providers.map(p => [p.name, config.breakers?.[p.name] ?? new CircuitBreaker()]))

  function cost(usage: { input_tokens: number, output_tokens: number } | undefined, parts: number, index: number): Decision['cost'] {
    if (!usage) return undefined
    const input_tokens = share(usage.input_tokens, parts, index)
    const output_tokens = share(usage.output_tokens, parts, index)
    const usd = config.pricing
      ? (input_tokens * config.pricing.inputPerMTok + output_tokens * config.pricing.outputPerMTok) / 1e6
      : undefined
    return usd === undefined ? { input_tokens, output_tokens } : { input_tokens, output_tokens, usd }
  }

  /** Ask one provider about `items`; answered items are returned by key, the rest keep their reason to fall back. */
  async function ask(provider: DecisionProvider, spec: KindSpec<any, any>, items: Pending[], tenant: string): Promise<{ answered: Map<string, Decision>, reasons: Map<string, FallbackReason> }> {
    const answered = new Map<string, Decision>()
    const reasons = new Map<string, FallbackReason>()
    const breaker = breakers.get(provider.name)!
    if (!provider.available() || (provider.name === 'jev' && !spec.jev)) {
      for (const item of items) reasons.set(item.key, 'no_provider')
      return { answered, reasons }
    }
    let allowed = items
    if (config.budget) {
      const granted = await config.budget.take(tenant, items.length, now())
      allowed = items.slice(0, granted)
      for (const item of items.slice(granted)) reasons.set(item.key, 'budget')
    }
    if (!allowed.length) return { answered, reasons }

    const fixed = spec.jev ? estimateTokens(spec.jev.preamble) : 0
    const costs = allowed.map(item => Math.max(1, estimateTokens(JSON.stringify(buildJevRequestFor(spec, item.shaped))) - fixed))
    for (const batch of planBatches(costs, fixed, config.batch)) {
      const members = batch.map(i => allowed[i]!)
      if (!breaker.allows()) {
        for (const item of members) reasons.set(item.key, 'circuit_open')
        continue
      }
      const started = performance.now()
      try {
        const answer = await provider.ask(spec, members.map(item => item.shaped))
        breaker.success()
        const ms = Math.round(performance.now() - started)
        members.forEach((item, i) => {
          const outcome = answer.outcomes[i]
          if (!validOutcome(spec, outcome)) {
            reasons.set(item.key, 'no_answer')
            return
          }
          const decision = fromOutcome(spec, item.key, outcome, provider.name, ms)
          const spent = cost(answer.usage, members.length, i)
          if (spent) decision.cost = spent
          if (answer.model) decision.model = answer.model
          answered.set(item.key, applyFloor(spec, decision))
        })
      }
      catch (error) {
        breaker.failure()
        const reason: FallbackReason = error instanceof JevError && error.timeout ? 'timeout' : 'error'
        for (const item of members) reasons.set(item.key, reason)
      }
    }
    return { answered, reasons }
  }

  async function decideMany<I>(kind: string, inputs: readonly I[], options: DecideOptions<I> = {}): Promise<Decision[]> {
    const spec = kinds.get(kind) as KindSpec<I, unknown> | undefined
    if (!spec) throw new TypeError(`unknown decision kind: ${kind} (known: ${[...kinds.keys()].join(', ')})`)
    const tenant = options.tenant ?? 'default'
    const rule = options.rule === null ? undefined : (options.rule ?? spec.rule)
    const results: Decision[] = Array.from({ length: inputs.length })

    // Shape, rule, and fold duplicate inputs into one pending item.
    const pending = new Map<string, Pending>()
    inputs.forEach((input, i) => {
      const started = performance.now()
      const shaped = spec.shape(input)
      const key = cacheKey(spec.kind, spec.version, shaped)
      const verdict = rule?.(input)
      const valid = verdict && validOutcome(spec, verdict) ? verdict : undefined
      if (valid?.final) {
        results[i] = fromOutcome(spec, key, valid, 'rule', Math.round(performance.now() - started))
        return
      }
      const existing = pending.get(key)
      if (existing) existing.at.push(i)
      else pending.set(key, { at: [i], key, shaped, rule: valid })
    })

    let open = [...pending.values()]
    if (!options.noCache) {
      const started = performance.now()
      const hits = await Promise.all(open.map(item => cache.get(item.key)))
      const ms = Math.round(performance.now() - started)
      open = open.filter((item, i) => {
        const hit = hits[i]
        if (hit?.kind !== spec.kind || hit.version !== spec.version) return true
        for (const at of item.at) results[at] = fromCache(hit, item.key, ms)
        return false
      })
    }

    const lastReason = new Map<string, FallbackReason>()
    for (const provider of providers) {
      if (!open.length) break
      const { answered, reasons } = await ask(provider, spec, open, tenant)
      for (const [key, decision] of answered) {
        const item = pending.get(key)!
        for (const at of item.at) results[at] = decision
        if (!options.noCache) await cache.set(key, toCached(decision, provider.name, now().toISOString()))
      }
      // A reason from a provider that was actually tried beats "not configured" from one after it.
      for (const [key, reason] of reasons) {
        if (reason !== 'no_provider' || !lastReason.has(key)) lastReason.set(key, reason)
      }
      open = open.filter(item => !answered.has(item.key))
    }
    for (const item of open) {
      const decision = fallback(spec, item, lastReason.get(item.key) ?? 'no_provider', 0)
      for (const at of item.at) results[at] = decision
    }

    if (config.audit) {
      const at = now().toISOString()
      await config.audit.write(results.map(decision => toAuditRecord(decision, at, tenant)))
    }
    return results
  }

  return {
    decideMany,
    decide: async (kind, input, options) => (await decideMany(kind, [input], options))[0]!,
    kinds: () => [...kinds.keys()],
  }
}

function buildJevRequestFor(spec: KindSpec<any, any>, shaped: unknown): unknown {
  return spec.jev ? buildJevRequest(spec, [shaped]) : shaped
}

let defaultDecider: Decider | undefined

/**
 * Decide with the default decider: built-in kinds, Jev when
 * `CONTENTRAIN_JEW_API_TOKEN` is set, an in-memory cache, no budget, no audit
 * log. Build your own with `createDecider` for anything else.
 */
export function decide<I>(kind: string, input: I, options?: DecideOptions<I>): Promise<Decision> {
  defaultDecider ??= createDecider()
  return defaultDecider.decide(kind, input, options)
}
