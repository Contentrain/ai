import type { ProviderCapabilities, RepoReader } from '../../core/contracts/index.js'
import { LOCAL_CAPABILITIES } from '../../core/contracts/index.js'
import { applyChangesToWorktree } from '../../core/ops/index.js'
import { createTransaction } from '../../git/transaction.js'
import { LocalReader } from './reader.js'
import type { LocalApplyPlanInput, LocalApplyResult } from './types.js'

const DEFAULT_AUTHOR_NAME = 'Contentrain'
const DEFAULT_AUTHOR_EMAIL = 'mcp@contentrain.io'

/**
 * LocalProvider — the local-filesystem, worktree-backed content provider.
 *
 * Phase 3 scope: LocalProvider wraps the existing `createTransaction` flow
 * so tool handlers drive a clean plan/apply surface without knowing about
 * worktrees, the contentrain branch guard, or the auto-merge state
 * machine. Phase 6 will fold `transaction.ts`'s internals into this
 * provider; today it is a thin, behaviour-preserving wrapper.
 *
 * Implements `RepoReader` (through a private LocalReader). Implements a
 * superset of `RepoWriter.applyPlan` — returns `LocalApplyResult` which
 * extends `Commit` with workflow action + selective-sync details; the
 * extras are ignored by code that consumes it as a plain `Commit`.
 */
export class LocalProvider implements RepoReader {
  readonly capabilities: ProviderCapabilities = LOCAL_CAPABILITIES
  private readonly reader: LocalReader

  constructor(public readonly projectRoot: string) {
    this.reader = new LocalReader(projectRoot)
  }

  readFile(path: string, ref?: string): Promise<string> {
    return this.reader.readFile(path, ref)
  }

  listDirectory(path: string, ref?: string): Promise<string[]> {
    return this.reader.listDirectory(path, ref)
  }

  fileExists(path: string, ref?: string): Promise<boolean> {
    return this.reader.fileExists(path, ref)
  }

  async applyPlan(input: LocalApplyPlanInput): Promise<LocalApplyResult> {
    const tx = await createTransaction(this.projectRoot, input.branch, {
      workflowOverride: input.workflowOverride,
    })
    try {
      await tx.write(async (wt) => {
        await applyChangesToWorktree(wt, input.changes)
      })
      await tx.commit(input.message, input.context)
      const gitResult = await tx.complete()
      return {
        sha: gitResult.commit,
        message: input.message,
        author: {
          name: process.env['CONTENTRAIN_AUTHOR_NAME'] ?? DEFAULT_AUTHOR_NAME,
          email: process.env['CONTENTRAIN_AUTHOR_EMAIL'] ?? DEFAULT_AUTHOR_EMAIL,
        },
        timestamp: new Date().toISOString(),
        workflowAction: gitResult.action,
        sync: gitResult.sync,
        warning: gitResult.warning,
      }
    } finally {
      await tx.cleanup()
    }
  }
}
