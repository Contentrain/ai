// Runs writer jobs with the Claude Agent SDK, headless.
//
// Each job is its own query(): its own turn and dollar ceiling, its own
// transcript, all sharing one system prompt (one cache prefix). Jobs run in
// parallel up to a concurrency limit, and no job starts once the run's
// budget is spent. Built-in tools are off; the agent's only tools are the
// writer server's, and canUseTool refuses anything else by name.

import { query as sdkQuery, type CanUseTool, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { isBudgetExceeded, tokensIn, usdOf, type RunBudget } from '../budget.js'
import { agentEnv } from '../env.js'
import { SYSTEM_PROMPT } from './prompt.js'
import { qualifiedToolNames, SERVER_NAME, writerServer, type ToolContext } from './tools.js'

/** Models per role. The plan's architecture and first drafts use the strongest; repair rounds try a cheaper one. */
export const DEFAULT_MODELS = { write: 'claude-opus-5-5', repair: 'claude-sonnet-5' } as const

export interface WriterJob {
  id: string
  /** What to do, for the user prompt: the brief, the template, the regions. */
  prompt: string
  /** `write` for first drafts, `repair` for fix rounds. */
  role: 'write' | 'repair'
}

export interface RunOptions {
  jobs: WriterJob[]
  context: ToolContext
  /** The Anthropic key, passed to the SDK's child only; the writer never reads it from the environment. */
  apiKey: string
  /** Charged on every model turn; a charge that throws stops the run. */
  budget?: RunBudget
  /** Aborts every running job (the worker's time cap). */
  signal?: AbortSignal
  models?: { write: string, repair: string }
  /** Dollar ceiling for the whole run; each job gets what is left, capped at perJobUsd. */
  budgetUsd: number
  perJobUsd?: number
  maxTurns?: number
  concurrency?: number
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** Injected in tests; the SDK's query() otherwise. */
  query?: typeof sdkQuery
  /** Progress lines (job start/end), e.g. for the worker's SSE. */
  log?: (line: string) => void
}

export interface JobReport {
  id: string
  model: string
  outcome: 'success' | 'error_max_turns' | 'error_max_budget_usd' | 'error_during_execution' | 'error_max_structured_output_retries' | 'skipped_budget' | 'stopped_budget' | 'stopped_time'
  turns: number
  durationMs: number
  costUsd: number
  /** Per model: input, output, cache read, cache write tokens and cost — from the SDK's modelUsage. */
  usage: Record<string, { input: number, output: number, cacheRead: number, cacheWrite: number, costUsd: number }>
  /** Tool calls the permission gate refused (should always be empty: only writer tools exist). */
  denied: string[]
  result?: string
}

export interface RunReport {
  /** Set when the run ended early: the budget's charge refused a turn, or the signal fired. */
  stopped?: 'budget' | 'time'
  jobs: JobReport[]
  costUsd: number
  durationMs: number
  written: string[]
  tokens: { input: number, output: number, cacheRead: number, cacheWrite: number }
}

/** The permission gate: writer tools pass, everything else is refused by name. */
export function writerPermissions(allowed: readonly string[], denied: string[]): CanUseTool {
  const names = new Set(allowed)
  return async (toolName) => {
    if (names.has(toolName)) return { behavior: 'allow' }
    denied.push(toolName)
    return { behavior: 'deny', message: `${toolName} is not available to the writer. Use the writer tools (${[...names].join(', ')}).` }
  }
}

export function jobOptions(options: RunOptions, job: WriterJob, budgetUsd: number, denied: string[], abort?: AbortController): Options {
  const models = options.models ?? DEFAULT_MODELS
  const allowed = qualifiedToolNames()
  return {
    model: job.role === 'write' ? models.write : models.repair,
    cwd: options.context.root,
    systemPrompt: { type: 'custom', prompt: SYSTEM_PROMPT, snapshot: true },
    // No built-in tools, no user/project settings or CLAUDE.md, no saved session.
    tools: [],
    settingSources: [],
    persistSession: false,
    mcpServers: { [SERVER_NAME]: writerServer(options.context) },
    allowedTools: allowed,
    canUseTool: writerPermissions(allowed, denied),
    maxTurns: options.maxTurns ?? 60,
    maxBudgetUsd: budgetUsd,
    effort: options.effort ?? 'high',
    // An explicit environment: the key and the basics, nothing else of the worker's.
    env: agentEnv(options.apiKey),
    ...(abort ? { abortController: abort } : {}),
  }
}

async function runJob(options: RunOptions, job: WriterJob, budgetUsd: number): Promise<JobReport> {
  const denied: string[] = []
  const abort = new AbortController()
  const onAbort = () => abort.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const opts = jobOptions(options, job, budgetUsd, denied, abort)
  const started = Date.now()
  const report: JobReport = { id: job.id, model: opts.model!, outcome: 'error_during_execution', turns: 0, durationMs: 0, costUsd: 0, usage: {}, denied }
  const query = options.query ?? sdkQuery
  const stage = job.role === 'write' ? 'writer' : 'repair'
  // A streamed message arrives block by block with its usage so far: charge each message's growth.
  const charged = new Map<string, number>()
  let chargedTotal = 0
  const charge = (model: string, amount: number, tokens: { in: number, out: number }) => {
    const usd = Math.round(amount * 1_000_000) / 1_000_000
    if (usd <= 0) return
    chargedTotal += usd
    options.budget?.charge({ stage, model, tokensIn: tokens.in, tokensOut: tokens.out, usd })
  }
  try {
    for await (const message of query({ prompt: job.prompt, options: opts }) as AsyncIterable<SDKMessage>) {
      if (message.type === 'assistant') {
        const { id, model, usage } = message.message
        const usd = usdOf(model, usage)
        const before = charged.get(id) ?? 0
        charged.set(id, Math.max(before, usd))
        charge(model, usd - before, { in: before === 0 ? tokensIn(usage) : 0, out: before === 0 ? usage.output_tokens ?? 0 : 0 })
        continue
      }
      if (message.type !== 'result') continue
      report.outcome = message.subtype
      report.turns = message.num_turns
      report.costUsd = message.total_cost_usd
      report.usage = Object.fromEntries(Object.entries(message.modelUsage).map(([model, u]) => [model, {
        input: u.inputTokens, output: u.outputTokens, cacheRead: u.cacheReadInputTokens, cacheWrite: u.cacheCreationInputTokens, costUsd: u.costUSD,
      }]))
      if (message.subtype === 'success') report.result = message.result
      // The SDK's total is authoritative; charge what the per-turn estimate missed.
      charge(opts.model!, message.total_cost_usd - chargedTotal, { in: 0, out: 0 })
    }
  } catch (error) {
    if (isBudgetExceeded(error)) {
      report.outcome = 'stopped_budget'
      abort.abort()
    } else if (abort.signal.aborted) {
      report.outcome = options.signal?.aborted ? 'stopped_time' : 'stopped_budget'
    } else {
      throw error
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }
  if (report.costUsd === 0) report.costUsd = Math.round(chargedTotal * 1_000_000) / 1_000_000
  report.durationMs = Date.now() - started
  return report
}

export async function runWriter(options: RunOptions): Promise<RunReport> {
  const started = Date.now()
  const log = options.log ?? (() => {})
  const perJob = options.perJobUsd ?? options.budgetUsd
  const queue = [...options.jobs]
  const reports: JobReport[] = []
  let spent = 0
  let stopped: RunReport['stopped']

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const left = Math.min(options.budgetUsd - spent, options.budget?.remainingUsd() ?? Number.POSITIVE_INFINITY)
      if (stopped || options.signal?.aborted) {
        reports.push({ id: job.id, model: '', outcome: options.signal?.aborted ? 'stopped_time' : 'stopped_budget', turns: 0, durationMs: 0, costUsd: 0, usage: {}, denied: [] })
        continue
      }
      if (left <= 0.01) {
        reports.push({ id: job.id, model: '', outcome: 'skipped_budget', turns: 0, durationMs: 0, costUsd: 0, usage: {}, denied: [] })
        log(`job ${job.id}: skipped, run budget spent`)
        continue
      }
      log(`job ${job.id}: start (${job.role})`)
      const report = await runJob(options, job, Math.min(perJob, left))
      spent += report.costUsd
      reports.push(report)
      if (report.outcome === 'stopped_budget') stopped = 'budget'
      if (report.outcome === 'stopped_time') stopped = 'time'
      log(`job ${job.id}: ${report.outcome}, ${report.turns} turns, $${report.costUsd.toFixed(2)}`)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker))

  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  for (const r of reports) for (const u of Object.values(r.usage)) {
    tokens.input += u.input
    tokens.output += u.output
    tokens.cacheRead += u.cacheRead
    tokens.cacheWrite += u.cacheWrite
  }
  const order = new Map(options.jobs.map((job, index) => [job.id, index]))
  return {
    ...(stopped ? { stopped } : {}),
    jobs: reports.toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    costUsd: Math.round(spent * 10000) / 10000,
    durationMs: Date.now() - started,
    written: [...options.context.written].toSorted(),
    tokens,
  }
}
