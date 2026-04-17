import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type {
  Branch,
  FileDiff,
  MergeResult,
  ProviderCapabilities,
  RepoProvider,
} from '../../core/contracts/index.js'
import { LOCAL_CAPABILITIES } from '../../core/contracts/index.js'
import { applyChangesToWorktree } from '../../core/ops/index.js'
import { createTransaction } from '../../git/transaction.js'
import {
  createBranch as createBranchOp,
  deleteBranch as deleteBranchOp,
  getBranchDiff as getBranchDiffOp,
  getDefaultBranch as getDefaultBranchOp,
  isMerged as isMergedOp,
  listBranches as listBranchesOp,
  mergeBranch as mergeBranchOp,
} from './branch-ops.js'
import { LocalReader } from './reader.js'
import type { LocalApplyPlanInput, LocalApplyResult } from './types.js'

const DEFAULT_AUTHOR_NAME = 'Contentrain'
const DEFAULT_AUTHOR_EMAIL = 'mcp@contentrain.io'

/**
 * LocalProvider — the local-filesystem, worktree-backed content provider.
 *
 * Implements the full `RepoProvider` surface:
 * - Reader methods delegate to `LocalReader`.
 * - `applyPlan` wraps `createTransaction` and returns `LocalApplyResult`
 *   (a superset of `Commit` carrying workflow action + selective sync).
 * - Branch ops mirror `GitHubProvider` — thin wrappers over the local
 *   simple-git helpers in `./branch-ops.ts`.
 *
 * `mergeBranch` only supports merging into the singleton
 * `CONTENTRAIN_BRANCH`; the local flow advances the base branch via
 * `update-ref` in `transaction.mergeBranch`, so arbitrary merge targets
 * would bypass that invariant.
 */
export class LocalProvider implements RepoProvider {
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

  listBranches(prefix?: string): Promise<Branch[]> {
    return listBranchesOp(this.projectRoot, prefix)
  }

  async createBranch(name: string, fromRef?: string): Promise<void> {
    const resolved = fromRef ?? CONTENTRAIN_BRANCH
    await createBranchOp(this.projectRoot, name, resolved)
  }

  deleteBranch(name: string): Promise<void> {
    return deleteBranchOp(this.projectRoot, name)
  }

  getBranchDiff(branch: string, base?: string): Promise<FileDiff[]> {
    const resolved = base ?? CONTENTRAIN_BRANCH
    return getBranchDiffOp(this.projectRoot, branch, resolved)
  }

  mergeBranch(branch: string, into: string): Promise<MergeResult> {
    return mergeBranchOp(this.projectRoot, branch, into)
  }

  isMerged(branch: string, into?: string): Promise<boolean> {
    const resolved = into ?? CONTENTRAIN_BRANCH
    return isMergedOp(this.projectRoot, branch, resolved)
  }

  getDefaultBranch(): Promise<string> {
    return getDefaultBranchOp(this.projectRoot)
  }
}
