import { describe, expect, it } from 'vitest'
import { ANTHROPIC_ENDPOINT, ANTHROPIC_KEY_ENV, AnthropicError, anthropicRequestShapeHash, buildAnthropicRequest, createAnthropicProvider, readAnthropicResponse } from './anthropic.js'
import { CircuitBreaker, MemoryDailyBudget } from './budget.js'
import { MemoryDecisionCache } from './cache.js'
import { createDecider } from './decide.js'
import { buildJevRequest, createJevProvider, requestShapeHash } from './jev.js'
import { eligibilityBand } from './kinds/eligibility-band.js'
import { PUNCH_CLASSES, punchItem } from './kinds/punch-item.js'
import { ENV, punchAnswer, scriptedFetch, site } from './test-support.js'

const KEY = 'test-anthropic-key-not-a-real-secret'
const AENV = { [ANTHROPIC_KEY_ENV]: KEY }
const item = { label: '(aile: post)', reason: 'en kötü sayfa 56.4 < 80 (5 sayfa ölçüldü)', link: 'https://example.org/2026/a-post/', site: { name: 'Acme Blog', url: 'https://acme.example', decision: 'KABUL', median: 90, mobile_median: 80 } }
const punch = (reason: string) => ({ label: '(aile: post)', reason })

interface AnthropicCall { url: string, headers: Record<string, string>, body: ReturnType<typeof buildAnthropicRequest> }

/** A Messages API that answers every item of a request with `record(n)`, recording each call. */
function scriptedAnthropic(record: (n: number) => Record<string, unknown> | undefined) {
  const calls: AnthropicCall[] = []
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as AnthropicCall['body']
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body })
    const count = Number(/Tüm (\d+) kalemi|Give all (\d+) items/.exec(body.messages[0]!.content)?.slice(1).find(Boolean))
    const items = Array.from({ length: count }, (_, i) => {
      const answer = record(i + 1)
      return answer && { item: i + 1, ...answer }
    }).filter(Boolean)
    return new Response(JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'record_answers', input: { items } }],
      usage: { input_tokens: 200, output_tokens: 40 },
    }), { status: 200 })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const haikuWith = (record: (n: number) => Record<string, unknown> | undefined) => {
  const scripted = scriptedAnthropic(record)
  return { ...scripted, llm: createAnthropicProvider({ env: AENV, fetch: scripted.fetch }) }
}

// AO-9's prompt, copied from the experiment that measured Haiku on PoC-1.
function ao9Prompt(shaped: unknown[]): string {
  const { state, questions } = buildJevRequest(punchItem, shaped)
  const q = questions.item1_class as { instructions: string, criteria: Record<string, string> }
  const s = questions.item1_severity as { instructions: string, criteria: readonly string[] }
  const h = questions.item1_needs_human!
  return [
    'Aşağıdaki durum bir WordPress → Astro taşıma koşusunun bitirilecekler listesinden bir sitenin kalemlerini içeriyor.',
    '', '<state>', state, '</state>', '',
    `Her kalem için üç soruyu yanıtla (itemN yerine kalem numarası):`,
    `1) class — ${q.instructions.replace('item1', 'itemN')} Seçenekler:`,
    ...Object.entries(q.criteria).map(([k, v]) => `   - ${k}: ${v}`),
    `2) severity — ${s.instructions.replace('item1', 'itemN')} 0–3 arası tam sayı:`,
    ...s.criteria.map((c, n) => `   ${n}: ${c}`),
    `3) needs_human — önermenin doğru olma olasılığı (0–1): ${h.instructions.replace('item1', 'itemN')}`,
    '', `Tüm ${shaped.length} kalemi record_answers aracıyla, her kalem için bir kayıt olarak ver.`,
  ].join('\n')
}

describe('Anthropic provider', () => {
  it('reads the key from the environment only, and is unavailable without one', () => {
    expect(ANTHROPIC_KEY_ENV).toBe('ANTHROPIC_API_KEY')
    expect(createAnthropicProvider({ env: {} }).available()).toBe(false)
    expect(createAnthropicProvider({ env: { [ANTHROPIC_KEY_ENV]: ' ' } }).available()).toBe(false)
    expect(createAnthropicProvider({ env: AENV }).available()).toBe(true)
  })

  it('asks Haiku at temperature 0 at the fixed endpoint, through a forced tool call', async () => {
    const { llm, calls } = haikuWith(() => ({ class: 'measurement', severity: 1, needs_human: 0.3 }))
    const answer = await llm.ask(punchItem, [punchItem.shape(item)])
    expect(ANTHROPIC_ENDPOINT).toBe('https://api.anthropic.com/v1/messages')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(ANTHROPIC_ENDPOINT)
    expect(calls[0]!.headers['x-api-key']).toBe(KEY)
    expect(calls[0]!.body).toMatchObject({ model: 'claude-haiku-4-5-20251001', temperature: 0, max_tokens: 4096, tool_choice: { type: 'tool', name: 'record_answers' } })
    const content = calls[0]!.body.messages[0]!.content
    for (const leak of ['example.org', 'acme', 'Acme']) expect(content).not.toContain(leak)
    expect(answer).toEqual({ outcomes: [{ choice: 'measurement', score: 1, confidence: 0 }], usage: { input_tokens: 200, output_tokens: 40 }, model: 'claude-haiku-4-5-20251001' })
  })

  it('sends punch_item the prompt and tool AO-9 measured, byte for byte', () => {
    const shaped = [punchItem.shape(item), punchItem.shape({ ...item, reason: 'gövde yuvası yok', link: undefined })]
    const request = buildAnthropicRequest(punchItem, shaped)
    expect(request.messages[0]!.content).toBe(ao9Prompt(shaped))
    expect(request.tools).toEqual([{
      name: 'record_answers',
      description: 'Record the answers for every item.',
      input_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item: { type: 'integer' },
                class: { type: 'string', enum: [...PUNCH_CLASSES] },
                severity: { type: 'integer', minimum: 0, maximum: 3 },
                needs_human: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: ['item', 'class', 'severity', 'needs_human'],
            },
          },
        },
        required: ['items'],
      },
    }])
  })

  it('builds a generic prompt for a kind without its own, listing every option', () => {
    const request = buildAnthropicRequest(eligibilityBand, [eligibilityBand.shape(site(20, [['product', 30]]))])
    const content = request.messages[0]!.content
    expect(content).toContain('1) eligibility — itemN: where does this site\'s content live')
    for (const choice of ['eligible', 'custom_type', 'page_only', 'access_blocked']) expect(content).toContain(`   - ${choice}: `)
    expect(content).not.toContain('needs_human')
    expect(content).not.toContain('Private title')
    expect(content.endsWith('Give all 1 items through the record_answers tool, one record per item.')).toBe(true)
  })

  it('never puts the key in the provider object or an error', async () => {
    const provider = createAnthropicProvider({ env: AENV, fetch: (async () => new Response(`bad key ${KEY}`, { status: 401 })) as typeof fetch })
    expect(JSON.stringify(provider)).not.toContain(KEY)
    const error = await provider.ask(punchItem, [punchItem.shape(item)]).catch((e: unknown) => e) as AnthropicError
    expect(error).toBeInstanceOf(AnthropicError)
    expect(error.status).toBe(401)
    expect(error.message).not.toContain(KEY)
    expect(error.message).toContain('[redacted]')
  })

  it('throws a timeout error when the endpoint does not answer in time', async () => {
    const hang = ((_url: string, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    })) as typeof fetch
    const error = await createAnthropicProvider({ env: AENV, fetch: hang, timeoutMs: 20 }).ask(punchItem, [punchItem.shape(item)]).catch((e: unknown) => e) as AnthropicError
    expect(error.timeout).toBe(true)
  })

  it('fails without a key instead of sending an unauthenticated request', async () => {
    const { fetch, calls } = scriptedAnthropic(() => undefined)
    await expect(createAnthropicProvider({ env: {}, fetch }).ask(punchItem, [punchItem.shape(item)])).rejects.toThrow('ANTHROPIC_API_KEY is not set')
    expect(calls).toHaveLength(0)
  })

  it('leaves an item undefined when its record is missing or a field is outside the question', () => {
    const body = {
      content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'record_answers', input: { items: [
        { item: 1, class: 'cosmetic', severity: 0, needs_human: 0.1 },
        { item: 2, class: 'not_a_class', severity: 1, needs_human: 0.1 },
        { item: 3, class: 'cosmetic', severity: 1.5, needs_human: 0.1 },
        { item: 4, class: 'cosmetic', severity: 4, needs_human: 0.1 },
        { item: 5, class: 'cosmetic', severity: 1 },
      ] } }],
    }
    const { outcomes } = readAnthropicResponse(punchItem, 6, body)
    expect(outcomes).toEqual([{ choice: 'cosmetic', score: 0, confidence: 0 }, undefined, undefined, undefined, undefined, undefined])
    expect(readAnthropicResponse(punchItem, 1, { content: 'nope' }).outcomes).toEqual([undefined])
  })

  it('has its own request-shape hash, and leaves the Jev shape (the cache key) alone', () => {
    const base = anthropicRequestShapeHash(punchItem)
    expect(base).toMatch(/^[0-9a-f]{16}$/)
    expect(anthropicRequestShapeHash(punchItem, 'claude-sonnet-5')).not.toBe(base)
    expect(anthropicRequestShapeHash({ ...punchItem, jev: { ...punchItem.jev!, llmPrompt: undefined } })).not.toBe(base)
    expect(requestShapeHash({ ...punchItem, jev: { ...punchItem.jev!, llmPrompt: undefined } })).toBe(requestShapeHash(punchItem))
  })
})

describe('decide — Jev, then Haiku', () => {
  const jevDown = () => {
    let requests = 0
    const jev = createJevProvider({ env: ENV, fetch: (async () => {
      requests++
      return new Response('down', { status: 503 })
    }) as typeof fetch })
    return { jev, requests: () => requests }
  }

  it('asks Haiku once Jev\'s breaker is open, caches under the same key, and serves the cache next time', async () => {
    const down = jevDown()
    const { llm, calls } = haikuWith(() => ({ class: 'cosmetic', severity: 0, needs_human: 0.2 }))
    const cache = new MemoryDecisionCache()
    const decider = createDecider({ jev: down.jev, llm, cache, breakers: { jev: new CircuitBreaker({ failures: 1, cooldownMs: 60_000 }) } })

    const first = await decider.decide('punch_item', punch('a'))
    expect(first).toMatchObject({ choice: 'cosmetic', score: 0, confidence: 0, source: 'llm', model: 'claude-haiku-4-5-20251001', shape: requestShapeHash(punchItem) })
    const second = await decider.decide('punch_item', punch('b'))
    expect(second.source).toBe('llm')
    expect(down.requests()).toBe(1) // open: the second item never reached Jev
    expect(calls).toHaveLength(2)

    const again = await decider.decide('punch_item', punch('a'))
    expect(again).toMatchObject({ choice: 'cosmetic', source: 'cache', key: first.key, model: 'claude-haiku-4-5-20251001' })
    expect(calls).toHaveLength(2)
  })

  it('Jev answers first when it is up: Haiku is not asked', async () => {
    const scripted = scriptedFetch(() => punchAnswer('measurement', 1.2))
    const { llm, calls } = haikuWith(() => ({ class: 'cosmetic', severity: 0, needs_human: 0.2 }))
    const decision = await createDecider({ jev: createJevProvider({ env: ENV, fetch: scripted.fetch }), llm }).decide('punch_item', punch('a'))
    expect(decision.source).toBe('jev')
    expect(calls).toHaveLength(0)
  })

  it('when both fail, falls back to the rule, unreviewed, with the last tried provider\'s reason', async () => {
    const down = jevDown()
    const hang = ((_url: string, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    })) as typeof fetch
    const llm = createAnthropicProvider({ env: AENV, fetch: hang, timeoutMs: 10 })
    const decision = await createDecider({ jev: down.jev, llm }).decide('punch_item', punch('gövde yuvası yok'))
    expect(decision).toMatchObject({ choice: 'source_limit', source: 'rule', unreviewed: true, fallback: 'timeout' })

    const broken = createAnthropicProvider({ env: AENV, fetch: (async () => new Response('x', { status: 500 })) as typeof fetch })
    expect(await createDecider({ jev: down.jev, llm: broken }).decide('punch_item', punch('r'))).toMatchObject({ unreviewed: true, fallback: 'error' })
  })

  it('each provider has its own breaker: Haiku keeps answering while Jev\'s is open, and stops once its own opens', async () => {
    const down = jevDown()
    let haiku = 0
    const llm = createAnthropicProvider({ env: AENV, fetch: (async () => {
      haiku++
      return new Response('overloaded', { status: 529 })
    }) as typeof fetch })
    const decider = createDecider({ jev: down.jev, llm, breakers: { jev: new CircuitBreaker({ failures: 1 }), llm: new CircuitBreaker({ failures: 2 }) } })
    const reasons = []
    for (let i = 0; i < 4; i++) reasons.push((await decider.decide('punch_item', punch(`r${i}`))).fallback)
    expect([down.requests(), haiku]).toEqual([1, 2])
    expect(reasons).toEqual(['error', 'error', 'circuit_open', 'circuit_open'])
  })

  it('draws on the same daily cap as Jev', async () => {
    const down = jevDown()
    const { llm, calls } = haikuWith(() => ({ class: 'cosmetic', severity: 0, needs_human: 0.2 }))
    const budget = new MemoryDailyBudget(3)
    const now = new Date('2026-09-19T12:00:00Z')
    const decider = createDecider({ jev: down.jev, llm, budget, now: () => now, breakers: { jev: new CircuitBreaker({ failures: 1 }) } })
    // Jev's failed request spends 2; Haiku gets the 1 left.
    const decisions = await decider.decideMany('punch_item', [punch('a'), punch('b')])
    expect(decisions.map(d => d.source)).toEqual(['llm', 'rule'])
    expect(decisions[1]).toMatchObject({ unreviewed: true, fallback: 'budget' })
    expect(budget.used('default', now)).toBe(3)
    expect(calls).toHaveLength(1)
  })

  it('a Haiku pick for a kind with a confidence floor goes to a human, kept as proposed', async () => {
    const { llm } = haikuWith(() => ({ eligibility: 'custom_type' }))
    const decision = await createDecider({ jev: false, llm }).decide('eligibility_band', site(20, [['product', 30]]))
    expect(decision).toMatchObject({ choice: 'needs_human', proposed: 'custom_type', confidence: 0, source: 'llm' })
  })

  it('prices each provider on its own', async () => {
    const { llm } = haikuWith(() => ({ class: 'cosmetic', severity: 0, needs_human: 0.2 }))
    const decider = createDecider({ jev: false, llm, pricing: { llm: { inputPerMTok: 1, outputPerMTok: 5 } } })
    expect((await decider.decide('punch_item', punch('a'))).cost).toEqual({ input_tokens: 200, output_tokens: 40, usd: 0.0004 })
  })
})
