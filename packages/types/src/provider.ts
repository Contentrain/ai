import type { SyncResult } from './index.js'

// ─── Repository Provider Contracts ───
//
// Shared interfaces for the provider-agnostic content repository model used
// by @contentrain/mcp. They live in @contentrain/types so third-party tools
// can implement a custom RepoProvider (e.g. for a private git host, an
// internal service, a mock in a test suite) without depending on MCP
// internals.
//
// @contentrain/mcp re-exports every symbol here from
// @contentrain/mcp/core/contracts so existing consumers do not have to
// migrate imports.

// ─── File change ───

/**
 * A single file change within a plan.
 *
 * - `content: string` — write or overwrite the file with this UTF-8 content.
 * - `content: null` — delete the file.
 *
 * Paths are content-root relative, use forward slashes, and must not contain
 * `..` segments or absolute anchors. Providers are responsible for resolving
 * paths against their backing store (worktree, git tree, etc.).
 */
export interface FileChange {
  path: string
  content: string | null
}

// ─── Capabilities ───

/**
 * Capabilities describe what a provider can and cannot do. Operations check
 * required capabilities before running. Normalize extract needs `sourceRead`;
 * normalize reuse needs `sourceWrite`; submit needs `pushRemote`; AST scans
 * need `astScan` (which implies a local working tree).
 *
 * The consistent position is: all git hosts are commodity MIT providers; the
 * distinction between providers is operational (how they read/write), not
 * commercial. Enterprise features live in Studio, not in capability gates.
 */
export interface ProviderCapabilities {
  /** Provider backs onto a local worktree and can selectively sync changes into the developer's working tree. */
  localWorktree: boolean
  /** Provider can read arbitrary source files outside `.contentrain/`. Required for normalize extract. */
  sourceRead: boolean
  /** Provider can write arbitrary source files outside `.contentrain/`. Required for normalize reuse. */
  sourceWrite: boolean
  /** Provider can push commits to a remote. Required for submit. */
  pushRemote: boolean
  /** Provider detects branch protection rules on the remote. */
  branchProtection: boolean
  /** Provider can open a pull request as a merge fallback when branch protection blocks direct merge. */
  pullRequestFallback: boolean
  /** Provider can execute AST scanners against source files. Implies local disk access. */
  astScan: boolean
}

/** Capability set for the LocalProvider (simple-git + worktree). */
export const LOCAL_CAPABILITIES: ProviderCapabilities = {
  localWorktree: true,
  sourceRead: true,
  sourceWrite: true,
  pushRemote: true,
  branchProtection: false,
  pullRequestFallback: false,
  astScan: true,
}

// ─── Reader ───

/**
 * Read-only interface to a content repository.
 *
 * Paths are relative to the repository's content root (e.g.
 * `.contentrain/config.json`). The `ref` parameter is a branch name, tag,
 * or commit SHA. Providers that operate on a single working tree
 * (LocalReader) ignore `ref`; API-backed providers use it to resolve the
 * correct revision.
 *
 * `readFile` and `listDirectory` deliberately have different error semantics:
 * - `readFile` THROWS when the file is missing so callers must opt into
 *   tolerance explicitly (typically with a try/catch returning a default).
 * - `listDirectory` returns `[]` for a missing directory because the empty
 *   case is the common, uninteresting one.
 */
export interface RepoReader {
  /**
   * Read a file's contents as UTF-8.
   * @throws when the file does not exist or cannot be read.
   */
  readFile(path: string, ref?: string): Promise<string>

  /**
   * List file and directory names directly under `path`. Does not recurse.
   * Returns an empty array when the directory does not exist.
   */
  listDirectory(path: string, ref?: string): Promise<string[]>

  /** Check whether a file or directory exists at `path`. */
  fileExists(path: string, ref?: string): Promise<boolean>
}

// ─── Writer ───

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
  /**
   * Optional base branch. Defaults to the Contentrain content-tracking
   * branch (`CONTENTRAIN_BRANCH` — the `contentrain` ref) — NOT the
   * repository's default branch. This is the single source of truth for
   * content state; every feature branch forks from it. Pass an explicit
   * `base` only when you know you want to bypass the invariant.
   */
  base?: string
}

/**
 * Write-side interface. Providers implement this to persist a set of file
 * changes as a single atomic commit. LocalProvider writes through a worktree
 * and `git commit`; API-backed providers post to the Git Data API or
 * equivalent.
 */
export interface RepoWriter {
  applyPlan(input: ApplyPlanInput): Promise<Commit>
}

// ─── Branch / diff / merge ───

export interface Branch {
  name: string
  sha: string
  protected?: boolean
}

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'removed'
  before: string | null
  after: string | null
}

export interface MergeResult {
  merged: boolean
  sha: string | null
  pullRequestUrl: string | null
  /**
   * Selective-sync bookkeeping — only populated by providers that back onto
   * a local worktree (LocalProvider). Remote-API providers (GitHub, GitLab,
   * etc.) omit it because they do not touch a developer's working tree.
   */
  sync?: SyncResult
}

// ─── Provider (full surface) ───

/**
 * A content repository provider — the unified surface that MCP tools drive.
 *
 * Implementations wrap a git backend:
 *
 * - `LocalProvider` — simple-git + temp worktree + selective sync
 * - `GitHubProvider` — Octokit Git Data API (no clone)
 * - `GitLabProvider` — gitbeaker REST client (no clone)
 * - `BitbucketProvider` — planned, coming soon
 *
 * Providers are commodity and all live in MIT.
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
