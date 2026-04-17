import type { ApplyPlanInput, Commit, FileChange } from '../../core/contracts/index.js'
import { isNotFoundError, resolveRepoPath } from '../shared/index.js'
import type { GitLabClient } from './client.js'
import type { ProjectRef } from './types.js'

type CommitActionType = 'create' | 'update' | 'delete'

interface CommitAction {
  action: CommitActionType
  filePath: string
  content?: string
  encoding?: 'text' | 'base64'
}

/**
 * Apply a plan to a GitLab repository as a single atomic commit via the
 * Commits API. High-level flow:
 *
 * 1. Check whether the target branch exists. If it does not, GitLab's
 *    `startBranch` option forks a new branch from `input.base` (or the
 *    project's default branch) as part of the same commit.
 * 2. For each `FileChange`, figure out the right GitLab action verb
 *    (`create` vs `update` vs `delete`) by probing the path against the
 *    resolved ref. GitLab validates this server-side and returns a 400
 *    for mismatches — we avoid the round trip by getting it right up
 *    front.
 * 3. POST `/repository/commits` once with the full action set. No
 *    working tree, no multi-call tree-assembly dance — GitLab exposes
 *    a richer primitive than the GitHub Git Data API for this case.
 *
 * The commit is durable as soon as the call returns; GitLab's ref
 * update happens inside the same request.
 */
export async function applyPlanToGitLab(
  client: GitLabClient,
  project: ProjectRef,
  input: ApplyPlanInput,
): Promise<Commit> {
  const branchExists = await branchHasRef(client, project, input.branch)
  const baseBranch = input.base ?? await resolveDefaultBranch(client, project)

  // Actions are computed against the HEAD of the feature branch when it
  // exists, otherwise against the fork point (baseBranch). GitLab
  // treats `create` / `update` / `delete` as a strict check against the
  // path's existence at that ref.
  const refForActionResolution = branchExists ? input.branch : baseBranch
  const rawActions = await Promise.all(
    input.changes.map(change => resolveAction(client, project, refForActionResolution, change)),
  )
  const actions = rawActions.filter((a): a is CommitAction => a !== null)

  if (actions.length === 0) {
    // Nothing to apply. Callers don't generally build empty plans, but
    // if they do we short-circuit before touching the API.
    throw new Error('applyPlanToGitLab: plan contained no applicable actions')
  }

  const options: Record<string, unknown> = {
    authorName: input.author.name,
    authorEmail: input.author.email,
  }
  if (!branchExists) {
    options.startBranch = baseBranch
  }

  const response = await client.Commits.create(
    project.projectId,
    input.branch,
    input.message,
    actions,
    options,
  )

  // Gitbeaker's generic-heavy response type widens string fields to
  // `string | Camelize<…>` — at runtime they are always strings under
  // the default (non-camelize) response mode we use. Cast narrows the
  // shape we actually touch.
  const commit = response as {
    id: string
    message?: string
    author_name?: string
    author_email?: string
    created_at?: string
  }
  const commitTimestamp = toIsoTimestamp(commit.created_at) ?? new Date().toISOString()
  return {
    sha: commit.id,
    message: commit.message ?? input.message,
    author: {
      name: commit.author_name ?? input.author.name,
      email: commit.author_email ?? input.author.email,
    },
    timestamp: commitTimestamp,
  }
}

async function resolveAction(
  client: GitLabClient,
  project: ProjectRef,
  ref: string,
  change: FileChange,
): Promise<CommitAction | null> {
  const filePath = resolveRepoPath(project.contentRoot, change.path)
  const exists = await fileExistsAtRef(client, project, filePath, ref)

  if (change.content === null) {
    // Filter out deletes against non-existent files — GitLab returns
    // 400 otherwise. The plan author asked us to "make this file not
    // exist", which is already satisfied.
    if (!exists) return null
    return { action: 'delete', filePath }
  }

  return {
    action: exists ? 'update' : 'create',
    filePath,
    content: change.content,
    encoding: 'text',
  }
}

async function branchHasRef(
  client: GitLabClient,
  project: ProjectRef,
  branch: string,
): Promise<boolean> {
  try {
    await client.Branches.show(project.projectId, branch)
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    throw error
  }
}

async function fileExistsAtRef(
  client: GitLabClient,
  project: ProjectRef,
  filePath: string,
  ref: string,
): Promise<boolean> {
  try {
    await client.RepositoryFiles.show(project.projectId, filePath, ref)
    return true
  } catch (error) {
    if (isNotFoundError(error)) return false
    throw error
  }
}

async function resolveDefaultBranch(
  client: GitLabClient,
  project: ProjectRef,
): Promise<string> {
  const p = await client.Projects.show(project.projectId) as { default_branch?: string }
  return p.default_branch ?? 'main'
}

function toIsoTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

