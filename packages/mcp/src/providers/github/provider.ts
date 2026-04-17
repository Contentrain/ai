import type {
  ApplyPlanInput,
  Branch,
  Commit,
  FileDiff,
  MergeResult,
  ProviderCapabilities,
  RepoProvider,
} from '../../core/contracts/index.js'
import { applyPlanToGitHub } from './apply-plan.js'
import {
  createBranch as createBranchOp,
  deleteBranch as deleteBranchOp,
  getBranchDiff as getBranchDiffOp,
  getDefaultBranch as getDefaultBranchOp,
  isMerged as isMergedOp,
  listBranches as listBranchesOp,
  mergeBranch as mergeBranchOp,
} from './branch-ops.js'
import { GITHUB_CAPABILITIES } from './capabilities.js'
import type { GitHubClient } from './client.js'
import { GitHubReader } from './reader.js'
import type { RepoRef } from './types.js'

/**
 * GitHubProvider — `RepoProvider` backed by the Octokit-driven GitHub
 * REST + Git Data APIs.
 *
 * The provider is transport-agnostic; it only talks to an `Octokit`
 * instance passed into the constructor. The `createGitHubProvider`
 * helper in `factory.ts` wraps the dynamic import so consumers never
 * have to touch Octokit directly.
 */
export class GitHubProvider implements RepoProvider {
  readonly capabilities: ProviderCapabilities = GITHUB_CAPABILITIES
  private readonly reader: GitHubReader

  constructor(
    private readonly client: GitHubClient,
    public readonly repo: RepoRef,
  ) {
    this.reader = new GitHubReader(client, repo)
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
    return applyPlanToGitHub(this.client, this.repo, input)
  }

  listBranches(prefix?: string): Promise<Branch[]> {
    return listBranchesOp(this.client, this.repo, prefix)
  }
  createBranch(name: string, fromRef?: string): Promise<void> {
    const resolved = fromRef ?? 'main'
    return createBranchOp(this.client, this.repo, name, resolved)
  }
  deleteBranch(name: string): Promise<void> {
    return deleteBranchOp(this.client, this.repo, name)
  }
  getBranchDiff(branch: string, base?: string): Promise<FileDiff[]> {
    const resolved = base ?? 'main'
    return getBranchDiffOp(this.client, this.repo, branch, resolved)
  }
  mergeBranch(branch: string, into: string): Promise<MergeResult> {
    return mergeBranchOp(this.client, this.repo, branch, into)
  }
  isMerged(branch: string, into?: string): Promise<boolean> {
    const resolved = into ?? 'main'
    return isMergedOp(this.client, this.repo, branch, resolved)
  }
  getDefaultBranch(): Promise<string> {
    return getDefaultBranchOp(this.client, this.repo)
  }
}
