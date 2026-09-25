// Money and time for a writer run. The worker owns the order's budget; the
// writer charges it on every model turn, so a run stops within one turn of
// the cap rather than after a job has spent past it.

/** The worker's run budget (migrate `@migrate/engine-v3` `RunBudget`), declared structurally. */
export interface RunBudget {
  startedAt: number
  targetMs: number
  capMs: number
  remainingMs(): number
  aiUsdCap: number
  remainingUsd(): number
  canSpend(estUsd?: number): boolean
  /** Throws once the budget is spent (`error.name === 'AiBudgetExceeded'`). */
  charge(entry: { stage: 'writer' | 'repair' | 'plan', model: string, tokensIn: number, tokensOut: number, usd: number }): void
}

export interface Usage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

/** Dollars per million tokens: input, output, cache read, cache write (5-minute). */
export const PRICES: Record<string, { input: number, output: number, cacheRead: number, cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
}

function priceOf(model: string) {
  const key = Object.keys(PRICES).find(name => model === name || model.startsWith(`${name}-`) || model.startsWith(`${name}[`))
  // An unknown model is priced as the most expensive one: overcharging stops early, undercharging overspends.
  return PRICES[key ?? 'claude-opus-5-5']!
}

/** Cost of one turn's usage. */
export function usdOf(model: string, usage: Usage): number {
  const p = priceOf(model)
  const usd = ((usage.input_tokens ?? 0) * p.input
    + (usage.output_tokens ?? 0) * p.output
    + (usage.cache_read_input_tokens ?? 0) * p.cacheRead
    + (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

/** Tokens in for the receipt: fresh input plus cache reads and writes (the receipt has one input column). */
export function tokensIn(usage: Usage): number {
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
}

export const isBudgetExceeded = (error: unknown): boolean => error instanceof Error && error.name === 'AiBudgetExceeded'

/** A budget for standalone runs (the CLI, the acceptance run): a dollar cap and a time cap. */
export function localBudget(aiUsdCap: number, capMs: number, targetMs = capMs): RunBudget & { spent: () => number } {
  const startedAt = Date.now()
  let spent = 0
  return {
    startedAt,
    targetMs,
    capMs,
    aiUsdCap,
    remainingMs: () => capMs - (Date.now() - startedAt),
    remainingUsd: () => aiUsdCap - spent,
    canSpend: (estUsd = 0) => spent + estUsd <= aiUsdCap,
    charge: (entry) => {
      spent += entry.usd
      if (spent > aiUsdCap) {
        const error = new Error(`AI budget of $${aiUsdCap} spent ($${spent.toFixed(4)})`)
        error.name = 'AiBudgetExceeded'
        throw error
      }
    },
    spent: () => spent,
  }
}
