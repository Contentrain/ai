import { describe, expect, it } from 'vitest'
import { MemoryAuditLog } from './audit.js'
import { CircuitBreaker, MemoryDailyBudget } from './budget.js'
import { MemoryDecisionCache } from './cache.js'
import { createDecider, decide } from './decide.js'
import { createJevProvider } from './jev.js'
import type { DecisionProvider } from './types.js'
import { ENV, eligibilityAnswer, punchAnswer, scriptedFetch, site } from './test-support.js'

const punch = (reason: string, label = '(aile: post)') => ({ label, reason })

function jevWith(answer: Parameters<typeof scriptedFetch>[0]) {
  const scripted = scriptedFetch(answer)
  return { ...scripted, jev: createJevProvider({ env: ENV, fetch: scripted.fetch }) }
}

describe('decide — the chain', () => {
  it('a final rule answer never reaches a provider', async () => {
    const { jev, calls } = jevWith(() => eligibilityAnswer('page_only', 0.9))
    const decision = await createDecider({ jev }).decide('eligibility_band', site(40))
    expect(calls).toHaveLength(0)
    expect(decision).toMatchObject({ kind: 'eligibility_band', version: '1', choice: 'eligible', confidence: 1, source: 'rule' })
    expect(decision.key).toMatch(/^[0-9a-f]{64}$/)
    expect(decision.unreviewed).toBeUndefined()
  })

  it('an input in the band is asked of Jev, and Jev\'s answer wins over the tentative rule', async () => {
    const { jev, calls } = jevWith(() => eligibilityAnswer('eligible', 0.82))
    const decision = await createDecider({ jev }).decide('eligibility_band', site(20, [['product', 30]]))
    expect(calls).toHaveLength(1)
    expect(decision).toMatchObject({ choice: 'eligible', confidence: 0.82, source: 'jev', model: 'jev-test', cost: { input_tokens: 100, output_tokens: 10 } })
  })

  it('a Jev answer under the confidence floor becomes needs_human, keeping the pick as proposed', async () => {
    const { jev } = jevWith(() => eligibilityAnswer('custom_type', 0.31))
    const decision = await createDecider({ jev }).decide('eligibility_band', site(1, [['product', 3]]))
    expect(decision).toMatchObject({ choice: 'needs_human', proposed: 'custom_type', confidence: 0.31, source: 'jev' })
  })

  it('asks the same shaped input once: the second time it is a cache hit', async () => {
    const { jev, calls } = jevWith(() => punchAnswer('measurement', 2.2))
    const cache = new MemoryDecisionCache()
    const decider = createDecider({ jev, cache })
    const first = await decider.decide('punch_item', punch('en kötü sayfa 43.2 < 80'))
    // Same decision content, a different link: the shaper drops it, so the key is the same.
    const second = await decider.decide('punch_item', { ...punch('en kötü sayfa 43.2 < 80'), link: 'https://example.org/x/' })
    expect(calls).toHaveLength(1)
    expect(first.source).toBe('jev')
    expect(second).toMatchObject({ source: 'cache', choice: 'measurement', score: 2.2, key: first.key, model: 'jev-test' })
    expect(second.cost).toBeUndefined()
    expect(cache.size).toBe(1)
  })

  it('noCache neither reads nor writes the cache', async () => {
    const { jev, calls } = jevWith(() => punchAnswer('measurement', 2.2))
    const cache = new MemoryDecisionCache()
    const decider = createDecider({ jev, cache })
    await decider.decide('punch_item', punch('r'), { noCache: true })
    await decider.decide('punch_item', punch('r'), { noCache: true })
    expect(calls).toHaveLength(2)
    expect(cache.size).toBe(0)
  })

  it('folds duplicate inputs into one question and keeps the caller\'s order', async () => {
    const { jev, calls } = jevWith(line => punchAnswer(line.includes('b') ? 'cosmetic' : 'measurement', 0.5))
    const decisions = await createDecider({ jev }).decideMany('punch_item', [punch('a'), punch('b'), punch('a')])
    expect(calls).toHaveLength(1)
    expect(Object.keys(calls[0]!.body.questions)).toHaveLength(4)
    expect(decisions.map(d => d.choice)).toEqual(['measurement', 'cosmetic', 'measurement'])
  })

  it('batches at most 32 items a request and splits usage so the shares add up', async () => {
    const { jev, calls } = jevWith(() => punchAnswer('cosmetic', 0.1))
    const decisions = await createDecider({ jev, pricing: { inputPerMTok: 1, outputPerMTok: 5 } })
      .decideMany('punch_item', Array.from({ length: 70 }, (_, i) => punch(`reason ${i}`)))
    expect(calls.map(call => Object.keys(call.body.questions).length / 2)).toEqual([32, 32, 6])
    const firstBatch = decisions.slice(0, 32)
    expect(firstBatch.reduce((sum, d) => sum + d.cost!.input_tokens, 0)).toBe(100)
    expect(firstBatch.reduce((sum, d) => sum + d.cost!.output_tokens, 0)).toBe(10)
    expect(decisions[0]!.cost).toEqual({ input_tokens: 4, output_tokens: 1, usd: (4 + 5) / 1e6 })
  })

  it('a provider answer outside the closed set is not taken', async () => {
    const { jev } = jevWith(() => punchAnswer('made_up_class', 1))
    const decision = await createDecider({ jev }).decide('punch_item', punch('ölçülemedi — zaman aşımı'))
    expect(decision).toMatchObject({ choice: 'measurement', source: 'rule', unreviewed: true, fallback: 'no_answer' })
  })

  it('throws only for an unknown kind', async () => {
    await expect(createDecider({ jev: false }).decide('nope', {})).rejects.toThrow('unknown decision kind: nope (known: punch_item, eligibility_band)')
  })

  it('options.rule replaces the kind\'s rule, and null asks none', async () => {
    const { jev, calls } = jevWith(() => eligibilityAnswer('page_only', 0.9))
    const decider = createDecider({ jev })
    const hostRule = await decider.decide('eligibility_band', site(40), { rule: () => ({ choice: 'custom_type', confidence: 1, final: true }) })
    expect(hostRule).toMatchObject({ choice: 'custom_type', source: 'rule' })
    const noRule = await decider.decide('eligibility_band', site(40), { rule: null })
    expect(noRule).toMatchObject({ choice: 'page_only', source: 'jev' })
    expect(calls).toHaveLength(1)
  })
})

describe('decide — nothing breaks the flow', () => {
  it('without a token, answers from the rule, unreviewed', async () => {
    const decision = await createDecider({ jev: createJevProvider({ env: {} }) }).decide('eligibility_band', site(20, [['product', 30]]))
    expect(decision).toMatchObject({ choice: 'custom_type', confidence: 0.5, source: 'rule', unreviewed: true, fallback: 'no_provider' })
  })

  it('with no rule opinion and no provider, returns an empty unreviewed decision', async () => {
    const decision = await createDecider({ jev: false }).decide('punch_item', punch('en kötü sayfa 56.4 < 80'))
    expect(decision).toMatchObject({ confidence: 0, source: 'rule', unreviewed: true, fallback: 'no_provider' })
    expect(decision.choice).toBeUndefined()
  })

  it('on an HTTP error, falls back and does not cache the fallback', async () => {
    const cache = new MemoryDecisionCache()
    const jev = createJevProvider({ env: ENV, fetch: (async () => new Response('overloaded', { status: 529 })) as typeof fetch })
    const decision = await createDecider({ jev, cache }).decide('punch_item', punch('gövde yuvası yok'))
    expect(decision).toMatchObject({ choice: 'source_limit', source: 'rule', unreviewed: true, fallback: 'error' })
    expect(cache.size).toBe(0)
  })

  it('on a timeout, falls back with the reason', async () => {
    const hang = ((_url: string, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    })) as typeof fetch
    const decision = await createDecider({ jev: createJevProvider({ env: ENV, fetch: hang, timeoutMs: 10 }) }).decide('punch_item', punch('r'))
    expect(decision.fallback).toBe('timeout')
  })

  it('stops calling after the breaker opens', async () => {
    let requests = 0
    const jev = createJevProvider({ env: ENV, fetch: (async () => {
      requests++
      return new Response('down', { status: 500 })
    }) as typeof fetch })
    const decider = createDecider({ jev, breakers: { jev: new CircuitBreaker({ failures: 2, cooldownMs: 60_000 }) } })
    const reasons = []
    for (let i = 0; i < 4; i++) reasons.push((await decider.decide('punch_item', punch(`r${i}`))).fallback)
    expect(requests).toBe(2)
    expect(reasons).toEqual(['error', 'error', 'circuit_open', 'circuit_open'])
  })

  it('over the tenant\'s daily cap, the rest fall back as budget', async () => {
    const { jev, calls } = jevWith(() => punchAnswer('cosmetic', 0.5))
    const decider = createDecider({ jev, budget: new MemoryDailyBudget(3), now: () => new Date('2026-09-18T12:00:00Z') })
    const decisions = await decider.decideMany('punch_item', [punch('a'), punch('b'), punch('c'), punch('d'), punch('e')], { tenant: 'acme' })
    expect(decisions.map(d => d.source)).toEqual(['jev', 'jev', 'jev', 'rule', 'rule'])
    expect(decisions[4]).toMatchObject({ unreviewed: true, fallback: 'budget' })
    expect(Object.keys(calls[0]!.body.questions)).toHaveLength(6)
    expect((await decider.decide('punch_item', punch('f'), { tenant: 'other' })).source).toBe('jev')
  })

  it('cache hits and final rules cost no budget', async () => {
    const { jev } = jevWith(() => eligibilityAnswer('eligible', 0.9))
    const budget = new MemoryDailyBudget(1)
    const now = new Date('2026-09-18T12:00:00Z')
    const decider = createDecider({ jev, budget, now: () => now })
    await decider.decide('eligibility_band', site(40))
    await decider.decide('eligibility_band', site(20, [['product', 30]]))
    await decider.decide('eligibility_band', site(20, [['product', 30]]))
    expect(budget.used('default', now)).toBe(1)
  })

  it('moves on to the LLM provider when Jev fails, and records a tried provider\'s reason over an untried one', async () => {
    const jev = createJevProvider({ env: ENV, fetch: (async () => new Response('x', { status: 500 })) as typeof fetch })
    const llm: DecisionProvider = { name: 'llm', available: () => true, ask: async (_spec, shaped) => ({ outcomes: shaped.map(() => ({ choice: 'cosmetic', score: 0, confidence: 0.6 })) }) }
    expect(await createDecider({ jev, llm }).decide('punch_item', punch('r'))).toMatchObject({ choice: 'cosmetic', source: 'llm' })
    const unavailable: DecisionProvider = { ...llm, available: () => false }
    expect((await createDecider({ jev, llm: unavailable }).decide('punch_item', punch('r'))).fallback).toBe('error')
  })
})

describe('decide — audit', () => {
  it('writes one record per decision with the input hash and never the input', async () => {
    const { jev } = jevWith(() => punchAnswer('product_defect', 2.4, 0.66))
    const audit = new MemoryAuditLog()
    const decider = createDecider({ jev, audit, now: () => new Date('2026-09-18T12:00:00Z') })
    const [decision] = await decider.decideMany('punch_item', [punch('dinamik liste bağlanmadı — gizli-başlık')], { tenant: 'acme' })
    await decider.decide('eligibility_band', site(40))
    expect(audit.records).toHaveLength(2)
    expect(audit.records[0]).toEqual({
      at: '2026-09-18T12:00:00.000Z', tenant: 'acme', kind: 'punch_item', version: '1', key: decision!.key,
      choice: 'product_defect', score: 2.4, confidence: 0.66, source: 'jev', ms: decision!.ms, model: 'jev-test',
      input_tokens: 100, output_tokens: 10,
    })
    expect(JSON.stringify(audit.records)).not.toContain('gizli-başlık')
    expect(audit.records[1]).toMatchObject({ kind: 'eligibility_band', source: 'rule', choice: 'eligible' })
  })
})

describe('decide (default decider)', () => {
  it('answers a clear case from the rule with no configuration', async () => {
    expect(await decide('eligibility_band', { ...site(3), access: 'unreachable' as const })).toMatchObject({ choice: 'access_blocked', source: 'rule' })
  })
})
