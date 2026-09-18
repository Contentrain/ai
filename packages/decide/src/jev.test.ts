import { describe, expect, it } from 'vitest'
import { JEV_ENDPOINT, JEV_TOKEN_ENV, JevError, buildJevRequest, createJevProvider, readJevResponse } from './jev.js'
import { punchItem } from './kinds/punch-item.js'
import { ENV, TOKEN, punchAnswer, scriptedFetch } from './test-support.js'

const item = { label: '(aile: post)', reason: 'en kötü sayfa 56.4 < 80 (5 sayfa ölçüldü)', link: 'https://example.org/2026/a-post/' }

describe('Jev provider', () => {
  it('reads the token from the environment only, and is unavailable without one', () => {
    expect(JEV_TOKEN_ENV).toBe('CONTENTRAIN_JEW_API_TOKEN')
    expect(createJevProvider({ env: {} }).available()).toBe(false)
    expect(createJevProvider({ env: { [JEV_TOKEN_ENV]: '  ' } }).available()).toBe(false)
    expect(createJevProvider({ env: ENV }).available()).toBe(true)
  })

  it('posts to the fixed endpoint with the bearer token and the shaped prompt', async () => {
    const { fetch, calls } = scriptedFetch(() => punchAnswer('measurement', 1.4))
    const provider = createJevProvider({ env: ENV, fetch })
    const answer = await provider.ask(punchItem, [punchItem.shape(item)])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(JEV_ENDPOINT)
    expect(JEV_ENDPOINT).toBe('https://api.typesafe.ai/v1/systemone')
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0]!.body.model).toBe('jev-latest')
    expect(Object.keys(calls[0]!.body.questions)).toEqual(['item1_class', 'item1_severity'])
    expect(calls[0]!.body.state).not.toContain('example.org')
    expect(answer).toEqual({ outcomes: [{ choice: 'measurement', score: 1.4, confidence: 0.8 }], usage: { input_tokens: 100, output_tokens: 10 }, model: 'jev-test' })
  })

  it('never puts the token in the provider object or an error', async () => {
    const provider = createJevProvider({ env: ENV, fetch: (async () => new Response(`bad key ${TOKEN}`, { status: 401 })) as typeof fetch })
    expect(JSON.stringify(provider)).not.toContain(TOKEN)
    const error = await provider.ask(punchItem, [punchItem.shape(item)]).catch((e: unknown) => e) as JevError
    expect(error).toBeInstanceOf(JevError)
    expect(error.status).toBe(401)
    expect(error.message).toContain('HTTP 401')
    expect(error.message).not.toContain(TOKEN)
    expect(error.message).toContain('[redacted]')
  })

  it('throws a timeout error when the endpoint does not answer in time', async () => {
    const hang = ((_url: string, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    })) as typeof fetch
    const error = await createJevProvider({ env: ENV, fetch: hang, timeoutMs: 20 }).ask(punchItem, [punchItem.shape(item)]).catch((e: unknown) => e) as JevError
    expect(error.timeout).toBe(true)
  })

  it('fails without a token instead of sending an unauthenticated request', async () => {
    const { fetch, calls } = scriptedFetch(() => undefined)
    await expect(createJevProvider({ env: {}, fetch }).ask(punchItem, [{}])).rejects.toThrow('CONTENTRAIN_JEW_API_TOKEN is not set')
    expect(calls).toHaveLength(0)
  })

  it('rejects a body that is not JSON', async () => {
    const provider = createJevProvider({ env: ENV, fetch: (async () => new Response('<html>', { status: 200 })) as typeof fetch })
    await expect(provider.ask(punchItem, [punchItem.shape(item)])).rejects.toThrow('not JSON')
  })
})

describe('buildJevRequest / readJevResponse', () => {
  it('numbers items and prefixes every question with its item', () => {
    const { state, questions } = buildJevRequest(punchItem, [punchItem.shape(item), punchItem.shape({ label: 'b', reason: 'r' })])
    expect(state.split('\n').slice(1).map(line => line.slice(0, 8))).toEqual(['Item 1: ', 'Item 2: '])
    expect(Object.keys(questions)).toEqual(['item1_class', 'item1_severity', 'item2_class', 'item2_severity'])
    expect((questions.item2_class as { instructions: string }).instructions).toMatch(/^Item 2 — /)
  })

  it('leaves an item undefined when any of its answers is missing or malformed', () => {
    const body = {
      answers: {
        item1_class: { type: 'choice', choice: 'cosmetic', confidence: 0.9 },
        item1_severity: { type: 'score', score: 0.2, confidence: 0.7 },
        item2_class: { type: 'choice', choice: 'cosmetic', confidence: 1.7 },
        item2_severity: { type: 'score', score: 1, confidence: 0.5 },
        item3_class: { type: 'choice', choice: 'cosmetic', confidence: 0.5 },
      },
    }
    const { outcomes, usage, model } = readJevResponse(punchItem, 3, body)
    expect(outcomes).toEqual([{ choice: 'cosmetic', score: 0.2, confidence: 0.7 }, undefined, undefined])
    expect(usage).toBeUndefined()
    expect(model).toBeUndefined()
    expect(readJevResponse(punchItem, 1, null).outcomes).toEqual([undefined])
  })
})
