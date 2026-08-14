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
  /**
   * Provider can write a two-parent merge commit (see
   * `RepoProvider.createMergeCommit`). Absent = false. Optional so that
   * existing external `implements` code keeps compiling: a required member
   * here would be a breaking change for every custom provider.
   */
  mergeCommit?: boolean
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
  mergeCommit: true,
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
  /**
   * What the provider did with the branch. Providers that own the merge
   * decision (a local worktree honouring the project's `workflow` setting)
   * report it here; providers that hand the branch off to an external
   * orchestrator leave it undefined, and the caller treats that as
   * `pending-review`.
   */
  workflowAction?: 'auto-merged' | 'pending-review'
  /**
   * Selective-sync bookkeeping — which files were copied into the developer's
   * working tree and which were skipped because of local edits. Only
   * providers backed by a local worktree populate it.
   */
  sync?: SyncResult
  /** Non-fatal problem encountered while completing the write. */
  warning?: string
  /**
   * Whether the base branch advanced to the contentrain tip after an
   * auto-merge. Only providers that own the base advance (a local worktree)
   * report it. `blocked_diverged` is a partial success: the content is on
   * the contentrain branch; only the fast-forward is pending.
   */
  base_advance?: BaseAdvance
  /** Outcome of pushing the contentrain branch, when the provider pushes. */
  remote_push?: RemotePush
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
  /**
   * Describes the operation that produced these changes. A provider that
   * regenerates `.contentrain/context.json` itself (the local worktree flow
   * does, after merge, single-threaded) uses it; others ignore it. It is
   * never committed on the feature branch — context.json embeds timestamps,
   * so two branches forked from the same commit would always conflict on it.
   */
  context?: { tool: string; model: string; locale?: string; entries?: string[] }
  /** Override the project's configured workflow for this write. */
  workflowOverride?: 'auto-merge' | 'review'
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
  /**
   * Outcome of the post-merge source-branch cleanup on the remote.
   * `deleted: false` with `skipped` is an expected no-op (cleanup disabled,
   * no remote, ref already gone); `warning` is a real failure (offline,
   * auth) that did NOT fail the merge itself.
   */
  remote?: {
    deleted: boolean
    skipped?: string
    warning?: string
  }
}

// ─── Base-branch advance / remote push outcomes ───

/**
 * What happened to the base branch after content landed on the
 * content-tracking branch.
 *
 * `advanced` — the base branch fast-forwarded to the contentrain tip.
 * `blocked_diverged` — the base branch holds commits that are not in
 * contentrain, so fast-forwarding was impossible. The content itself is
 * safe on the contentrain branch; only the advance is pending until the
 * branches are reconciled.
 *
 * These two values are shared vocabulary across the ecosystem — Studio
 * reports the same enum for its main-advance state. A pull request is an
 * attachment (`pullRequestUrl`), never a third state: "PR opened" is
 * `blocked_diverged` with a non-null URL.
 */
export type BaseAdvance = 'advanced' | 'blocked_diverged'

/**
 * Outcome of pushing the content-tracking branch to the configured remote.
 *
 * `pushed` — the remote accepted the push (possibly after one
 * fetch-merge-retry). `rejected` — the push failed even after the retry;
 * local and remote have diverged and need reconciling. `no-remote` — the
 * repository has no configured remote, so nothing was attempted.
 */
export type RemotePush = 'pushed' | 'rejected' | 'no-remote'

// ─── Reconcile / conflicts ───

/**
 * Machine-readable conflict kinds produced by the content-aware three-way
 * reconcile planner. CLOSED SET: consumers (Studio) key their localized
 * editor questions on these values, so a free string would drift. Adding a
 * value here is a minor version bump and MUST carry a changelog entry;
 * renaming or removing one is breaking.
 */
export type ConflictCode =
  | 'field_value_conflict' // collection/singleton: same field changed differently on both sides
  | 'dictionary_value_conflict' // same dictionary key, two different values
  | 'vocabulary_value_conflict' // same term + locale, two different translations
  | 'model_key_conflict' // same model schema key changed differently
  | 'meta_status_conflict' // both sides moved an entry's publish status differently
  | 'document_body_conflict' // both sides edited a document body (never text-merged)
  | 'frontmatter_value_conflict' // same frontmatter key, two different values
  | 'delete_edit_conflict' // one side deleted what the other edited
  | 'file_conflict' // unrecognized file changed on both sides — resolved by choosing a side

/**
 * One surviving conflict from a three-way reconcile: base (merge-base),
 * ours (content branch), theirs (base branch) disagree in a way the policy
 * table cannot resolve mechanically. Everything mechanical has already been
 * merged; only these items need a decision from an editor or agent.
 *
 * `id` is derived from the position AND the three values (see
 * `conflictId`), so a resolution made against a stale dry-run no longer
 * matches once any side changes — compare-and-set for free.
 */
export interface ConflictItem {
  id: string
  /** Content-root-relative path of the file the conflict lives in. */
  path: string
  model?: string
  kind: 'collection' | 'singleton' | 'document' | 'dictionary'
    | 'vocabulary' | 'model' | 'meta' | 'file'
  /** Entry ID, dictionary key, vocabulary term, or model schema key. */
  key?: string
  /** Field inside the entry / frontmatter key, when the conflict is field-level. */
  field?: string
  locale?: string
  /** The three values in question — for display; omitted for `kind: 'file'`. */
  base?: unknown
  ours?: unknown
  theirs?: unknown
  code: ConflictCode
  /** Ready-to-display English sentence naming the conflict. */
  message: string
  /**
   * Policy-table suggestion, never auto-applied. Present only where the
   * approved policy names a preferred side (model schema keys → `theirs`).
   */
  suggested?: 'ours' | 'theirs'
}

/**
 * A decision for one conflict, keyed by `ConflictItem.id`. `choose` picks a
 * side (absence of the item on that side means deletion); `value` supplies
 * a hand-authored replacement. A resolution whose `id` no longer matches a
 * live conflict is dropped and the conflict re-reported with a fresh id.
 */
export type ConflictResolution =
  | { id: string; choose: 'ours' | 'theirs' }
  | { id: string; value: unknown }

// ─── Media (optional provider facet) ───

/**
 * One media asset as the provider's media stack reports it. `path` is the
 * repo-relative storage path content fields reference (`media/...`); `url`
 * is the absolute delivery URL when the provider can resolve one (see
 * `RepoProvider.mediaBaseUrl`). `meta` carries provider-defined extras
 * (dimensions, blurhash, variants) without widening this contract.
 */
export interface MediaAsset {
  id: string
  path: string
  url?: string
  mime?: string
  size?: number
  alt?: string
  tags?: string[]
  createdAt?: string
  meta?: Record<string, unknown>
}

export interface MediaListOptions {
  /** Substring match on filename/path/alt. */
  search?: string
  /** Filter to assets carrying this tag. */
  tag?: string
  /** Page size — implementations may clamp. */
  limit?: number
  /** Opaque cursor from a previous `MediaListResult.nextCursor`. */
  cursor?: string
}

export interface MediaListResult {
  assets: MediaAsset[]
  nextCursor?: string
  total?: number
}

/**
 * URL-based ingest — MCP has no binary channel, so the source is always a
 * URL the provider fetches server-side. Implementations MUST enforce their
 * own SSRF, MIME, and size policies before fetching; MCP passes the input
 * through verbatim and never fetches the URL itself.
 */
export interface MediaIngestInput {
  url: string
  filename?: string
  alt?: string
  tags?: string[]
}

export interface MediaUpdateInput {
  alt?: string
  tags?: string[]
  filename?: string
}

/**
 * Optional media facet of a provider. When present on `RepoProvider.media`,
 * the MCP server registers the `contentrain_media_*` tools; when absent
 * (LocalProvider, plain GitHub/GitLab providers), those tools are not
 * listed at all. Hosted providers (Studio MCP Cloud) implement this by
 * delegating to their media stack — deterministic passthrough, no content
 * decisions in MCP.
 */
export interface MediaProvider {
  list(opts?: MediaListOptions): Promise<MediaListResult>
  get(id: string): Promise<MediaAsset | null>
  ingest(input: MediaIngestInput): Promise<MediaAsset>
  update(id: string, patch: MediaUpdateInput): Promise<MediaAsset>
  delete(id: string): Promise<void>
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
/** Result of {@link RepoProvider.checkWriteReadiness}. */
export interface WriteReadiness {
  blocked: boolean
  /** Human-readable reason, present when `blocked`. */
  message?: string
}

export interface RepoProvider extends RepoReader, RepoWriter {
  readonly capabilities: ProviderCapabilities

  /**
   * Per-project public media delivery base, e.g.
   * `https://studio.example/api/cdn/v1/{projectId}` — already includes the
   * project segment, so the content-write path only joins `{base}/{path}`.
   *
   * Set by hosted providers (Studio's MCP Cloud loopback resolves it from a
   * request header and attaches it here). When present, content writes
   * normalize relative `media/...` references — in media/image/file fields and
   * markdown bodies — to absolute delivery URLs, so external-agent writes
   * render anywhere without an SDK. Undefined for local/CLI providers, where
   * media stays a relative path (the OSS file model). Never affects reads.
   */
  readonly mediaBaseUrl?: string

  /**
   * Optional media facet. Present only on providers whose backend exposes a
   * media stack (Studio MCP Cloud); drives the `contentrain_media_*` MCP
   * tools, which are not registered when this is absent.
   */
  readonly media?: MediaProvider

  /**
   * Whether the provider will accept a write right now.
   *
   * A local worktree accumulates unmerged `cr/*` branches and eventually has
   * to refuse new ones; a hosted provider manages that server-side. Asking the
   * provider keeps the tool layer out of the business of counting git branches
   * — it previously reached through an `instanceof` check to a `projectRoot`
   * only one implementation has.
   *
   * Optional: a provider that omits it is always ready.
   */
  checkWriteReadiness?(): Promise<WriteReadiness>

  listBranches(prefix?: string): Promise<Branch[]>
  createBranch(name: string, fromRef?: string): Promise<void>
  deleteBranch(name: string): Promise<void>
  getBranchDiff(branch: string, base?: string): Promise<FileDiff[]>
  /**
   * Merge `branch` into `into`. Like `git merge` and the platform merge APIs,
   * the source branch is left in place by default. Pass
   * `opts.removeSourceBranch: true` to also delete it after a successful merge
   * (best-effort — reported via `MergeResult.remote`, never a thrown error).
   * Even when opted in, a long-lived branch is never deleted: not `into`, not
   * the `contentrain` content branch, and not the repo's default branch.
   * LocalProvider ignores the option: its cleanup is governed by
   * `config.remoteBranchCleanup` and its own `cr/*`-only guard.
   */
  mergeBranch(branch: string, into: string, opts?: { removeSourceBranch?: boolean }): Promise<MergeResult>
  isMerged(branch: string, into?: string): Promise<boolean>
  getDefaultBranch(): Promise<string>

  /**
   * The merge-base commit of two refs — the `base` input of a three-way
   * reconcile.
   *
   * Reconciling a diverged content branch needs the last common ancestor,
   * and every backend can name it (git `merge-base`, GitHub's compare API,
   * GitLab's merge_base endpoint) — but not every existing implementation
   * does yet, and demanding it would break external `implements` code.
   *
   * Optional: a provider that omits it cannot drive a reconcile; the caller
   * falls back to a pull-request flow. Returns `null` when the refs share
   * no history.
   */
  getMergeBase?(refA: string, refB: string): Promise<string | null>

  /**
   * Write a set of resolved changes as a TWO-PARENT merge commit on
   * `branch`, joining `ours` and `theirs` so that git history records the
   * reconcile — after it, `theirs` is an ancestor of `branch` and a plain
   * fast-forward advance works again. `changes` are applied on top of the
   * `ours` tree; for content-owned paths the planner's output is
   * authoritative, never a textual auto-merge.
   *
   * Optional, mirrored by `capabilities.mergeCommit`: a backend whose
   * commits API cannot express two parents (GitLab) omits it and the
   * caller falls back to a merge-request flow.
   */
  createMergeCommit?(input: {
    /** Branch whose tip becomes the merge commit (the content branch). */
    branch: string
    /** First parent — the current tip of `branch`. */
    ours: string
    /** Second parent — the ref being reconciled in. */
    theirs: string
    changes: FileChange[]
    message: string
    author: CommitAuthor
  }): Promise<Commit>
}
