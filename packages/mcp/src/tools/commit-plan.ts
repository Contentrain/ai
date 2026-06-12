import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type { FileChange } from '../core/contracts/index.js'
import { LocalProvider } from '../providers/local/index.js'
import type { ToolProvider } from '../server.js'

/**
 * Context payload describing the operation, threaded into the local
 * transaction so it can regenerate `.contentrain/context.json` on the
 * contentrain branch after merge. Kept as a loose object so tool-specific
 * payloads can add optional fields (`locale`, `entries`) without churning
 * the helper's signature. Remote providers ignore it — see
 * `commitThroughProvider` below.
 */
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
}

/**
 * Commit a plan's changes through whichever provider is wired into the
 * tool handler. Encapsulates the LocalProvider vs remote RepoProvider
 * dispatch that every write-side tool (content_save, content_delete,
 * model_save, model_delete) used to inline:
 *
 * - **LocalProvider** — goes through the worktree-backed transaction.
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

  if (provider instanceof LocalProvider) {
    const result = await provider.applyPlan({
      branch,
      changes,
      message,
      context: contextPayload,
    })
    return {
      commitSha: result.sha,
      workflowAction: result.workflowAction,
      sync: result.sync,
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
    author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
    base: CONTENTRAIN_BRANCH,
  })
  return {
    commitSha: commit.sha,
    workflowAction: 'pending-review',
  }
}
