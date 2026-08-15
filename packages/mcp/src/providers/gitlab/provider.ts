import type {
  ApplyPlanInput,
  Branch,
  Commit,
  FileDiff,
  MergeResult,
  ProviderCapabilities,
  RepoProvider,
} from '../../core/contracts/index.js'
import { applyPlanToGitLab } from './apply-plan.js'
import {
  createBranch as createBranchOp,
  deleteBranch as deleteBranchOp,
  getBranchDiff as getBranchDiffOp,
  getDefaultBranch as getDefaultBranchOp,
  isMerged as isMergedOp,
  listBranches as listBranchesOp,
  mergeBranch as mergeBranchOp,
} from './branch-ops.js'
import { GITLAB_CAPABILITIES } from './capabilities.js'
import type { GitLabClient } from './client.js'
import { GitLabReader } from './reader.js'
import type { ProjectRef } from './types.js'

/**
 * GitLabProvider — `RepoProvider` backed by the gitbeaker-driven GitLab
 * REST API.
 *
 * Transport-agnostic: the provider only talks to a `GitLabClient`
 * (a `@gitbeaker/rest` `Gitlab` instance). `createGitLabProvider` in
 * `factory.ts` wraps the dynamic import so consumers never touch
 * `@gitbeaker/rest` directly unless they want to.
 *
 * Capability gaps versus `GitHubProvider`: none — both providers
 * expose the same set. GitLab's merge flow routes through an MR under
 * the hood, but `mergeBranch` presents the same `MergeResult` shape.
 */
export class GitLabProvider implements RepoProvider {
  readonly capabilities: ProviderCapabilities = GITLAB_CAPABILITIES
  private readonly reader: GitLabReader

  constructor(
    private readonly client: GitLabClient,
    public readonly project: ProjectRef,
  ) {
    this.reader = new GitLabReader(client, project)
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

  applyPlan(input: ApplyPlanInput): Promise<Commit> {
    return applyPlanToGitLab(this.client, this.project, input)
  }

  listBranches(prefix?: string): Promise<Branch[]> {
    return listBranchesOp(this.client, this.project, prefix)
  }
  async createBranch(name: string, fromRef?: string): Promise<void> {
    const resolved = fromRef ?? await getDefaultBranchOp(this.client, this.project)
    await createBranchOp(this.client, this.project, name, resolved)
  }
  deleteBranch(name: string): Promise<void> {
    return deleteBranchOp(this.client, this.project, name)
  }
  async getBranchDiff(branch: string, base?: string): Promise<FileDiff[]> {
    const resolved = base ?? await getDefaultBranchOp(this.client, this.project)
    return getBranchDiffOp(this.client, this.project, branch, resolved)
  }
  mergeBranch(branch: string, into: string, opts?: { removeSourceBranch?: boolean }): Promise<MergeResult> {
    return mergeBranchOp(this.client, this.project, branch, into, opts)
  }
  async isMerged(branch: string, into?: string): Promise<boolean> {
    const resolved = into ?? await getDefaultBranchOp(this.client, this.project)
    return isMergedOp(this.client, this.project, branch, resolved)
  }
  getDefaultBranch(): Promise<string> {
    return getDefaultBranchOp(this.client, this.project)
  }

  /**
   * Merge-base via GitLab's dedicated endpoint. `createMergeCommit` is
   * deliberately ABSENT (and `capabilities.mergeCommit` unset): the GitLab
   * Commits API cannot express a two-parent commit, so a reconcile against
   * GitLab falls back to a merge-request flow driven by the caller.
   */
  async getMergeBase(refA: string, refB: string): Promise<string | null> {
    try {
      const commit = await this.client.Repositories.mergeBase(this.project.projectId, [refA, refB])
      return commit.id ?? null
    } catch {
      return null
    }
  }
}
