import type { ConflictItem, ConflictResolution, ContextSource } from '@contentrain/types'
import type { RepoReader } from '../../contracts/index.js'
import type { OpPlan } from '../types.js'
import type { ResolutionIndex } from './resolutions.js'

/**
 * Input to the content-aware three-way reconcile planner.
 *
 * All three readers are ref-bound (`bindRef` / `GitRefReader`): `base` reads
 * the merge-base tree, `ours` the content branch (contentrain), `theirs` the
 * base branch (main). The planner never sees a ref — executors decide what
 * to bind.
 */
export interface ReconcileInput {
  base: RepoReader
  ours: RepoReader
  theirs: RepoReader
  /** Second round: decisions for previously reported conflicts, matched by id. */
  resolutions?: ConflictResolution[]
  /** Stamped into the regenerated context.json. */
  source?: ContextSource
}

export interface ReconcileResult {
  /** Content-layer files whose merged output differs from ours (context.json excluded). */
  files_merged: number
  /** Items resolved by taking the side that changed them. */
  entries_taken_ours: number
  entries_taken_theirs: number
  /** Items where both sides changed different fields and the union won. */
  entries_field_merged: number
  /** Regenerated derived files — `['.contentrain/context.json']` or empty on a no-op. */
  regenerated: string[]
}

/**
 * A reconcile plan: everything mechanical is already merged into `changes`
 * (applied on top of ours); `conflicts` are the items the policy table
 * cannot decide. A plan with conflicts is not applied — the caller collects
 * decisions and runs a second round with `resolutions`.
 */
export interface ReconcilePlan extends OpPlan<ReconcileResult> {
  conflicts: ConflictItem[]
}

// ─── Internal shapes (not exported from the barrel) ───

export type Side = 'ours' | 'theirs'

/** One value as seen by the three trees; `undefined` = absent on that side. */
export interface ThreeWay<T> {
  base: T | undefined
  ours: T | undefined
  theirs: T | undefined
}

export interface MergeStats {
  takenOurs: number
  takenTheirs: number
  fieldMerged: number
}

export const EMPTY_STATS: MergeStats = { takenOurs: 0, takenTheirs: 0, fieldMerged: 0 }

export function addStats(a: MergeStats, b: MergeStats): MergeStats {
  return {
    takenOurs: a.takenOurs + b.takenOurs,
    takenTheirs: a.takenTheirs + b.takenTheirs,
    fieldMerged: a.fieldMerged + b.fieldMerged,
  }
}

/**
 * Context every per-kind merge function receives: where the merged file
 * lives, which model/locale it belongs to, and the resolution index that is
 * consulted at the exact point a conflict would otherwise be created.
 */
export interface FileCtx {
  outPath: string
  kind: ConflictItem['kind']
  model?: string
  locale?: string
  slug?: string
  resolutions: ResolutionIndex
}
