import { MODEL_FIELD_ORDER } from '@contentrain/types'
import type { FileChange } from '../../core/contracts/index.js'
import { canonicalStringify, sortKeys } from '../../core/serialization/index.js'

/**
 * Carry a plan's full-file changes over to the tree they are committed on.
 *
 * The local provider plans against the developer's working tree, but commits
 * in a worktree on the `contentrain` branch after fetching and merging the
 * remote. Those two trees differ whenever another writer (Studio, a teammate,
 * CI) reached `contentrain` since the developer last pulled. A plan is a set
 * of whole files, so writing it as-is replaced every file it touched with a
 * copy built from the stale tree — silently deleting whatever the other
 * writer had added (#226).
 *
 * Each change is a three-way merge instead:
 *   basis   — the file as the planner read it (working tree, `null` if absent)
 *   planned — the change's content (`null` for a delete)
 *   current — the file in the worktree the commit is built on
 *
 * `current === basis` is the common case and writes the plan verbatim. When
 * they differ, JSON object files (collection / dictionary / singleton content,
 * meta, model definitions) are merged key by key: what the plan changed
 * relative to its basis is applied on top of `current`, recursively through
 * nested objects. Anything that cannot be merged that way — both sides
 * changed the same value, a markdown document, a delete of a file that
 * gained entries — is a conflict. Conflicts are never resolved by guessing:
 * the caller refuses the write.
 *
 * One exception, in meta files only: the write stamp (`updated_at`,
 * `updated_by`, `source`). Every write re-stamps the entries it touches
 * (`mergeEntryMeta`, `applyStatusChange`), so two writes to the same entry
 * always disagree there. The stamp describes the latest write, which is this
 * one — so when this write re-stamped an entry, its whole stamp wins, as a
 * unit (never this write's `updated_at` with the other writer's
 * `updated_by`). `status` and scheduling still merge or conflict normally.
 */
export type RebaseResult =
  | { ok: true, change: FileChange }
  | { ok: false, path: string, reason: string }

export function rebaseChange(change: FileChange, basis: string | null, current: string | null): RebaseResult {
  if (current === basis || current === change.content) return { ok: true, change }

  const reject = (reason: string): RebaseResult => ({ ok: false, path: change.path, reason })

  if (basis !== null && current === null) {
    return reject('the file was deleted on the contentrain branch since it was read')
  }
  if (!change.path.endsWith('.json')) {
    return reject('the file changed on the contentrain branch since it was read, and only JSON files can be merged')
  }

  const base = basis === null ? {} : parseObject(basis)
  const theirs = current === null ? {} : parseObject(current)
  const ours = change.content === null ? {} : parseObject(change.content)
  if (!base || !theirs || !ours) {
    return reject('the file changed on the contentrain branch since it was read, and is not a JSON object')
  }

  const stampWins = change.path.startsWith('.contentrain/meta/')
  const merged = merge3(base, ours, theirs, [], stampWins)
  if (!merged.ok) {
    return reject(`${describeKey(merged.at)} was changed both by this write and on the contentrain branch`)
  }
  const value = merged.value === ABSENT ? {} : merged.value as Record<string, unknown>

  if (change.content === null) {
    // A delete merges to "the keys only the other writer has". Writing those
    // back would keep a file this operation meant to remove (a deleted model's
    // content, say) — refuse instead and let the caller decide after a pull.
    return Object.keys(value).length === 0
      ? { ok: true, change }
      : reject('the file gained entries on the contentrain branch since it was read, so deleting it would drop them')
  }

  const fieldOrder = change.path.startsWith('.contentrain/models/') ? MODEL_FIELD_ORDER : undefined
  return { ok: true, change: { path: change.path, content: canonicalStringify(value, fieldOrder) } }
}

const ABSENT = Symbol('absent')
type Value = unknown | typeof ABSENT

type MergeResult = { ok: true, value: Value } | { ok: false, at: string[] }

/** Meta keys that record who wrote last and when — see the module comment. */
const WRITE_STAMP = new Set(['updated_at', 'updated_by', 'source'])

function merge3(base: Value, ours: Value, theirs: Value, at: string[], stampWins: boolean): MergeResult {
  if (same(ours, base)) return { ok: true, value: theirs }
  if (same(theirs, base)) return { ok: true, value: ours }
  if (same(ours, theirs)) return { ok: true, value: ours }
  if (!isPlainObject(base) || !isPlainObject(ours) || !isPlainObject(theirs)) {
    return { ok: false, at }
  }

  const restamped = stampWins
    && [...WRITE_STAMP].some(key => !same(field(ours, key), field(base, key)))
  const out: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  for (const key of keys) {
    if (restamped && WRITE_STAMP.has(key)) {
      const value = field(ours, key)
      if (value !== ABSENT) out[key] = value
      continue
    }
    const result = merge3(field(base, key), field(ours, key), field(theirs, key), [...at, key], stampWins)
    if (!result.ok) return result
    if (result.value !== ABSENT) out[key] = result.value
  }
  return { ok: true, value: out }
}

function field(obj: Record<string, unknown>, key: string): Value {
  return Object.hasOwn(obj, key) && obj[key] !== null && obj[key] !== undefined ? obj[key] : ABSENT
}

/** Canonical equality — the same normalisation the serializer applies (sorted keys, nulls dropped). */
function same(a: Value, b: Value): boolean {
  if (a === ABSENT || b === ABSENT) return a === b
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b))
}

function isPlainObject(value: Value): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function describeKey(at: string[]): string {
  if (at.length === 0) return 'the file'
  if (at.length === 1) return `"${at[0]}"`
  return `"${at[0]}" (field ${at.slice(1).map(k => `"${k}"`).join(' → ')})`
}
