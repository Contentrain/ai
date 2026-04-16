import type { Commit, FileChange } from '../../core/contracts/index.js'

/** Optional payload written to `.contentrain/context.json` after changes apply. */
export interface LocalContextUpdate {
  tool: string
  model: string
  locale?: string
  entries?: string[]
}

export interface LocalApplyPlanInput {
  /** Feature branch to create (from the content-tracking branch) and commit onto. */
  branch: string
  /** Changes produced by a plan operation — applied atomically in a single commit. */
  changes: FileChange[]
  /** Commit message. */
  message: string
  /** Optional context.json payload written through after changes apply. */
  context?: LocalContextUpdate
  /** Override workflow for this call; defaults to the project's configured workflow. */
  workflowOverride?: 'review' | 'auto-merge'
}

export interface LocalSelectiveSyncResult {
  /** Files in the developer's working tree that were updated to match the new HEAD. */
  synced: string[]
  /** Files skipped because of local modifications the developer should resolve. */
  skipped: string[]
  /** Human-readable advice surfaced to the agent when skips happened. */
  warning?: string
}

export interface LocalApplyResult extends Commit {
  /**
   * `auto-merged` — changes fast-forwarded onto the base branch and the
   * developer's working tree was selectively re-synced.
   * `pending-review` — changes were pushed to the feature branch and are
   * awaiting review/merge.
   */
  workflowAction: 'auto-merged' | 'pending-review'
  /** Selective-sync bookkeeping; populated when `workflowAction === 'auto-merged'`. */
  sync?: LocalSelectiveSyncResult
  /** Non-fatal warning bubbled up from the transaction layer (e.g. partial sync). */
  warning?: string
}
