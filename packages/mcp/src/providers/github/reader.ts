import type { RepoReader } from '../../core/contracts/index.js'
import { isNotFoundError, resolveRepoPath } from '../shared/index.js'
import type { GitHubClient } from './client.js'
import type { RepoRef } from './types.js'

/**
 * GitHubReader — `RepoReader` backed by the GitHub Repos + Git Data APIs.
 *
 * Reads pass through `repos.getContent`; directories return a list of
 * names, files return decoded UTF-8 text. Files larger than ~1 MB are
 * fetched by blob SHA through `git.getBlob` because `getContent` omits
 * the body in that case.
 *
 * `ref` is forwarded verbatim and may be a branch name, tag name or
 * commit SHA. When omitted, GitHub resolves to the repository's default
 * branch — which is usually wrong for Contentrain flows, so callers
 * should always pass the explicit `contentrain` tracking branch.
 *
 * Pass `{ memoize: true }` to dedupe reads within one operation: a repeated
 * `(path, ref)` returns the in-flight/cached promise instead of a fresh
 * `getContent`. This is OPT-IN and only safe for a SHORT-LIVED, read-only
 * reader — a long-lived reader that outlives a write would serve stale
 * results, so the provider's own reader never enables it. Failed reads are
 * evicted so a transient error is retried, not cached forever.
 */
export class GitHubReader implements RepoReader {
  private readonly fileMemo = new Map<string, Promise<string>>()
  private readonly listMemo = new Map<string, Promise<string[]>>()
  private readonly existsMemo = new Map<string, Promise<boolean>>()

  constructor(
    private readonly client: GitHubClient,
    private readonly repo: RepoRef,
    private readonly opts?: { memoize?: boolean },
  ) {}

  /**
   * Run `fetch` through the given memo when memoization is enabled, keyed by
   * `(ref, repoPath)`. A rejected promise is evicted so the next call retries.
   */
  private memoized<T>(memo: Map<string, Promise<T>>, repoPath: string, ref: string | undefined, fetch: () => Promise<T>): Promise<T> {
    if (!this.opts?.memoize) return fetch()
    const key = `${ref ?? ''}:${repoPath}`
    const cached = memo.get(key)
    if (cached) return cached
    const promise = fetch()
    memo.set(key, promise)
    promise.catch(() => memo.delete(key))
    return promise
  }

  async readFile(path: string, ref?: string): Promise<string> {
    const repoPath = resolveRepoPath(this.repo.contentRoot, path)
    return this.memoized(this.fileMemo, repoPath, ref, () => this.readFileUncached(path, repoPath, ref))
  }

  private async readFileUncached(path: string, repoPath: string, ref?: string): Promise<string> {
    const response = await this.client.rest.repos.getContent({
      owner: this.repo.owner,
      repo: this.repo.name,
      path: repoPath,
      ref,
    })
    const data = response.data
    if (Array.isArray(data)) {
      throw new Error(`GitHubReader: path "${path}" is a directory, not a file`)
    }
    if (data.type !== 'file') {
      throw new Error(`GitHubReader: path "${path}" is a ${data.type}, not a file`)
    }

    // GitHub omits content for files > 1 MB — fall back to blob fetch.
    if (data.content === '' && data.size > 0) {
      const blob = await this.client.rest.git.getBlob({
        owner: this.repo.owner,
        repo: this.repo.name,
        file_sha: data.sha,
      })
      if (blob.data.encoding !== 'base64') {
        throw new Error(`GitHubReader: unexpected blob encoding "${blob.data.encoding}" for ${path}`)
      }
      return Buffer.from(blob.data.content, 'base64').toString('utf-8')
    }

    if (data.encoding !== 'base64') {
      throw new Error(`GitHubReader: unexpected encoding "${data.encoding}" for ${path}`)
    }
    return Buffer.from(data.content, 'base64').toString('utf-8')
  }

  async listDirectory(path: string, ref?: string): Promise<string[]> {
    const repoPath = resolveRepoPath(this.repo.contentRoot, path)
    return this.memoized(this.listMemo, repoPath, ref, async () => {
      try {
        const response = await this.client.rest.repos.getContent({
          owner: this.repo.owner,
          repo: this.repo.name,
          path: repoPath,
          ref,
        })
        const data = response.data
        if (!Array.isArray(data)) return []
        return data.map(entry => entry.name)
      } catch (error) {
        if (isNotFoundError(error)) return []
        throw error
      }
    })
  }

  async fileExists(path: string, ref?: string): Promise<boolean> {
    const repoPath = resolveRepoPath(this.repo.contentRoot, path)
    return this.memoized(this.existsMemo, repoPath, ref, async () => {
      try {
        await this.client.rest.repos.getContent({
          owner: this.repo.owner,
          repo: this.repo.name,
          path: repoPath,
          ref,
        })
        return true
      } catch (error) {
        if (isNotFoundError(error)) return false
        throw error
      }
    })
  }
}
