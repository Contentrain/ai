import type { RepoReader } from '../../core/contracts/index.js'
import { isNotFoundError, resolveRepoPath } from '../shared/index.js'
import type { GitLabClient } from './client.js'
import type { ProjectRef } from './types.js'

/**
 * GitLabReader — `RepoReader` backed by the GitLab REST API.
 *
 * File reads go through `RepositoryFiles.showRaw`, which returns the
 * file content as UTF-8 text (or a `Blob` on browser/edge runtimes we
 * decode with `.text()`). Directory listings go through
 * `Repositories.allRepositoryTrees`. `fileExists` tries the file
 * endpoint first and falls back to a tree listing so directories
 * resolve to `true` as well — matching LocalReader / GitHubReader.
 *
 * `ref` is forwarded verbatim and may be a branch name, tag name or
 * commit SHA. Callers should always pass the explicit `contentrain`
 * tracking branch; GitLab's default resolution is the project's
 * default branch, which is usually wrong for Contentrain flows.
 */
export class GitLabReader implements RepoReader {
  constructor(
    private readonly client: GitLabClient,
    private readonly project: ProjectRef,
  ) {}

  async readFile(path: string, ref?: string): Promise<string> {
    const repoPath = resolveRepoPath(this.project.contentRoot, path)
    const resolvedRef = ref ?? await this.resolveDefaultRef()
    const raw = await this.client.RepositoryFiles.showRaw(
      this.project.projectId,
      repoPath,
      resolvedRef,
    )
    if (typeof raw === 'string') return raw
    // Browser / edge runtimes return a Blob; decode as UTF-8.
    return (raw as Blob).text()
  }

  async listDirectory(path: string, ref?: string): Promise<string[]> {
    const repoPath = resolveRepoPath(this.project.contentRoot, path)
    const resolvedRef = ref ?? await this.resolveDefaultRef()
    try {
      const entries = await this.client.Repositories.allRepositoryTrees(
        this.project.projectId,
        {
          path: repoPath,
          ref: resolvedRef,
          perPage: 100,
          recursive: false,
        },
      )
      return Array.isArray(entries) ? entries.map(e => e.name) : []
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }
  }

  async fileExists(path: string, ref?: string): Promise<boolean> {
    const repoPath = resolveRepoPath(this.project.contentRoot, path)
    const resolvedRef = ref ?? await this.resolveDefaultRef()

    // 1. Try as a file — cheap and most common case for Contentrain.
    try {
      await this.client.RepositoryFiles.show(
        this.project.projectId,
        repoPath,
        resolvedRef,
      )
      return true
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }

    // 2. Fall back to a tree listing — directories and empty dirs show
    //    up here. Any non-404 result means the path resolves.
    try {
      const entries = await this.client.Repositories.allRepositoryTrees(
        this.project.projectId,
        { path: repoPath, ref: resolvedRef, perPage: 1 },
      )
      return Array.isArray(entries) && entries.length > 0
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  private async resolveDefaultRef(): Promise<string> {
    const project = await this.client.Projects.show(this.project.projectId) as { default_branch?: string }
    return project.default_branch ?? 'main'
  }
}

