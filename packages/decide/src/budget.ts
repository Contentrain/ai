// ─── Budget cap and circuit breaker ───
//
// Neither ever fails a decision. Over the cap, or with the breaker open, the
// decider answers from the rule and marks the decision `unreviewed`.

/** How many provider decisions a tenant may spend. */
export interface DecisionBudget {
  /** Reserve up to `count` decisions for `tenant` at `now`; returns how many were granted. */
  take: (tenant: string, count: number, now: Date) => Promise<number>
}

/** A per-tenant cap on provider decisions per UTC day, held in memory. */
export class MemoryDailyBudget implements DecisionBudget {
  private readonly spent = new Map<string, number>()

  constructor(readonly perDay: number) {
    if (!Number.isInteger(perDay) || perDay < 0) throw new RangeError(`perDay must be a non-negative integer, got ${perDay}`)
  }

  async take(tenant: string, count: number, now: Date): Promise<number> {
    const slot = `${tenant}\n${now.toISOString().slice(0, 10)}`
    const used = this.spent.get(slot) ?? 0
    const granted = Math.max(0, Math.min(count, this.perDay - used))
    this.spent.set(slot, used + granted)
    return granted
  }

  used(tenant: string, now: Date): number {
    return this.spent.get(`${tenant}\n${now.toISOString().slice(0, 10)}`) ?? 0
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failed requests that open the circuit. Default 3. */
  failures?: number
  /** How long it stays open before one request is let through. Default 60s. */
  cooldownMs?: number
  now?: () => number
}

/**
 * Closed → open after `failures` consecutive failed requests; open → half-open
 * after `cooldownMs`, where the next request decides: success closes it, a
 * failure opens it for another cooldown.
 */
export class CircuitBreaker {
  private consecutive = 0
  private openedAt: number | undefined
  private readonly limit: number
  private readonly cooldownMs: number
  private readonly now: () => number

  constructor(options: CircuitBreakerOptions = {}) {
    this.limit = options.failures ?? 3
    this.cooldownMs = options.cooldownMs ?? 60_000
    this.now = options.now ?? Date.now
  }

  get state(): 'closed' | 'open' | 'half_open' {
    if (this.openedAt === undefined) return 'closed'
    return this.now() - this.openedAt >= this.cooldownMs ? 'half_open' : 'open'
  }

  /** Whether a request may go out now. */
  allows(): boolean {
    return this.state !== 'open'
  }

  success(): void {
    this.consecutive = 0
    this.openedAt = undefined
  }

  failure(): void {
    this.consecutive++
    if (this.openedAt !== undefined || this.consecutive >= this.limit) this.openedAt = this.now()
  }
}
