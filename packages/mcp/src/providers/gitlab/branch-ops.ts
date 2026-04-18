import type { Branch, FileDiff, MergeResult } from '../../core/contracts/index.js'
import type { GitLabClient } from './client.js'
import type { ProjectRef } from './types.js'

/**
 * Branch / merge / diff helpers backed by the GitLab REST API.
 *
 * Pure functions so they can be composed into `GitLabProvider` or used
 * standalone. 404s collapse to empty-ish results where that matches
 * the `RepoProvider` contract (missing branch prefix → `[]`).
 *
 * Merge semantics: GitLab does not expose a direct branch-to-branch
 * merge endpoint. Every merge flows through a merge request, so
 * `mergeBranch` opens an MR and immediately accepts it. The resulting
 * `MergeResult` mirrors GitHub's `repos.merge` return shape — callers
 * see the same `{ merged, sha, pullRequestUrl }` envelope either way,
 * with the MR URL available for audit.
 */

export async function getDefaultBranch(
  client: GitLabClient,
  project: ProjectRef,
): Promise<string> {
  const p = await client.Projects.show(project.projectId) as { default_branch?: string }
  return p.default_branch ?? 'main'
}

export async function listBranches(
  client: GitLabClient,
  project: ProjectRef,
  prefix?: string,
): Promise<Branch[]> {
  // Gitbeaker's `all` supports a `search` string (substring match). For
  // Contentrain's `cr/*` naming the substring case is equivalent to a
  // prefix because the slug never appears anywhere except at the start.
  // Server-side filter + client-side prefix enforcement keeps us
  // correct even if the substring coincidence breaks someday.
  const options: Record<string, unknown> = {
    perPage: 100,
    maxPages: 10,
  }
  if (prefix) options.search = prefix

  const rawBranches = await client.Branches.all(project.projectId, options)
  const branches = Array.isArray(rawBranches) ? rawBranches : []

  return branches
    .filter((b: { name: string }) => !prefix || b.name.startsWith(prefix))
    .map((b: { name: string, commit: { id: string }, protected?: boolean }) => ({
      name: b.name,
      sha: b.commit.id,
      protected: b.protected ?? false,
    }))
}

export async function createBranch(
  client: GitLabClient,
  project: ProjectRef,
  name: string,
  fromRef: string,
): Promise<void> {
  await client.Branches.create(project.projectId, name, fromRef)
}

export async function deleteBranch(
  client: GitLabClient,
  project: ProjectRef,
  name: string,
): Promise<void> {
  await client.Branches.remove(project.projectId, name)
}

export async function getBranchDiff(
  client: GitLabClient,
  project: ProjectRef,
  branch: string,
  base: string,
): Promise<FileDiff[]> {
  const response = await client.Repositories.compare(
    project.projectId,
    base,
    branch,
    { straight: false },
  )
  const diffs = Array.isArray(response.diffs) ? response.diffs : []
  return diffs.map((d: { new_path: string, old_path: string, new_file?: boolean, deleted_file?: boolean }) => ({
    path: d.new_file ? d.new_path : d.old_path,
    status: d.deleted_file ? 'removed' : d.new_file ? 'added' : 'modified',
    before: null,
    after: null,
  }))
}

export async function mergeBranch(
  client: GitLabClient,
  project: ProjectRef,
  branch: string,
  into: string,
): Promise<MergeResult> {
  // 1. Open MR — GitLab rejects create when source === target or when
  //    an MR is already open for this pair. Let the error propagate in
  //    those cases; the caller retries or surfaces the message.
  const mr = await client.MergeRequests.create(
    project.projectId,
    branch,
    into,
    `[contentrain] merge ${branch} → ${into}`,
    { removeSourceBranch: false },
  )

  // 2. Accept the MR immediately. `shouldRemoveSourceBranch: false`
  //    preserves the feature branch so audit/retry logic still has
  //    access to it; Studio's cleanup flow deletes it separately.
  const accepted = await client.MergeRequests.accept(
    project.projectId,
    (mr as { iid: number }).iid,
    { shouldRemoveSourceBranch: false, squash: false },
  )

  const mergeSha = (accepted as { merge_commit_sha?: string | null, sha?: string | null }).merge_commit_sha
    ?? (accepted as { sha?: string | null }).sha
    ?? null
  const webUrl = (mr as { web_url?: string }).web_url ?? null

  return { merged: mergeSha !== null, sha: mergeSha, pullRequestUrl: webUrl }
}

export async function isMerged(
  client: GitLabClient,
  project: ProjectRef,
  branch: string,
  into: string,
): Promise<boolean> {
  // compare(from=into, to=branch) — commits list is empty when branch
  // is fully contained in into (i.e. already merged).
  const response = await client.Repositories.compare(
    project.projectId,
    into,
    branch,
    { straight: false },
  )
  const commits = Array.isArray(response.commits) ? response.commits : []
  return commits.length === 0
}
