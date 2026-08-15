import { conflictId, sortKeys } from '@contentrain/types'
import type { ConflictItem } from '@contentrain/types'
import type { MergeStats, Side, ThreeWay } from './types.js'
import { EMPTY_STATS, addStats } from './types.js'

/**
 * Canonical equality: both values normalized through `sortKeys` (which drops
 * `null`/`undefined` values and sorts keys recursively — the same normal
 * form `canonicalStringify` writes to disk), then compared as JSON. So
 * `{ a: null }` equals `{}`, key order never matters, and absent equals
 * null — exactly the distinctions the storage layer cannot represent.
 */
export function eqCanonical(a: unknown, b: unknown): boolean {
  const na = sortKeys(a)
  const nb = sortKeys(b)
  if (na === undefined || nb === undefined) return na === nb
  return JSON.stringify(na) === JSON.stringify(nb)
}

/** Outcome of a three-way merge of one leaf value. */
export type Leaf3 =
  | { ok: true, value: unknown, from: 'base' | 'both' | Side }
  | { ok: false, reason: 'both_changed' | 'delete_edit', deletedBy?: Side }

/**
 * The three-way rule every policy row reduces to: a side that did not
 * change keeps no vote; identical changes converge; a lone change wins;
 * two different changes are a conflict — with delete-vs-edit split out
 * because it needs a different question ("keep or drop?" instead of
 * "which value?").
 */
export function mergeLeaf3(base: unknown, ours: unknown, theirs: unknown): Leaf3 {
  const oursSame = eqCanonical(ours, base)
  const theirsSame = eqCanonical(theirs, base)
  if (oursSame && theirsSame) return { ok: true, value: base, from: 'base' }
  if (eqCanonical(ours, theirs)) return { ok: true, value: ours, from: 'both' }
  if (oursSame) return { ok: true, value: theirs, from: 'theirs' }
  if (theirsSame) return { ok: true, value: ours, from: 'ours' }

  const baseAbsent = sortKeys(base) === undefined
  const oursAbsent = sortKeys(ours) === undefined
  const theirsAbsent = sortKeys(theirs) === undefined
  if (!baseAbsent && oursAbsent !== theirsAbsent) {
    return { ok: false, reason: 'delete_edit', deletedBy: oursAbsent ? 'ours' : 'theirs' }
  }
  return { ok: false, reason: 'both_changed' }
}

/** What a keyed-record item merge decided, plus its bookkeeping. */
export interface ItemOutcome<T> {
  /** Merged value; `undefined` = the item is absent from the output. */
  value: T | undefined
  conflicts: ConflictItem[]
  stats: MergeStats
}

/**
 * Three-way merge of a keyed record (entries by ID, dictionary by key,
 * terms by slug, schema by property name): iterate the sorted union of
 * keys, delegate each item to `mergeItem`, assemble the output map.
 */
export function mergeKeyedRecord3<T>(
  three: ThreeWay<Record<string, T>>,
  mergeItem: (key: string, item: ThreeWay<T>) => ItemOutcome<T>,
): { merged: Record<string, T>, conflicts: ConflictItem[], stats: MergeStats } {
  const keys = [...new Set([
    ...Object.keys(three.base ?? {}),
    ...Object.keys(three.ours ?? {}),
    ...Object.keys(three.theirs ?? {}),
  ])].toSorted()

  const merged: Record<string, T> = {}
  const conflicts: ConflictItem[] = []
  let stats = EMPTY_STATS
  for (const key of keys) {
    const outcome = mergeItem(key, {
      base: three.base?.[key],
      ours: three.ours?.[key],
      theirs: three.theirs?.[key],
    })
    if (outcome.value !== undefined) merged[key] = outcome.value
    conflicts.push(...outcome.conflicts)
    stats = addStats(stats, outcome.stats)
  }
  return { merged, conflicts, stats }
}

/** Attach the value-derived id — the only way a ConflictItem is ever built. */
export function makeConflict(input: Omit<ConflictItem, 'id'>): ConflictItem {
  return { id: conflictId(input), ...input }
}

/** Stats bucket for a clean leaf outcome; `base`/`both` count nowhere. */
export function statsFor(from: 'base' | 'both' | Side): MergeStats {
  if (from === 'ours') return { takenOurs: 1, takenTheirs: 0, fieldMerged: 0 }
  if (from === 'theirs') return { takenOurs: 0, takenTheirs: 1, fieldMerged: 0 }
  return EMPTY_STATS
}
