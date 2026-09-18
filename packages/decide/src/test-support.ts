// Test helpers: a scripted Jev endpoint and small inputs. Not exported.
import type { JevAnswer } from './types.js'

export interface ScriptedCall {
  url: string
  headers: Record<string, string>
  body: { state: string, model: string, questions: Record<string, { type: string, instructions: string, criteria?: unknown }> }
}

/** A fetch that answers every item from `answer(line)`, recording each call. */
export function scriptedFetch(answer: (line: string, n: number) => Record<string, JevAnswer> | undefined, usage = { input_tokens: 100, output_tokens: 10 }) {
  const calls: ScriptedCall[] = []
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as ScriptedCall['body']
    calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body })
    const answers: Record<string, JevAnswer> = {}
    for (const line of body.state.split('\n')) {
      const match = /^Item (\d+): (.*)$/.exec(line)
      if (!match) continue
      for (const [suffix, value] of Object.entries(answer(match[2]!, Number(match[1])) ?? {})) answers[`item${match[1]}_${suffix}`] = value
    }
    return new Response(JSON.stringify({ model: 'jev-test', answers, usage }), { status: 200 })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

export const punchAnswer = (choice: string, score: number, confidence = 0.8): Record<string, JevAnswer> => ({
  class: { type: 'choice', choice, confidence },
  severity: { type: 'score', score, confidence },
  needs_human: { type: 'noul', noul: 0.5 },
})

export const eligibilityAnswer = (choice: string, confidence: number): Record<string, JevAnswer> => ({
  eligibility: { type: 'choice', choice, confidence },
})

export const TOKEN = 'test-token-not-a-real-secret'
export const ENV = { CONTENTRAIN_JEW_API_TOKEN: TOKEN }

export function site(posts: number, custom: Array<[string, number]> = [], pages = 3, samples = Math.min(posts, 5)) {
  return {
    access: 'open' as const,
    rest: {
      reachable: true,
      counts: { posts, pages },
      postTypes: [{ slug: 'post', count: posts }, { slug: 'page', count: pages }, ...custom.map(([slug, count]) => ({ slug, count }))],
      samples: { posts: Array.from({ length: samples }, (_, i) => ({ title: `Private title ${i}` })), pages: Array.from({ length: Math.min(pages, 5) }, () => ({})) },
    },
  }
}
