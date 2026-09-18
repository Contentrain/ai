// ─── Batching ───
//
// Items of one kind share a request: the PoC measured 1.39x fewer input
// tokens and ~4x less wall time than one request per item. A batch holds at
// most `maxItems` items (default 32, inside the 20–40 band) and stays under
// `maxTokens` (default 32k) by a conservative estimate — three characters a
// token, which over-counts English and roughly matches Turkish.

export interface BatchLimits {
  maxItems?: number
  maxTokens?: number
}

export const DEFAULT_BATCH: Required<BatchLimits> = { maxItems: 32, maxTokens: 32_000 }

export const estimateTokens = (text: string): number => Math.ceil(text.length / 3)

/**
 * Split item costs into consecutive batches. `fixed` is what every request
 * pays once (the preamble); `costs[i]` what item i adds (its line and its
 * questions). An item too large for any batch goes alone.
 */
export function planBatches(costs: readonly number[], fixed: number, limits: BatchLimits = {}): number[][] {
  const maxItems = limits.maxItems ?? DEFAULT_BATCH.maxItems
  const maxTokens = limits.maxTokens ?? DEFAULT_BATCH.maxTokens
  if (!Number.isInteger(maxItems) || maxItems < 1) throw new RangeError(`maxItems must be a positive integer, got ${maxItems}`)
  const batches: number[][] = []
  let current: number[] = []
  let tokens = fixed
  costs.forEach((cost, i) => {
    if (current.length && (current.length >= maxItems || tokens + cost > maxTokens)) {
      batches.push(current)
      current = []
      tokens = fixed
    }
    current.push(i)
    tokens += cost
  })
  if (current.length) batches.push(current)
  return batches
}
