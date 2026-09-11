// ─── Canonical Serialization ───
//
// Deterministic JSON: the same data must produce the same bytes on every
// machine, every run. Stable git diffs depend on it, and so does `plan_hash`
// in `execution.ts` — which is why these two functions live in their own
// module rather than in `index.ts`. `execution.ts` needs them and `index.ts`
// re-exports `execution.ts`; keeping them here is what stops that from being
// an import cycle.

/** Recursively sort object keys — respects optional fieldOrder for top-level keys */
export function sortKeys(obj: unknown, fieldOrder?: readonly string[]): unknown {
  if (obj === null || obj === undefined) return undefined
  if (Array.isArray(obj)) return obj.map(item => sortKeys(item, fieldOrder))
  if (typeof obj !== 'object') return obj

  const record = obj as Record<string, unknown>
  const sorted: Record<string, unknown> = {}

  const keys = fieldOrder
    ? [...new Set([...fieldOrder, ...Object.keys(record).toSorted()])]
    : Object.keys(record).toSorted()

  for (const key of keys) {
    if (!(key in record)) continue
    const val = record[key]
    if (val === null || val === undefined) continue
    sorted[key] = sortKeys(val)
  }

  return sorted
}

/** Canonical JSON serialization — deterministic output for stable git diffs */
export function canonicalStringify(data: unknown, fieldOrder?: readonly string[]): string {
  const sorted = sortKeys(data, fieldOrder)
  return `${JSON.stringify(sorted, null, 2)}\n`
}
