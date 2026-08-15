import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type {
  Branch,
  Commit,
  CommitAuthor,
  FileChange,
  FileDiff,
  MergeResult,
  ProviderCapabilities,
  RepoProvider,
  WriteReadiness,
} from '../../core/contracts/index.js'
import { LOCAL_CAPABILITIES } from '../../core/contracts/index.js'
import { applyChangesToWorktree } from '../../core/ops/index.js'
import { checkBranchHealth } from '../../git/branch-lifecycle.js'
import { createGit } from '../../git/identity.js'
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
const DEFAULT_AUTHOR_EMAIL = 'ai@contentrain.io'

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

  /**
   * Branch pressure gate. Unmerged `cr/*` branches accumulate in a local repo
   * and eventually have to stop new writes; hosted providers have no such
   * limit, so they omit this method entirely.
   */
  async checkWriteReadiness(): Promise<WriteReadiness> {
    const health = await checkBranchHealth(this.projectRoot)
    return health.blocked
      ? { blocked: true, message: health.message ?? 'Too many active contentrain branches.' }
      : { blocked: false }
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
        author: input.author ?? {
          name: process.env['CONTENTRAIN_AUTHOR_NAME'] ?? DEFAULT_AUTHOR_NAME,
          email: process.env['CONTENTRAIN_AUTHOR_EMAIL'] ?? DEFAULT_AUTHOR_EMAIL,
        },
        timestamp: new Date().toISOString(),
        workflowAction: gitResult.action,
        sync: gitResult.sync,
        warning: gitResult.warning,
        base_advance: gitResult.base_advance,
        remote_push: gitResult.remote_push,
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

  async getMergeBase(refA: string, refB: string): Promise<string | null> {
    const git = createGit(this.projectRoot)
    try {
      return (await git.raw(['merge-base', refA, refB])).trim() || null
    } catch {
      return null
    }
  }

  /**
   * Two-parent merge commit in a temp worktree. The real `git merge`
   * resolves everything outside the plan; the plan's changes then
   * overwrite every content-owned path (planner output is authoritative,
   * never git's textual auto-merge). Leftover unmerged paths abort — they
   * are outside the content planner's scope by construction.
   */
  async createMergeCommit(input: {
    branch: string
    ours: string
    theirs: string
    changes: FileChange[]
    message: string
    author: CommitAuthor
  }): Promise<Commit> {
    const git = createGit(this.projectRoot)
    const tip = (await git.raw(['rev-parse', input.branch])).trim()
    if (tip !== input.ours) {
      throw Object.assign(new Error(
        `createMergeCommit: "${input.branch}" is at ${tip.slice(0, 8)}, not the expected ${input.ours.slice(0, 8)} — the branch moved since planning.`,
      ), {
        code: 'RECONCILE_STALE_OURS',
        agent_hint: 'Re-run the reconcile plan against the current tip.',
      })
    }

    const worktreePath = join(tmpdir(), `cr-merge-commit-${randomUUID()}`)
    await git.raw(['worktree', 'add', worktreePath, input.branch])
    const wtGit = createGit(worktreePath, {
      config: [
        `user.name=${input.author.name}`,
        `user.email=${input.author.email}`,
      ],
    })
    try {
      try {
        await wtGit.merge([input.theirs, '--no-commit', '--no-ff'])
      } catch {
        // Conflicts are expected — the plan overwrites content paths next.
      }
      await applyChangesToWorktree(worktreePath, input.changes)
      await wtGit.raw(['add', '-A'])
      const unmerged = (await wtGit.raw(['ls-files', '-u'])).trim()
      if (unmerged) {
        const paths = [...new Set(unmerged.split('\n').map(l => l.split('\t')[1]).filter(Boolean))]
        try { await wtGit.merge(['--abort']) } catch { /* not in merge state */ }
        throw Object.assign(new Error(
          `createMergeCommit: ${paths.length} non-content file(s) conflict: ${paths.join(', ')}.`,
        ), { code: 'RECONCILE_SOURCE_CONFLICT' })
      }
      await wtGit.commit(input.message, { '--no-verify': null })
      const sha = (await wtGit.raw(['rev-parse', 'HEAD'])).trim()
      return {
        sha,
        message: input.message,
        author: input.author,
        timestamp: new Date().toISOString(),
      }
    } finally {
      try {
        await git.raw(['worktree', 'remove', worktreePath, '--force'])
      } catch {
        // worktree may already be cleaned up
      }
    }
  }
}
