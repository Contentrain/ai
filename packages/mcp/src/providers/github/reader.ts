import type { RepoReader } from '../../core/contracts/index.js'
import type { GitHubClient } from './client.js'
import { resolveRepoPath } from './paths.js'
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
 */
export class GitHubReader implements RepoReader {
  constructor(
    private readonly client: GitHubClient,
    private readonly repo: RepoRef,
  ) {}

  async readFile(path: string, ref?: string): Promise<string> {
    const repoPath = resolveRepoPath(this.repo.contentRoot, path)
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
      if (isNotFound(error)) return []
      throw error
    }
  }

  async fileExists(path: string, ref?: string): Promise<boolean> {
    const repoPath = resolveRepoPath(this.repo.contentRoot, path)
    try {
      await this.client.rest.repos.getContent({
        owner: this.repo.owner,
        repo: this.repo.name,
        path: repoPath,
        ref,
      })
      return true
    } catch (error) {
      if (isNotFound(error)) return false
      throw error
    }
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404
}
