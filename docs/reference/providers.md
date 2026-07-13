---
title: RepoProvider Reference
description: The RepoProvider contract — RepoReader, RepoWriter, branch operations, and the capability manifest — as exposed from @contentrain/types.
slug: providers
---

# RepoProvider Reference

Contentrain's provider-agnostic engine is defined by a small set of interfaces in `@contentrain/types`. Third-party tools can implement a custom `RepoProvider` (for a private git host, an internal service, a test harness) without taking a dependency on `@contentrain/mcp`.

The canonical source lives in `packages/types/src/provider.ts`. `@contentrain/mcp/core/contracts` re-exports every symbol for backward compatibility.

## RepoReader

Read-only surface — three methods. Paths are content-root relative; `ref` is a branch name, tag, or commit SHA.

```ts
interface RepoReader {
  readFile(path: string, ref?: string): Promise<string>
  listDirectory(path: string, ref?: string): Promise<string[]>
  fileExists(path: string, ref?: string): Promise<boolean>
}
```

Error semantics:

- `readFile` **throws** when the file is missing. Callers opt into tolerance with an explicit try/catch.
- `listDirectory` returns `[]` for a missing directory. The empty case is the common, uninteresting one.

## RepoWriter

Write surface — one method, one atomic commit per call.

```ts
interface RepoWriter {
  applyPlan(input: ApplyPlanInput): Promise<Commit>
}

interface ApplyPlanInput {
  branch: string
  changes: FileChange[]
  message: string
  author: CommitAuthor
  base?: string     // Defaults to CONTENTRAIN_BRANCH ('contentrain')
}
```

`changes` entries are `{ path, content }`; `content: null` means delete. Providers are responsible for resolving paths against their backing store and translating the change set into whatever commit primitive the backend supports.

## Branch operations

Providers extend `RepoReader` and `RepoWriter` with branch / merge / diff operations to form the full `RepoProvider`:

```ts
interface RepoProvider extends RepoReader, RepoWriter {
  readonly capabilities: ProviderCapabilities

  // Optional per-project public media delivery base (project segment included).
  // When set by a hosted provider, the content-write path normalizes relative
  // `media/...` references to absolute delivery URLs. Undefined for local/CLI
  // providers, where media stays a relative path.
  readonly mediaBaseUrl?: string

  // Optional media facet. Present only on providers whose backend exposes a
  // media stack (e.g. Studio MCP Cloud); drives the `contentrain_media_*`
  // tools, which are not registered when this is absent.
  readonly media?: MediaProvider

  listBranches(prefix?: string): Promise<Branch[]>
  createBranch(name: string, fromRef?: string): Promise<void>
  deleteBranch(name: string): Promise<void>
  getBranchDiff(branch: string, base?: string): Promise<FileDiff[]>
  // opts.removeSourceBranch deletes the source after a successful merge
  // (opt-in, best-effort — reported via MergeResult.remote). Long-lived
  // branches (into, contentrain, the default branch) are never deleted.
  mergeBranch(branch: string, into: string, opts?: { removeSourceBranch?: boolean }): Promise<MergeResult>
  isMerged(branch: string, into?: string): Promise<boolean>
  getDefaultBranch(): Promise<string>
}
```

`MergeResult` is `{ merged, sha, pullRequestUrl, sync?, remote? }`. GitHubProvider fills `sha` on direct merges; GitLabProvider fills both `sha` and `pullRequestUrl` (merges via MR). LocalProvider populates `sync: SyncResult` to describe file syncing to the working tree. When branch protection blocks a direct merge, any provider may return `merged: false` with a `pullRequestUrl` fallback. `remote` reports the outcome of the optional post-merge source-branch cleanup (`deleted`, plus `skipped` for an expected no-op or `warning` for a non-fatal failure).

## Capabilities

Every provider advertises what it can do. Tools gate on capabilities and reject with `capability_required` when the active provider can't satisfy them.

```ts
interface ProviderCapabilities {
  localWorktree: boolean
  sourceRead: boolean
  sourceWrite: boolean
  pushRemote: boolean
  branchProtection: boolean
  pullRequestFallback: boolean
  astScan: boolean
}
```

Capability meanings:

| Capability | Purpose |
|---|---|
| `localWorktree` | Provider backs onto a local filesystem worktree and can selectively sync changes to developer's working tree |
| `sourceRead` | Provider can read arbitrary source files outside `.contentrain/` (required for normalize extract) |
| `sourceWrite` | Provider can write arbitrary source files outside `.contentrain/` (required for normalize reuse) |
| `pushRemote` | Provider can push commits to a remote repository (required for submit) |
| `branchProtection` | Provider detects branch protection rules on the remote |
| `pullRequestFallback` | Provider can open a pull request as a fallback when direct merge is blocked |
| `astScan` | Provider can execute AST scanners against source files (implies local disk access) |

Built-in capability sets:

| Capability | LocalProvider | GitHubProvider | GitLabProvider |
|---|---|---|---|
| `localWorktree` | ✓ | — | — |
| `sourceRead` | ✓ | — | — |
| `sourceWrite` | ✓ | — | — |
| `pushRemote` | ✓ | ✓ | ✓ |
| `branchProtection` | — | ✓ | ✓ |
| `pullRequestFallback` | — | ✓ | ✓ |
| `astScan` | ✓ | — | — |

`LOCAL_CAPABILITIES` is exported from `@contentrain/types` for ergonomic use in custom providers that back onto the local filesystem:

```ts
export const LOCAL_CAPABILITIES: ProviderCapabilities = {
  localWorktree: true,
  sourceRead: true,
  sourceWrite: true,
  pushRemote: true,
  branchProtection: false,
  pullRequestFallback: false,
  astScan: true,
}
```

## Media facet (optional)

`RepoProvider.media` is an optional facet — not a capability flag. When a provider implements it (hosted providers such as Studio MCP Cloud), the `contentrain_media_*` tools are registered; when it is absent (Local / GitHub / GitLab), those tools never appear in `tools/list`. It is a deterministic passthrough to the backend's media stack — MCP makes no media decisions.

```ts
interface MediaProvider {
  list(opts?: MediaListOptions): Promise<MediaListResult>
  get(id: string): Promise<MediaAsset | null>
  ingest(input: MediaIngestInput): Promise<MediaAsset>   // URL-based; provider owns SSRF/MIME/size policy
  update(id: string, patch: MediaUpdateInput): Promise<MediaAsset>
  delete(id: string): Promise<void>
}

interface MediaAsset {
  id: string
  path: string          // repo-relative storage path content fields reference (media/...)
  url?: string          // absolute delivery URL when resolvable (see mediaBaseUrl)
  mime?: string
  size?: number
  alt?: string
  tags?: string[]
  createdAt?: string
  meta?: Record<string, unknown>   // provider-defined extras (dimensions, blurhash, variants)
}

interface MediaListOptions { search?: string; tag?: string; limit?: number; cursor?: string }
interface MediaListResult { assets: MediaAsset[]; nextCursor?: string; total?: number }
interface MediaIngestInput { url: string; filename?: string; alt?: string; tags?: string[] }
interface MediaUpdateInput { alt?: string; tags?: string[]; filename?: string }
```

MCP has no binary channel, so ingest is URL-based: the agent supplies a source URL and the provider fetches it server-side under its own SSRF/MIME/size policy. See [MCP Tools → Media Tools](/packages/mcp) for the tool-level reference.

## Supporting types

```ts
interface FileChange { path: string; content: string | null }

interface CommitAuthor { name: string; email: string }

interface Commit {
  sha: string
  message: string
  author: CommitAuthor
  timestamp: string     // ISO 8601
}

interface Branch { name: string; sha: string; protected?: boolean }

interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'removed'
  before: string | null
  after: string | null
}

interface MergeResult {
  merged: boolean
  sha: string | null
  pullRequestUrl: string | null
  sync?: SyncResult   // Only populated by LocalProvider
  remote?: {          // Post-merge source-branch cleanup outcome
    deleted: boolean
    skipped?: string  // Expected no-op (cleanup disabled, no remote, ref gone)
    warning?: string  // Non-fatal failure (offline, auth) — merge still succeeded
  }
}

interface SyncResult {
  synced: string[]     // Files successfully synced to working tree
  skipped: string[]    // Files skipped due to uncommitted local changes
  warning?: string     // Human-readable warning if files were skipped
}
```

## Implementing a custom provider

Minimum viable provider:

```ts
import type { RepoProvider, ProviderCapabilities } from '@contentrain/types'
import { LOCAL_CAPABILITIES } from '@contentrain/types'

class MyProvider implements RepoProvider {
  readonly capabilities: ProviderCapabilities = {
    ...LOCAL_CAPABILITIES,
    // override what your backend actually supports
    astScan: false,
  }

  async readFile(path: string, ref?: string): Promise<string> { /* ... */ }
  async listDirectory(path: string, ref?: string): Promise<string[]> { /* ... */ }
  async fileExists(path: string, ref?: string): Promise<boolean> { /* ... */ }
  async applyPlan(input): Promise<Commit> { /* one atomic commit */ }

  async listBranches(prefix?: string) { /* ... */ }
  async createBranch(name, fromRef?) { /* ... */ }
  async deleteBranch(name) { /* ... */ }
  async getBranchDiff(branch, base?) { /* ... */ }
  async mergeBranch(branch, into) { /* ... */ }
  async isMerged(branch, into?) { /* ... */ }
  async getDefaultBranch() { /* ... */ }
}

// Plug it in:
import { createServer } from '@contentrain/mcp/server'
const server = createServer({ provider: new MyProvider() })
```

Any custom provider slots straight into the MCP server and the HTTP transport with no further wiring.

## Reference implementations

- `packages/mcp/src/providers/local/` — simple-git + worktree
- `packages/mcp/src/providers/github/` — Octokit over the Git Data + Repos APIs
- `packages/mcp/src/providers/gitlab/` — gitbeaker over the GitLab REST API

Each is ~400–500 lines; they're small enough to read end-to-end and mirror each other's structure. They're the recommended starting point for a new backend.
