import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type { FileChange } from '../core/contracts/index.js'
import { buildContextChange } from '../core/context.js'
import { OverlayReader } from '../core/overlay-reader.js'
import { LocalProvider } from '../providers/local/index.js'
import type { ToolProvider } from '../server.js'

/**
 * Context payload written into `.contentrain/context.json` as part of the
 * same commit. Kept as a loose object so tool-specific payloads can add
 * optional fields (`locale`, `entries`) without churning the helper's
 * signature.
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
 * - **Any other RepoProvider** — the context.json write becomes an extra
 *   `FileChange` bundled into the plan so the whole commit lands
 *   atomically through the generic `RepoWriter.applyPlan`. Remote flows
 *   always report `pending-review`; Studio (or whatever orchestrator is
 *   driving the server) owns the merge.
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

  // Build context.json against an overlay of the pending FileChanges so
  // `stats.entries` / `stats.models` reflect the state *after* this
  // commit lands, not the pre-change base branch. Without the overlay
  // the committed context.json would be stale — a new entry added in
  // this commit would not appear in the entry count until the next
  // write.
  const overlay = new OverlayReader(provider, changes)
  const contextChange = await buildContextChange(overlay, contextPayload)
  const allChanges = [...changes, contextChange]
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
