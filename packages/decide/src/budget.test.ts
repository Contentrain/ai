import { describe, expect, it } from 'vitest'
import { CircuitBreaker, MemoryDailyBudget } from './budget.js'
import { DEFAULT_BATCH, estimateTokens, planBatches } from './batch.js'

describe('MemoryDailyBudget', () => {
  const day1 = new Date('2026-09-18T23:59:00Z')
  const day2 = new Date('2026-09-19T00:01:00Z')

  it('grants up to the cap per tenant per UTC day', async () => {
    const budget = new MemoryDailyBudget(10)
    expect(await budget.take('a', 7, day1)).toBe(7)
    expect(await budget.take('a', 7, day1)).toBe(3)
    expect(await budget.take('a', 1, day1)).toBe(0)
    expect(await budget.take('b', 4, day1)).toBe(4)
    expect(await budget.take('a', 4, day2)).toBe(4)
    expect(budget.used('a', day1)).toBe(10)
  })

  it('rejects a cap that is not a non-negative integer', () => {
    expect(() => new MemoryDailyBudget(-1)).toThrow(RangeError)
    expect(() => new MemoryDailyBudget(1.5)).toThrow(RangeError)
  })
})

describe('CircuitBreaker', () => {
  it('opens after consecutive failures, half-opens after the cooldown, and a success closes it', () => {
    let t = 0
    const breaker = new CircuitBreaker({ failures: 2, cooldownMs: 1000, now: () => t })
    breaker.failure()
    expect(breaker.state).toBe('closed')
    breaker.failure()
    expect(breaker.state).toBe('open')
    expect(breaker.allows()).toBe(false)
    t = 1000
    expect(breaker.state).toBe('half_open')
    expect(breaker.allows()).toBe(true)
    breaker.failure()
    expect(breaker.state).toBe('open')
    t = 2000
    breaker.success()
    expect(breaker.state).toBe('closed')
  })

  it('a success in between resets the count', () => {
    const breaker = new CircuitBreaker({ failures: 2 })
    breaker.failure()
    breaker.success()
    breaker.failure()
    expect(breaker.state).toBe('closed')
  })
})

describe('planBatches', () => {
  it('defaults to 32 items and 32k tokens', () => {
    expect(DEFAULT_BATCH).toEqual({ maxItems: 32, maxTokens: 32_000 })
    expect(planBatches(Array.from({ length: 70 }, () => 10), 50).map(b => b.length)).toEqual([32, 32, 6])
  })

  it('closes a batch before it would pass the token budget, and sends an oversized item alone', () => {
    expect(planBatches([400, 400, 400, 5000, 100], 100, { maxTokens: 1000 })).toEqual([[0, 1], [2], [3], [4]])
  })

  it('keeps order and loses nothing', () => {
    const batches = planBatches(Array.from({ length: 45 }, (_, i) => i), 0, { maxItems: 20 })
    expect(batches.flat()).toEqual(Array.from({ length: 45 }, (_, i) => i))
  })

  it('rejects a non-positive item limit', () => {
    expect(() => planBatches([1], 0, { maxItems: 0 })).toThrow(RangeError)
  })

  it('estimates three characters a token, rounding up', () => {
    expect(estimateTokens('abcd')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })
})
