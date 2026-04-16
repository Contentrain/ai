import type { Branch, FileDiff, MergeResult } from './branch.js'
import type { ProviderCapabilities } from './capabilities.js'
import type { RepoReader } from './repo-reader.js'
import type { RepoWriter } from './repo-writer.js'

/**
 * A content repository provider — the unified surface that MCP tools (Phase 2+)
 * drive. Implementations wrap a git backend:
 *
 * - `LocalProvider` (Phase 3) — simple-git + temp worktree + selective sync
 * - `GitHubProvider` (Phase 5) — Octokit Git Data API (no clone)
 * - `GitLabProvider` (Phase 8) — gitbeaker REST client
 * - `BitbucketProvider` (Phase 8) — Bitbucket REST v2
 *
 * Providers are commodity and all live in MIT — see `.internal/refactor/00-principles.md`.
 */
export interface RepoProvider extends RepoReader, RepoWriter {
  readonly capabilities: ProviderCapabilities

  listBranches(prefix?: string): Promise<Branch[]>
  createBranch(name: string, fromRef?: string): Promise<void>
  deleteBranch(name: string): Promise<void>
  getBranchDiff(branch: string, base?: string): Promise<FileDiff[]>
  mergeBranch(branch: string, into: string): Promise<MergeResult>
  isMerged(branch: string, into?: string): Promise<boolean>
  getDefaultBranch(): Promise<string>
}
