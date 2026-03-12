/**
 * Canonical JSON serialization — deterministic output for git diff stability.
 *
 * Rules (spec Section 14.10):
 * - Top-level keys: lexicographic sort
 * - Entry fields: follow fieldOrder if provided, else lexicographic
 * - 2-space indent, UTF-8, trailing newline
 * - Null/undefined values omitted
 */

function sortKeys(obj: unknown, fieldOrder?: string[]): unknown {
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

export function canonicalStringify(data: unknown, fieldOrder?: string[]): string {
  const sorted = sortKeys(data, fieldOrder)
  return JSON.stringify(sorted, null, 2) + '\n'
}
