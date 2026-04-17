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
  base?: string     // Defaults to provider's content-tracking branch
}
```

`changes` entries are `{ path, content }`; `content: null` means delete. Providers are responsible for resolving paths against their backing store and translating the change set into whatever commit primitive the backend supports.

## Branch ops

Providers extend `RepoReader` and `RepoWriter` with branch / merge / diff operations to form the full `RepoProvider`:

```ts
interface RepoProvider extends RepoReader, RepoWriter {
  readonly capabilities: ProviderCapabilities

  listBranches(prefix?: string): Promise<Branch[]>
  createBranch(name: string, fromRef?: string): Promise<void>
  deleteBranch(name: string): Promise<void>
  getBranchDiff(branch: string, base?: string): Promise<FileDiff[]>
  mergeBranch(branch: string, into: string): Promise<MergeResult>
  isMerged(branch: string, into?: string): Promise<boolean>
  getDefaultBranch(): Promise<string>
}
```

`MergeResult` is `{ merged, sha, pullRequestUrl }`. GitHub's `repos.merge` fills `sha`; GitLab's MR-based flow fills both `sha` and `pullRequestUrl`; a provider that hits branch protection returns `merged: false` with a `pullRequestUrl` so the caller can delegate.

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

`LOCAL_CAPABILITIES` is exported from `@contentrain/types` for ergonomic use in custom providers that back onto the local filesystem.

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
