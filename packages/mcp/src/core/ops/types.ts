import type { FileChange } from '../contracts/index.js'

/**
 * Generic plan envelope. Every `planXxx` operation in `core/ops/` returns
 * this shape: a set of atomic file changes plus a typed result payload. The
 * caller (tool handler or Studio engine) applies the changes through a
 * `RepoProvider` and uses `result` for the tool response.
 *
 * See `.internal/refactor/00-principles.md` §5.1 for the plan/apply pattern.
 */
export interface OpPlan<TResult = unknown> {
  /** File additions, modifications and deletions, sorted by path for determinism. */
  changes: FileChange[]
  /** Operation-specific result payload (IDs of entries touched, etc.). */
  result: TResult
  /** Soft warnings the caller should surface to the user. */
  advisories: string[]
}

export interface ContentSaveEntryResult {
  action: 'created' | 'updated'
  id?: string
  slug?: string
  locale: string
  advisories?: string[]
}

export type ContentSavePlan = OpPlan<ContentSaveEntryResult[]>
