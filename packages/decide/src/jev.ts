// ─── Jev provider (typesafe.ai systemone) ───
//
// The only network code in the package. Three rules hold here and nowhere
// else needs to think about them:
//   - The bearer token comes from the environment, read at the moment of each
//     request and passed straight into the header. It is never stored on an
//     object, returned, logged or put in an error message.
//   - Requests go to one fixed endpoint. There is no base-URL option.
//   - The request carries only what the kind's shaper and renderer produced.

import type { DecisionProvider, JevAnswer, KindSpec, Outcome, ProviderAnswer } from './types.js'

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const JEV_TOKEN_ENV = 'CONTENTRAIN_JEW_API_TOKEN'

export interface JevProviderOptions {
  /** Where the token is read from. Default `process.env`. */
  env?: Readonly<Record<string, string | undefined>>
  /** Injected for tests and recorded replays. The URL it is called with is always `JEV_ENDPOINT`. */
  fetch?: typeof globalThis.fetch
  /** Per request. Default 15s. */
  timeoutMs?: number
  /** Default `jev-latest`. */
  model?: string
}

export class JevError extends Error {
  constructor(message: string, readonly status: number | undefined, readonly timeout = false) {
    super(message)
    this.name = 'JevError'
  }
}

/** The prompt one batch sends: every item's line under the kind's preamble, every item's questions prefixed `itemN_`. */
export function buildJevRequest(spec: KindSpec<any, any>, shaped: readonly unknown[]): { state: string, questions: Record<string, unknown> } {
  const jev = spec.jev
  if (!jev) throw new TypeError(`kind ${spec.kind} has no Jev prompt`)
  const lines = shaped.map((item, i) => `Item ${i + 1}: ${jev.render(item)}`)
  const questions: Record<string, unknown> = {}
  shaped.forEach((_, i) => {
    for (const [suffix, question] of Object.entries(jev.questions))
      questions[`item${i + 1}_${suffix}`] = { ...question, instructions: `Item ${i + 1} — ${question.instructions}` }
  })
  return { state: `${jev.preamble}\n${lines.join('\n')}`, questions }
}

export function createJevProvider(options: JevProviderOptions = {}): DecisionProvider {
  const env = options.env ?? process.env
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  const model = options.model ?? 'jev-latest'

  return {
    name: 'jev',
    available: () => Boolean(env[JEV_TOKEN_ENV]?.trim()),
    async ask(spec, shaped) {
      const token = env[JEV_TOKEN_ENV]?.trim()
      if (!token) throw new JevError(`${JEV_TOKEN_ENV} is not set`, undefined)
      const { state, questions } = buildJevRequest(spec, shaped)
      let response: Response
      try {
        response = await doFetch(JEV_ENDPOINT, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, model, questions }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      }
      catch (error) {
        const name = (error as { name?: string }).name
        if (name === 'TimeoutError' || name === 'AbortError') throw new JevError(`Jev did not answer within ${timeoutMs}ms`, undefined, true)
        throw new JevError(`Jev request failed: ${redact(String((error as Error).message ?? error), token)}`, undefined)
      }
      const text = await response.text()
      if (!response.ok) throw new JevError(`Jev answered HTTP ${response.status}: ${redact(text.slice(0, 200), token)}`, response.status)
      let body: unknown
      try {
        body = JSON.parse(text)
      }
      catch {
        throw new JevError('Jev answered with a body that is not JSON', response.status)
      }
      return readJevResponse(spec, shaped.length, body)
    },
  }
}

/** Per-item outcomes from a systemone response. An item whose answers are missing or malformed gets `undefined`. */
export function readJevResponse(spec: KindSpec<any, any>, count: number, body: unknown): ProviderAnswer {
  const jev = spec.jev!
  const root = (body && typeof body === 'object' ? body : {}) as { answers?: unknown, usage?: unknown, model?: unknown }
  const answers = (root.answers && typeof root.answers === 'object' ? root.answers : {}) as Record<string, unknown>
  const outcomes: Array<Outcome | undefined> = []
  for (let i = 1; i <= count; i++) {
    const own: Record<string, JevAnswer> = {}
    let complete = true
    for (const suffix of Object.keys(jev.questions)) {
      const answer = readAnswer(answers[`item${i}_${suffix}`])
      if (!answer) complete = false
      else own[suffix] = answer
    }
    outcomes.push(complete ? jev.read(own) : undefined)
  }
  const usage = root.usage as { input_tokens?: unknown, output_tokens?: unknown } | undefined
  return {
    outcomes,
    ...(usage && typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number'
      ? { usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } }
      : {}),
    ...(typeof root.model === 'string' ? { model: root.model } : {}),
  }
}

const isUnit = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1

function readAnswer(value: unknown): JevAnswer | undefined {
  if (!value || typeof value !== 'object') return undefined
  const answer = value as Record<string, unknown>
  const probabilities = answer.probabilities && typeof answer.probabilities === 'object'
    ? { probabilities: answer.probabilities as Record<string, number> }
    : {}
  if (answer.type === 'choice' && typeof answer.choice === 'string' && isUnit(answer.confidence))
    return { type: 'choice', choice: answer.choice, confidence: answer.confidence, ...probabilities }
  if (answer.type === 'score' && typeof answer.score === 'number' && Number.isFinite(answer.score) && isUnit(answer.confidence))
    return { type: 'score', score: answer.score, confidence: answer.confidence, ...probabilities }
  if (answer.type === 'noul' && isUnit(answer.noul)) return { type: 'noul', noul: answer.noul }
  return undefined
}

function redact(text: string, token: string): string {
  return text.split(token).join('[redacted]')
}
