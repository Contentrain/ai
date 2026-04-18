import type { Branch, FileDiff, MergeResult } from '../../core/contracts/index.js'
import type { GitHubClient } from './client.js'
import type { RepoRef } from './types.js'

/**
 * Branch/merge/diff helpers backed by the Repos and Git Data APIs.
 *
 * Pure functions so they can be composed into `GitHubProvider` or used
 * standalone. All throw on non-404 errors; 404s collapse to empty-ish
 * results where that matches the `RepoProvider` contract (e.g. a
 * missing branch prefix yields `[]` rather than raising).
 */

export async function getDefaultBranch(client: GitHubClient, repo: RepoRef): Promise<string> {
  const response = await client.rest.repos.get({ owner: repo.owner, repo: repo.name })
  return response.data.default_branch
}

export async function listBranches(
  client: GitHubClient,
  repo: RepoRef,
  prefix?: string,
): Promise<Branch[]> {
  const branches: Branch[] = []
  const iterator = client.paginate.iterator(client.rest.repos.listBranches, {
    owner: repo.owner,
    repo: repo.name,
    per_page: 100,
  })
  for await (const page of iterator) {
    for (const b of page.data) {
      if (prefix && !b.name.startsWith(prefix)) continue
      branches.push({ name: b.name, sha: b.commit.sha, protected: b.protected })
    }
  }
  return branches
}

export async function createBranch(
  client: GitHubClient,
  repo: RepoRef,
  name: string,
  fromRef: string,
): Promise<void> {
  const base = await client.rest.git.getRef({
    owner: repo.owner,
    repo: repo.name,
    ref: `heads/${fromRef}`,
  })
  await client.rest.git.createRef({
    owner: repo.owner,
    repo: repo.name,
    ref: `refs/heads/${name}`,
    sha: base.data.object.sha,
  })
}

export async function deleteBranch(
  client: GitHubClient,
  repo: RepoRef,
  name: string,
): Promise<void> {
  await client.rest.git.deleteRef({
    owner: repo.owner,
    repo: repo.name,
    ref: `heads/${name}`,
  })
}

export async function getBranchDiff(
  client: GitHubClient,
  repo: RepoRef,
  branch: string,
  base: string,
): Promise<FileDiff[]> {
  const response = await client.rest.repos.compareCommits({
    owner: repo.owner,
    repo: repo.name,
    base,
    head: branch,
  })
  const files = response.data.files ?? []
  return files.map(f => ({
    path: f.filename,
    status: normaliseStatus(f.status),
    before: null,
    after: null,
  }))
}

export async function mergeBranch(
  client: GitHubClient,
  repo: RepoRef,
  branch: string,
  into: string,
): Promise<MergeResult> {
  try {
    const response = await client.rest.repos.merge({
      owner: repo.owner,
      repo: repo.name,
      base: into,
      head: branch,
    })
    return { merged: true, sha: response.data.sha, pullRequestUrl: null }
  } catch (error) {
    if (isNotModified(error)) {
      return { merged: true, sha: null, pullRequestUrl: null }
    }
    throw error
  }
}

export async function isMerged(
  client: GitHubClient,
  repo: RepoRef,
  branch: string,
  into: string,
): Promise<boolean> {
  const response = await client.rest.repos.compareCommits({
    owner: repo.owner,
    repo: repo.name,
    base: into,
    head: branch,
  })
  return response.data.ahead_by === 0
}

function normaliseStatus(status: string): FileDiff['status'] {
  if (status === 'added') return 'added'
  if (status === 'removed') return 'removed'
  return 'modified'
}

function isNotModified(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 204
}
