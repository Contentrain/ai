import type { FileChange } from './file-change.js'

export interface CommitAuthor {
  name: string
  email: string
}

export interface Commit {
  sha: string
  message: string
  author: CommitAuthor
  timestamp: string
}

/**
 * Input to `applyPlan`. Represents a single atomic commit: all changes land
 * in one commit on `branch`, created from `base` if it does not yet exist.
 */
export interface ApplyPlanInput {
  /** Branch name to commit to. Created from `base` if missing. */
  branch: string
  /** File additions, modifications and deletions to apply in a single commit. */
  changes: FileChange[]
  /** Commit message. */
  message: string
  /** Commit author. */
  author: CommitAuthor
  /** Optional base branch. Defaults to provider's content-tracking branch. */
  base?: string
}

/**
 * Write-side interface. Providers implement this to persist a set of file
 * changes as a single atomic commit. LocalProvider writes through a worktree
 * and `git commit`; API-backed providers post to the Git Data API or equivalent.
 */
export interface RepoWriter {
  applyPlan(input: ApplyPlanInput): Promise<Commit>
}
