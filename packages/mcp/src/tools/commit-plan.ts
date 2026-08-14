import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type { BaseAdvance, RemotePush } from '@contentrain/types'
import type { FileChange } from '../core/contracts/index.js'
import type { ToolProvider } from '../server.js'

/**
 * Context payload describing the operation, threaded into the local
 * transaction so it can regenerate `.contentrain/context.json` on the
 * contentrain branch after merge. Kept as a loose object so tool-specific
 * payloads can add optional fields (`locale`, `entries`) without churning
 * the helper's signature. Remote providers ignore it — see
 * `commitThroughProvider` below.
 */
const COMMIT_AUTHOR = { name: 'Contentrain', email: 'ai@contentrain.io' } as const

export interface CommitContextPayload {
  tool: string
  model: string
  locale?: string
  entries?: string[]
}

export interface CommitThroughProviderInput {
  branch: string
  changes: FileChange[]
  message: string
  contextPayload: CommitContextPayload
}

export interface CommitThroughProviderResult {
  commitSha: string
  workflowAction: 'auto-merged' | 'pending-review'
  sync?: unknown
  /** Non-fatal problem from the provider (push failure, partial sync, diverged base). */
  warning?: string
  /** Present when a local provider auto-merged: did the base branch advance? */
  base_advance?: BaseAdvance
  /** Present when a local provider pushed: outcome for the contentrain branch. */
  remote_push?: RemotePush
}

/**
 * The `git` object every write tool reports. One producer instead of nine
 * hand-rolled literals, so `base_advance`/`remote_push` cannot drift between
 * tools. Both fields appear only when the provider reported them (local
 * auto-merge) — remote/review responses keep their previous shape.
 */
export function gitReport(input: {
  branch: string
  action: string
  commit: string
  sync?: unknown
  base_advance?: BaseAdvance
  remote_push?: RemotePush
}): Record<string, unknown> {
  return {
    branch: input.branch,
    action: input.action,
    commit: input.commit,
    ...(input.sync ? { sync: input.sync } : {}),
    ...(input.base_advance ? { base_advance: input.base_advance } : {}),
    ...(input.remote_push ? { remote_push: input.remote_push } : {}),
  }
}

/**
 * Next-step guidance for a partial success — empty when the base advanced
 * and the push landed. The wording names the manual reconcile path; once a
 * dedicated reconcile tool exists it should be named here instead.
 */
export function divergenceNextSteps(input: {
  base_advance?: BaseAdvance
  remote_push?: RemotePush
}): string[] {
  const steps: string[] = []
  if (input.base_advance === 'blocked_diverged') {
    steps.push('DIVERGED: the content is safe on the contentrain branch, but the base branch has commits contentrain does not — reconcile the branches to advance the base branch')
  }
  if (input.remote_push === 'rejected') {
    steps.push('PUSH REJECTED: the remote refused the contentrain push even after a retry — the local and remote contentrain branches have diverged and need reconciling')
  }
  return steps
}

/**
 * Commit a plan's changes through whichever provider is wired into the
 * tool handler. Encapsulates the LocalProvider vs remote RepoProvider
 * dispatch that every write-side tool (content_save, content_delete,
 * model_save, model_delete) used to inline:
 *
 * - **localWorktree providers** — go through the worktree-backed transaction.
 *   `context` payload is threaded as an extra write-through and the
 *   transaction layer decides `auto-merged` vs `pending-review` based on
 *   the project's configured workflow. Selective-sync result is surfaced
 *   to the caller via `sync`.
 *
 * - **Any other RepoProvider** — only the plan's own changes are
 *   committed. Feature branches NEVER carry `.contentrain/context.json`:
 *   the file embeds timestamps, so two parallel cr/* branches forked from
 *   the same contentrain commit would always conflict on it and the
 *   second merge would fail permanently. This mirrors the local
 *   transaction flow, which regenerates context.json on the contentrain
 *   branch after merge (single-threaded, deterministic). Remote flows
 *   always report `pending-review`; Studio (or whatever orchestrator is
 *   driving the server) owns the merge AND the post-merge context
 *   regeneration on the contentrain branch (`buildContextChange` from
 *   `@contentrain/mcp/core/context` is exported for exactly that).
 *
 * The return shape is deliberately uniform so callers don't have to
 * branch on provider type again.
 */
export async function commitThroughProvider(
  provider: ToolProvider,
  input: CommitThroughProviderInput,
): Promise<CommitThroughProviderResult> {
  const { branch, changes, message, contextPayload } = input

  // Capability, not class identity: "backs onto a local worktree" is exactly
  // what decides which applyPlan shape comes back, and it is a property any
  // implementation can declare — including a test double.
  if (provider.capabilities.localWorktree) {
    const result = await provider.applyPlan({
      branch,
      changes,
      message,
      author: COMMIT_AUTHOR,
      context: contextPayload,
    })
    return {
      commitSha: result.sha,
      // A provider that owns the merge decision reports it; one that hands the
      // branch off to an orchestrator does not, and that means review.
      workflowAction: result.workflowAction ?? 'pending-review',
      sync: result.sync,
      warning: result.warning,
      base_advance: result.base_advance,
      remote_push: result.remote_push,
    }
  }

  const allChanges = changes
    .toSorted((a, b) => a.path.localeCompare(b.path))
  // Feature branches ALWAYS fork from the `contentrain` branch — that's
  // the single source of truth the local transaction flow enforces, and
  // the remote flow must match it so Studio's cr/* → contentrain →
  // defaultBranch model stays consistent. `config.repository.default_branch`
  // names the repo's primary branch (main / master / trunk) — that is
  // NOT the content tracking branch, only the downstream target.
  const commit = await provider.applyPlan({
    branch,
    changes: allChanges,
    message,
    author: COMMIT_AUTHOR,
    base: CONTENTRAIN_BRANCH,
  })
  return {
    commitSha: commit.sha,
    workflowAction: 'pending-review',
  }
}
