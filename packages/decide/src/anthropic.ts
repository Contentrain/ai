// ─── Anthropic provider (Claude Haiku, the LLM link of the chain) ───
//
// Asked when Jev does not answer: Jev off, its circuit open, a timeout, an
// error. The same rules hold here as in jev.ts:
//   - The API key comes from the environment, read at the moment of each
//     request and passed straight into the header. It is never stored on an
//     object, returned, logged or put in an error message.
//   - Requests go to one fixed endpoint. There is no base-URL option.
//   - The request carries only what the kind's shaper and renderer produced:
//     the state and questions Jev gets, as a prompt, answered through one
//     forced tool call so the answer is structured, not parsed from prose.
//
// A model reports no confidence of its own. Its answers carry confidence 0,
// meaning "not measured": a kind with a confidence floor (eligibility_band)
// keeps the model's pick as `proposed` and asks a human.

import { createHash } from 'node:crypto'
import { canonicalStringify } from '@contentrain/types'
import { buildJevRequest } from './jev.js'
import type { DecisionProvider, JevAnswer, JevQuestion, KindSpec, Outcome, ProviderAnswer } from './types.js'

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_KEY_ENV = 'ANTHROPIC_API_KEY'
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 4096
const TOOL_NAME = 'record_answers'

export interface AnthropicProviderOptions {
  /** Where the key is read from. Default `process.env`. */
  env?: Readonly<Record<string, string | undefined>>
  /** Injected for tests. The URL it is called with is always `ANTHROPIC_ENDPOINT`. */
  fetch?: typeof globalThis.fetch
  /** Per request. Default 60s. */
  timeoutMs?: number
  /** Default `claude-haiku-4-5-20251001`, asked at temperature 0. */
  model?: string
}

export class AnthropicError extends Error {
  constructor(message: string, readonly status: number | undefined, readonly timeout = false) {
    super(message)
    this.name = 'AnthropicError'
  }
}

type Questions = Record<string, JevQuestion>

const itemN = (text: string) => text.replace(/\bitem1\b/g, 'itemN')

/** The prompt for a kind without its own `llmPrompt`: the state, then every question with its options or rubric. */
export function genericLlmPrompt({ state, questions, count }: { state: string, questions: Questions, count: number }): string {
  const lines = ['<state>', state, '</state>', '', 'Answer these questions for every item (itemN stands for the item\'s number):']
  Object.entries(questions).forEach(([suffix, question], n) => {
    if (question.type === 'choice') {
      lines.push(`${n + 1}) ${suffix} — ${itemN(question.instructions)} Options:`)
      for (const [choice, meaning] of Object.entries(question.criteria)) lines.push(`   - ${choice}: ${meaning}`)
    }
    else if (question.type === 'score') {
      lines.push(`${n + 1}) ${suffix} — ${itemN(question.instructions)} An integer from 0 to ${question.criteria.length - 1}:`)
      question.criteria.forEach((meaning, level) => lines.push(`   ${level}: ${meaning}`))
    }
    else {
      lines.push(`${n + 1}) ${suffix} — the probability (0–1) that this statement is true: ${itemN(question.instructions)}`)
    }
  })
  lines.push('', `Give all ${count} items through the ${TOOL_NAME} tool, one record per item.`)
  return lines.join('\n')
}

/** The forced tool the model answers through: one record per item, one field per question. */
function answerTool(questions: Questions) {
  const properties: Record<string, unknown> = { item: { type: 'integer' } }
  for (const [suffix, question] of Object.entries(questions)) {
    properties[suffix] = question.type === 'choice'
      ? { type: 'string', enum: Object.keys(question.criteria) }
      : question.type === 'score'
        ? { type: 'integer', minimum: 0, maximum: question.criteria.length - 1 }
        : { type: 'number', minimum: 0, maximum: 1 }
  }
  return {
    name: TOOL_NAME,
    description: 'Record the answers for every item.',
    input_schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object', properties, required: Object.keys(properties) } },
      },
      required: ['items'],
    },
  }
}

/** The Messages API body one batch sends. */
export function buildAnthropicRequest(spec: KindSpec<any, any>, shaped: readonly unknown[], model = DEFAULT_ANTHROPIC_MODEL) {
  const jev = spec.jev
  if (!jev) throw new TypeError(`kind ${spec.kind} has no prompt`)
  const { state } = buildJevRequest(spec, shaped)
  const questions = jev.questions('item1')
  const prompt = (jev.llmPrompt ?? genericLlmPrompt)({ state, questions, count: shaped.length })
  return {
    model,
    max_tokens: MAX_TOKENS,
    temperature: 0,
    tools: [answerTool(questions)],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: prompt }],
  }
}

/** Hash of the LLM request shape (model, prompt, tool), recorded by a calibration of this provider. */
export function anthropicRequestShapeHash(spec: KindSpec<any, any>, model = DEFAULT_ANTHROPIC_MODEL): string {
  if (!spec.jev) return 'none'
  const request = buildAnthropicRequest(spec, [spec.jev.probe, spec.jev.probe], model)
  return createHash('sha256').update(canonicalStringify(request)).digest('hex').slice(0, 16)
}

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): DecisionProvider {
  const env = options.env ?? process.env
  const doFetch = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 60_000
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL

  return {
    name: 'llm',
    model,
    available: () => Boolean(env[ANTHROPIC_KEY_ENV]?.trim()),
    async ask(spec, shaped) {
      const key = env[ANTHROPIC_KEY_ENV]?.trim()
      if (!key) throw new AnthropicError(`${ANTHROPIC_KEY_ENV} is not set`, undefined)
      const request = buildAnthropicRequest(spec, shaped, model)
      let response: Response
      try {
        response = await doFetch(ANTHROPIC_ENDPOINT, {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(timeoutMs),
        })
      }
      catch (error) {
        const name = (error as { name?: string }).name
        if (name === 'TimeoutError' || name === 'AbortError') throw new AnthropicError(`Anthropic did not answer within ${timeoutMs}ms`, undefined, true)
        throw new AnthropicError(`Anthropic request failed: ${redact(String((error as Error).message ?? error), key)}`, undefined)
      }
      const text = await response.text()
      if (!response.ok) throw new AnthropicError(`Anthropic answered HTTP ${response.status}: ${redact(text.slice(0, 200), key)}`, response.status)
      let body: unknown
      try {
        body = JSON.parse(text)
      }
      catch {
        throw new AnthropicError('Anthropic answered with a body that is not JSON', response.status)
      }
      return readAnthropicResponse(spec, shaped.length, body)
    },
  }
}

/** Per-item outcomes from a Messages API response. An item whose record is missing or malformed gets `undefined`. */
export function readAnthropicResponse(spec: KindSpec<any, any>, count: number, body: unknown): ProviderAnswer {
  const jev = spec.jev!
  const questions = jev.questions('item1')
  const root = (body && typeof body === 'object' ? body : {}) as { content?: unknown, usage?: unknown, model?: unknown }
  const content = Array.isArray(root.content) ? root.content as Array<Record<string, unknown>> : []
  const call = content.find(block => block?.type === 'tool_use' && block.name === TOOL_NAME)
  const input = (call?.input && typeof call.input === 'object' ? call.input : {}) as { items?: unknown }
  const records = Array.isArray(input.items) ? input.items as Array<Record<string, unknown>> : []

  const outcomes: Array<Outcome | undefined> = []
  for (let i = 1; i <= count; i++) {
    const record = records.find(r => r && typeof r === 'object' && r.item === i)
    const own: Record<string, JevAnswer> = {}
    let complete = Boolean(record)
    for (const [suffix, question] of Object.entries(questions)) {
      const answer = record ? readField(question, record[suffix]) : undefined
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

function readField(question: JevQuestion, value: unknown): JevAnswer | undefined {
  if (question.type === 'choice')
    return typeof value === 'string' && Object.hasOwn(question.criteria, value) ? { type: 'choice', choice: value, confidence: 0 } : undefined
  if (question.type === 'score')
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) < question.criteria.length ? { type: 'score', score: value as number, confidence: 0 } : undefined
  return typeof value === 'number' && value >= 0 && value <= 1 ? { type: 'noul', noul: value } : undefined
}

function redact(text: string, key: string): string {
  return text.split(key).join('[redacted]')
}
