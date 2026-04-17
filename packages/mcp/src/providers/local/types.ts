import type { SyncResult, WorkflowMode } from '@contentrain/types'
import type { Commit, CommitAuthor, FileChange } from '../../core/contracts/index.js'

/** Optional payload written to `.contentrain/context.json` after changes apply. */
export interface LocalContextUpdate {
  tool: string
  model: string
  locale?: string
  entries?: string[]
}

/**
 * Input to `LocalProvider.applyPlan`.
 *
 * The shape is a superset of the generic `RepoWriter.ApplyPlanInput` so
 * `LocalProvider` cleanly satisfies `RepoWriter`; the extra fields
 * (`context`, `workflowOverride`) are Local-only. `author` and `base` are
 * accepted for interface parity but not yet threaded into the underlying
 * transaction — author still comes from `CONTENTRAIN_AUTHOR_*` env vars.
 */
export interface LocalApplyPlanInput {
  /** Feature branch to create (from the content-tracking branch) and commit onto. */
  branch: string
  /** Changes produced by a plan operation — applied atomically in a single commit. */
  changes: FileChange[]
  /** Commit message. */
  message: string
  /** Optional commit author — parity with `RepoWriter.ApplyPlanInput`. */
  author?: CommitAuthor
  /** Optional base branch — parity with `RepoWriter.ApplyPlanInput`. */
  base?: string
  /** Optional context.json payload written through after changes apply. */
  context?: LocalContextUpdate
  /** Override workflow for this call; defaults to the project's configured workflow. */
  workflowOverride?: WorkflowMode
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
  sync?: SyncResult
  /** Non-fatal warning bubbled up from the transaction layer (e.g. partial sync). */
  warning?: string
}
